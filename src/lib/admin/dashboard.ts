// Dashboard data — all read, all as the logged-in user.
//
// WHAT THIS SCREEN IS, since the shape below only makes sense with it: an
// editor's three morning questions, in order. What is blocked on me (`queue`),
// what happened since I last looked (`series` + `kpi`), what is working (`top`
// + `authors`). Until fast-api 1.6.0 it was four counters scoped to the
// logged-in user's own authorship, which measured 0 / 0 / 0 / 1 for the
// administrator account against a newsroom that had published 117 articles in
// thirty days and was sitting on 68 drafts.
//
// SCOPE is `edit_others_posts`: holders get the newsroom, everyone else gets
// their own work and `authors` comes back null. The fast path decides this
// server-side from the token's real capabilities; the REST fallback reads the
// same cap off the session, which is a UI hint rather than a boundary — safe
// here because both paths still ask WordPress only for rows the user may read.
//
// TWO THINGS THE FALLBACK CANNOT PRODUCE, and does not fake:
//   - `series` (null) — the daily numbers come from direct SQL over WPP's
//     summary table; the WPP REST API exposes per-post totals and a top-N, no
//     timeline. The chart says so rather than drawing a flat line.
//   - `authors` (null) — a leaderboard over REST would be one call per author.
// Everything else is correct on both paths, which is what makes the frontend
// safe to ship before the plugin upload.

import { adminFetch, AdminAuthError } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { countPosts, listPosts, mapFastRow, type AdminPostRow, type FastPostRow } from "./posts";
import { DEFAULT_STATUSES, clampRange, isCustomRange, type DashRange, type DashRangeSpec } from "./constants";
import { decodeEntities } from "@/lib/api/mappers";
import type { Capabilities } from "@/lib/auth/session";

export type DashScope = "all" | "own";

/** One day. Dense — every day in the window is present, zero-filled, so a gap
 *  in the data reads as a gap rather than being silently closed up. */
export interface DashPoint {
  /** "2026-08-05", site-local. */
  d: string;
  views: number;
  posts: number;
}

export interface DashKpi {
  /** null when this path has no view data at all (the REST fallback). */
  views7: number | null;
  /** null when the series is too short to compare — never a partial window. */
  viewsPrev7: number | null;
  published7: number;
  publishedPrev7: number | null;
}

export interface DashQueueItem {
  id: number;
  title: string;
  authorName: string;
  /** ISO-8601, site-local, as WordPress stored it. */
  date: string;
}

export interface DashQueue {
  pending: number;
  drafts: number;
  /** Drafts not edited in 30 days — the pipeline's dead weight. */
  draftsStale: number;
  /** `future` posts. This server's loopback is broken so WP-Cron never fires
   *  and a scheduled post never publishes; the row only renders when > 0. */
  scheduled: number;
  /** Comments awaiting moderation (plugin 1.8.0, moderate_comments-gated).
   *  0 on the REST fallback and for users without the cap. */
  comments: number;
  oldest: DashQueueItem | null;
}

/** How TODAY is going (plugin 1.8.0). The comparison is since-midnight vs
 *  yesterday UP TO THE SAME CLOCK TIME — never a partial day against a full
 *  one. null = the path cannot say (REST fallback, or pre-1.8.0 plugin). */
export interface DashToday {
  /** null when the WPP summary table is missing (hasViews false). */
  views: number | null;
  viewsPrevSameTime: number | null;
  /** Scope-aware like the KPIs: the newsroom's stories today, or yours. */
  posts: number;
  /** Most-read story of the last 60 minutes; null on a quiet hour. */
  topHour: TopPost | null;
}

export interface TopPost {
  id: number;
  title: string;
  views: number;
  authorName: string;
  categoryNames: string[];
  date: string;
}

export interface DashAuthor {
  id: number;
  name: string;
  count: number;
}

export interface DashboardData {
  scope: DashScope;
  range: DashRange;
  /** The custom window actually APPLIED (plugin-clamped, so it can differ from
   *  what was asked). null on presets and on every path that cannot honor a
   *  custom window (REST fallback, pre-1.8.0 plugin). */
  custom: { from: string; to: string } | null;
  /** false when WPP's summary table is missing: the chart drops to publishing
   *  only rather than drawing zero traffic, which would read as real. */
  hasViews: boolean;
  kpi: DashKpi;
  /** null = no trend available on this path (see the header). */
  series: DashPoint[] | null;
  queue: DashQueue;
  /** null for own-scope users and on the fallback path. */
  authors: DashAuthor[] | null;
  top: TopPost[];
  /** Most-read over a fixed 24-hour window (1.7.0) — momentum, so it ignores
   *  the range control. Same shape as `top`; may overlap with it. */
  trending: TopPost[];
  /** null = this path cannot answer "how is today going" (see DashToday). */
  today: DashToday | null;
  recent: AdminPostRow[];
}

function scopeOf(caps: Capabilities | undefined): DashScope {
  return caps?.edit_others_posts ? "all" : "own";
}

/* -------------------------------------------------------------------------- *
 * The fast path — one request.
 * -------------------------------------------------------------------------- */

interface FastDashboard {
  scope: DashScope;
  range: number;
  /** Absent before plugin 1.8.0. */
  custom?: { from: string; to: string } | null;
  hasViews: boolean;
  kpi: DashKpi;
  series: DashPoint[];
  queue: {
    pending: number;
    drafts: number;
    draftsStale: number;
    scheduled: number;
    /** Absent before plugin 1.8.0. */
    comments?: number;
    oldest: { id: number; title: string; authorName: string; date: string } | null;
  };
  authors: DashAuthor[] | null;
  top:
    | { id: number; title: string; views: number; authorName?: string; categoryNames?: string[]; date?: string }[]
    | null;
  /** Absent before plugin 1.7.0; null when the summary table is missing. */
  trending?:
    | { id: number; title: string; views: number; authorName?: string; categoryNames?: string[]; date?: string }[]
    | null;
  /** Absent before plugin 1.8.0. */
  today?: {
    views: number | null;
    viewsPrevSameTime: number | null;
    posts: number;
    topHour: { id: number; title: string; views: number; authorName?: string; categoryNames?: string[]; date?: string } | null;
  };
  recent: FastPostRow[];
}

/** null when the endpoint answered fine but with a PRE-1.6.0 payload.
 *
 *  That is not a fast-path failure — the plugin is up, healthy and simply
 *  older — so it must not throw: `withRestFallback`'s breaker opens after two
 *  consecutive throws and would push posts, media and every other admin read
 *  onto ~4s WP REST for 60s at a time, on every dashboard load, for as long as
 *  the upload is pending. Returning null lets readDashboard pay REST for this
 *  one screen and leave the breaker alone. */
export async function getDashboardDataFast(spec: DashRangeSpec, token?: string): Promise<DashboardData | null> {
  const body = await fastFetch<FastDashboard>(
    "dashboard",
    isCustomRange(spec) ? { from: spec.from, to: spec.to } : { days: spec },
    { token },
  );
  const d = body.data;

  if (!d || !d.kpi || !d.queue) {
    console.warn("[fast] dashboard: endpoint is pre-1.6.0 (no kpi/queue) — using WP REST for this screen only");
    return null;
  }

  return {
    scope: d.scope,
    range: clampRange(d.range),
    // What the plugin APPLIED; a pre-1.8.0 plugin never echoes it, so a custom
    // request against an old plugin correctly reads back as its preset.
    custom: d.custom ?? null,
    hasViews: d.hasViews,
    kpi: d.kpi,
    series: d.series ?? null,
    queue: {
      ...d.queue,
      comments: d.queue.comments ?? 0,
      oldest: d.queue.oldest
        ? { ...d.queue.oldest, title: decodeEntities(d.queue.oldest.title ?? "").trim() || "(untitled)" }
        : null,
    },
    authors: d.authors ? d.authors.map((a) => ({ ...a, name: decodeEntities(a.name ?? "") })) : null,
    // top === null means the summary table was missing, and ONLY then is the
    // WPP REST call worth paying for. Same for trending, whose == null also
    // catches a pre-1.7.0 plugin that does not send the field at all.
    top: d.top === null ? await fetchTopRest("last30days", token) : d.top.map(mapTop),
    trending: d.trending == null ? await fetchTopRest("last24hours", token) : d.trending.map(mapTop),
    // No REST stand-in for `today`: the same-clock-time comparison only exists
    // on this path, so a pre-1.8.0 plugin honestly yields null.
    today: d.today
      ? {
          views: d.today.views,
          viewsPrevSameTime: d.today.viewsPrevSameTime,
          posts: d.today.posts,
          topHour: d.today.topHour ? mapTop(d.today.topHour) : null,
        }
      : null,
    recent: (d.recent ?? []).map(mapFastRow),
  };
}

function mapTop(p: {
  id: number;
  title: string;
  views: number;
  authorName?: string;
  categoryNames?: string[];
  date?: string;
}): TopPost {
  return {
    id: p.id,
    title: decodeEntities(p.title ?? "").trim() || "(untitled)",
    views: p.views,
    authorName: decodeEntities(p.authorName ?? ""),
    categoryNames: p.categoryNames ?? [],
    date: p.date ?? "",
  };
}

/* -------------------------------------------------------------------------- *
 * The REST fallback — correct, slow, and honest about its two gaps.
 * -------------------------------------------------------------------------- */

interface RawWppPost {
  id: number;
  title?: { rendered?: string };
  pageviews?: string;
}

/** WPP's own REST API: the top-N, with no author/desk/date and no timeline.
 *  `range` is WPP's window keyword — "last30days" for Top performing,
 *  "last24hours" for Trending now. */
async function fetchTopRest(range: "last30days" | "last24hours", token?: string): Promise<TopPost[]> {
  try {
    const { data } = await adminFetch<RawWppPost[]>("/wordpress-popular-posts/v1/popular-posts", {
      token,
      query: { limit: 5, range },
    });
    return (data ?? []).map((p) => ({
      id: p.id,
      title: decodeEntities(p.title?.rendered ?? "").trim() || "(untitled)",
      views: Number(p.pageviews ?? 0) || 0,
      authorName: "",
      categoryNames: [],
      date: "",
    }));
  } catch (e) {
    if (e instanceof AdminAuthError) throw e;
    return [];
  }
}

/** A count that degrades to 0 on failure — but still bubbles an expired
 *  session, which is a different thing entirely. */
async function safeCount(query: Parameters<typeof countPosts>[0], token?: string): Promise<number> {
  try {
    return await countPosts(query, token);
  } catch (e) {
    if (e instanceof AdminAuthError) throw e;
    return 0;
  }
}

/** Site-local midnight, N days back. WordPress stores post_date on the site's
 *  clock with no zone suffix, so these bounds are built the same way — a UTC
 *  `toISOString()` would shift the window by the offset (7h here).
 *
 *  ⚠ Callers want a COUNT OF DAYS, and this takes an OFFSET. A 7-day window is
 *  `siteMidnight(6)`: midnight six days ago through now is seven calendar days
 *  INCLUDING today, which is what the fast path's 7-entry tail of a dense daily
 *  series sums. Measured 2026-08-05 with `siteMidnight(7)` here: the fallback
 *  reported 30 stories published this week where the fast path said 26, because
 *  it was counting eight days. */
function siteMidnight(daysAgo: number): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" }));
  now.setDate(now.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`;
}

/** The oldest post in the review queue, with the RAW date — the UI turns it
 *  into an age, so it needs an ISO stamp rather than listPosts' display format.
 *  Hence the direct adminFetch: `order=asc` on one row beats paging to the end
 *  of a newest-first list. */
async function fetchOldestPending(authorId: number | undefined, token?: string): Promise<DashQueueItem | null> {
  try {
    const { data } = await adminFetch<
      { id: number; date: string; title?: { rendered?: string }; _embedded?: { author?: { name?: string }[] } }[]
    >("/wp/v2/posts", {
      token,
      query: {
        per_page: 1,
        status: "pending",
        author: authorId,
        orderby: "date",
        order: "asc",
        _fields: "id,date,title,author,_links,_embedded",
        _embed: "author",
      },
    });
    const p = data?.[0];
    if (!p) return null;
    return {
      id: p.id,
      title: decodeEntities(p.title?.rendered ?? "").trim() || "(untitled)",
      authorName: p._embedded?.author?.[0]?.name ?? "",
      date: p.date ?? "",
    };
  } catch (e) {
    if (e instanceof AdminAuthError) throw e;
    return null;
  }
}

export async function getDashboardData(
  range: DashRange,
  userId: number,
  caps: Capabilities | undefined,
  token?: string,
): Promise<DashboardData> {
  const scope = scopeOf(caps);
  const mine = scope === "own" ? userId : undefined;

  const [published7, published14, pending, drafts, draftsStale, scheduled, top, trending, recent, oldest] =
    await Promise.all([
      // 6 and 13, not 7 and 14 — see siteMidnight's note. These must match the
      // fast path's windows or the same tile reads differently per path.
      safeCount({ author: mine, status: "publish", after: siteMidnight(6) }, token),
      safeCount({ author: mine, status: "publish", after: siteMidnight(13) }, token),
      safeCount({ author: mine, status: "pending" }, token),
      safeCount({ author: mine, status: "draft" }, token),
      safeCount({ author: mine, status: "draft", modifiedBefore: siteMidnight(30) }, token),
      safeCount({ author: mine, status: "future" }, token),
      fetchTopRest("last30days", token),
      fetchTopRest("last24hours", token),
      fetchRecentRest(token),
      fetchOldestPending(mine, token),
    ]);

  return {
    scope,
    range,
    custom: null,
    hasViews: false,
    kpi: {
      views7: null,
      viewsPrev7: null,
      published7,
      // The 7 days before the last 7 = the 14-day total minus the 7-day one.
      publishedPrev7: Math.max(0, published14 - published7),
    },
    series: null,
    queue: { pending, drafts, draftsStale, scheduled, comments: 0, oldest },
    authors: null,
    top,
    trending,
    today: null,
    recent,
  };
}

async function fetchRecentRest(token?: string): Promise<AdminPostRow[]> {
  try {
    // Articles only: unioning the program post types here would be four more
    // ~4s calls on a path that is already the slow one.
    const { items } = await listPosts({ perPage: 8, status: DEFAULT_STATUSES, orderby: "modified" }, token);
    return items;
  } catch (e) {
    if (e instanceof AdminAuthError) throw e;
    return [];
  }
}

/** The read the BFF should call: one fast request, the REST assembly if the
 *  fast path is unavailable. The user id and capabilities the fast path scopes
 *  by come from the verified token server-side, not from these arguments —
 *  same trust model as every other fast read; the arguments only steer the
 *  fallback. */
export function readDashboard(
  spec: DashRangeSpec,
  userId: number,
  caps: Capabilities | undefined,
  token?: string,
): Promise<DashboardData> {
  // The REST assembly has no custom-window story (WPP REST has no bounded
  // ranking, and the series is null there anyway), so a custom request
  // degrades to the 30-day preset — `custom: null` in the result tells the
  // UI which window it is actually looking at.
  const rest = () => getDashboardData(isCustomRange(spec) ? 30 : spec, userId, caps, token);
  return withRestFallback(
    "dashboard",
    // An old-but-healthy endpoint resolves through the REST assembly INSIDE the
    // fast branch, so the call still counts as a success and the shared breaker
    // stays closed. A genuinely broken one throws and takes the outer branch.
    async () => (await getDashboardDataFast(spec, token)) ?? (await rest()),
    rest,
  );
}
