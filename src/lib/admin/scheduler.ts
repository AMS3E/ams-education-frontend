// The publish clock for scheduled posts.
//
// WHY THIS EXISTS AT ALL: WP-Cron is dead on this server. WordPress has no real
// timer — it checks for due jobs on each request and runs them by calling its
// own site over HTTP, and that loopback fails here (the same failure that stops
// wp-admin's Plugin File Editor saving). MEASURED 2026-08-11: a post scheduled
// two minutes out was still `future` 266 seconds past its time, across 16
// polls, while the probe's own REST calls were triggering the check each time.
// See docs/project-context.md §3.
//
// The fix cannot live on that server — the owner has no aaPanel access, so no
// system cron and no wp-config edit. It lives HERE instead: our Next server is
// a long-lived Node process (output: "standalone" on Dokploy), so it can hold
// the clock and knock on WordPress's door from outside. An inbound request from
// the internet is an ordinary request and is unaffected by the broken loopback.
//
// NOT GitHub Actions, which was the obvious idea: this repo is private, private
// repos meter Actions minutes (2,000/mo on Free), and GitHub rounds every run
// up to a whole minute. A 5-minute cron is 8,640 runs — 8,640 minutes — several
// times the allowance before the deploy workflows take their share.

const BASE = process.env.API_BASE_URL ?? "https://infotainment.ams.com.kh/wp-json";

/** Our OWN origin, for the revalidate call below. This loopback is fine — it is
 *  WordPress's host that cannot call itself, not ours. */
const SELF = process.env.SELF_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;

/** How often the clock ticks. A minute is finer than any external free tier
 *  would give us, and the work is one REST query against a handful of rows. */
export const TICK_MS = 60_000;

/** Service credentials. The scheduler has NO logged-in user to borrow a token
 *  from — every other WordPress call in this app rides the editor's session
 *  cookie — so it needs an account of its own. Absent, the scheduler stays off
 *  rather than half-working. */
const USER = process.env.AMS_SCHEDULER_USER;
const PASS = process.env.AMS_SCHEDULER_PASS;

export function schedulerConfigured(): boolean {
  return Boolean(USER && PASS);
}

/* ---- token, minted once and reused until it expires ---------------------- */

let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  // 60s of slack so a token cannot expire mid-flight between here and the write.
  if (cached && cached.expiresAt - 60 > Date.now() / 1000) return cached.token;
  if (!USER || !PASS) return null;

  try {
    const res = await fetch(`${BASE}/wp/v2/web/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: USER, password: PASS }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { token?: string; expires_at?: number } | null;
    if (!res.ok || !json?.token) {
      console.error(`[scheduler] login failed: ${res.status}`);
      return null;
    }
    cached = {
      token: json.token,
      expiresAt: Number(json.expires_at) || Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    };
    return cached.token;
  } catch (e) {
    console.error("[scheduler] login threw:", e);
    return null;
  }
}

/* ---- the tick ------------------------------------------------------------ */

interface DuePost {
  id: number;
  slug: string;
  date_gmt: string;
  categorySlugs: string[];
}

export interface TickResult {
  checked: boolean;
  due: number;
  published: number[];
  failed: number[];
  reason?: string;
}

/**
 * THE HALF THAT IS EASY TO FORGET: a post published outside the editor never
 * runs `savePostAction`, so nothing invalidates our ISR cache. Fix the clock
 * without this and the article is live in WordPress and invisible on the site
 * until the cache happens to expire on its own.
 *
 * Goes over HTTP to our own /api/revalidate rather than calling `revalidateTag`
 * here. Two reasons, and the first is the load-bearing one: this runs in a bare
 * `setInterval` with NO request context, which is not where Next's cache
 * primitives are meant to be called. The route is a real request. It is also
 * the exact path the WordPress publish webhook already uses, so scheduled and
 * manual publishes invalidate through one tested code path instead of two.
 *
 * Tag set mirrors refreshPublic() in actions.ts — keep the two in step.
 */
async function revalidateFor(post: DuePost): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.warn(`[scheduler] REVALIDATE_SECRET unset — ${post.id} is live in WP but the site cache was NOT purged`);
    return;
  }
  const params = new URLSearchParams({ secret });
  params.append("tag", "home");
  params.append("tag", "daily-events");
  if (post.slug) params.append("tag", `article:${post.slug}`);
  for (const c of post.categorySlugs) params.append("tag", `category:${c}`);

  try {
    const res = await fetch(`${SELF}/api/revalidate?${params}`, { method: "POST", cache: "no-store" });
    if (!res.ok) console.error(`[scheduler] revalidate for ${post.id} returned ${res.status}`);
  } catch (e) {
    // A failed purge must not fail the tick — the post IS published, and
    // reporting it as failed would make the next tick try to publish it again.
    console.error(`[scheduler] revalidate for ${post.id} threw:`, e);
  }
}

/** Overlap guard. A tick that runs long (WordPress REST costs ~4s per call
 *  here) must not have the next one start on top of it and publish the same
 *  post twice. In-process only, which is enough while Dokploy runs one replica
 *  — if that ever becomes two, this needs a real lock in WordPress. */
let running = false;

export async function runSchedulerTick(): Promise<TickResult> {
  if (running) return { checked: false, due: 0, published: [], failed: [], reason: "already running" };
  if (!schedulerConfigured()) {
    return { checked: false, due: 0, published: [], failed: [], reason: "AMS_SCHEDULER_USER/PASS not set" };
  }

  running = true;
  try {
    const token = await getToken();
    if (!token) return { checked: false, due: 0, published: [], failed: [], reason: "no token" };

    const headers = { accept: "application/json", "X-AMS-Token": token };

    // Every `future` post, oldest first, filtered for "due" HERE rather than
    // with a `before=` query param. WordPress compares `before` against the
    // post date in SITE time (UTC+7) while we reason in UTC, and getting that
    // wrong publishes everything seven hours early. Fetching the queue and
    // comparing `date_gmt` ourselves removes the timezone from the question.
    // Safe at this volume: ~20 scheduled articles a week, capped at 50 a tick.
    const listUrl =
      `${BASE}/wp/v2/posts?status=future&per_page=50&orderby=date&order=asc` +
      `&_fields=id,slug,date_gmt,categories&_embed=wp:term`;

    const res = await fetch(listUrl, { headers, cache: "no-store" });
    if (!res.ok) {
      console.error(`[scheduler] list failed: ${res.status}`);
      return { checked: true, due: 0, published: [], failed: [], reason: `list ${res.status}` };
    }
    const rows = (await res.json()) as {
      id: number;
      slug: string;
      date_gmt: string;
      _embedded?: { "wp:term"?: { taxonomy: string; slug: string }[][] };
    }[];

    // Compare in UTC. `date_gmt` has no zone suffix, so it must be pinned to Z
    // explicitly — parsing it bare makes the runtime read it as LOCAL time,
    // which on a UTC+7 box publishes everything seven hours early.
    const due: DuePost[] = rows
      .filter((p) => new Date(`${p.date_gmt}Z`).getTime() <= Date.now())
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        date_gmt: p.date_gmt,
        categorySlugs: (p._embedded?.["wp:term"] ?? [])
          .flat()
          .filter((t) => t?.taxonomy === "category")
          .map((t) => t.slug),
      }));

    if (due.length === 0) return { checked: true, due: 0, published: [], failed: [] };

    const published: number[] = [];
    const failed: number[] = [];

    for (const post of due) {
      // Status only. Sending anything else risks overwriting an edit made
      // between the schedule and the fire; WordPress keeps the post's own date,
      // so the article still carries the time the editor chose.
      const upd = await fetch(`${BASE}/wp/v2/posts/${post.id}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ status: "publish" }),
        cache: "no-store",
      });
      if (!upd.ok) {
        console.error(`[scheduler] publish ${post.id} failed: ${upd.status}`);
        failed.push(post.id);
        continue;
      }
      published.push(post.id);
      await revalidateFor(post);
      console.log(`[scheduler] published ${post.id} (${post.slug}), due ${post.date_gmt}Z`);
    }

    return { checked: true, due: due.length, published, failed };
  } catch (e) {
    console.error("[scheduler] tick threw:", e);
    return { checked: false, due: 0, published: [], failed: [], reason: String(e) };
  } finally {
    running = false;
  }
}

/* ---- the loop ------------------------------------------------------------ */

let timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (timer) return;
  if (!schedulerConfigured()) {
    console.warn("[scheduler] AMS_SCHEDULER_USER/AMS_SCHEDULER_PASS not set — scheduled posts will NOT publish.");
    return;
  }
  console.log(`[scheduler] started, ticking every ${TICK_MS / 1000}s`);
  timer = setInterval(() => {
    void runSchedulerTick();
  }, TICK_MS);
  // `unref` so the interval never holds the process open on shutdown.
  timer.unref?.();
}
