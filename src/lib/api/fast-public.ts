// The PUBLIC site's fast read path — the fourth HTTP client, and the rules for
// which is which matter:
//
//   apiFetch    (lib/api/client)     PUBLIC, anonymous, ISR-cached, web/*   ~4s
//   fastPublic  (this file)          PUBLIC, anonymous, ISR-cached, SQL     ~0.3s
//   adminFetch  (lib/admin/client)   ADMIN, authed, no-store, core wp/v2/*  ~4s
//   fastFetch   (lib/admin/fast)     ADMIN, authed, no-store, SQL           ~0.3s
//
// Unlike the admin path this one is CACHED, not no-store: the public site's
// whole model is ISR, so these calls keep the exact `revalidate` + `tags`
// contract apiFetch uses. The win here is not per-request latency for a
// visitor (they are served a static page either way) — it is that every ISR
// REGENERATION and every build page render gets ~13x cheaper, and the publish
// webhook forces regenerations on every write.
//
// NO TOKEN: these resources serve only published content, byte for byte what
// wp-json already hands anonymous visitors. See the pub- section of fast.php.
//
// Deliberately self-contained rather than importing lib/admin/fast.ts: that
// module reads cookies for its token, and dragging next/headers into the
// public graph is how a static route quietly becomes dynamic.

import { ApiError, safeTags, type CacheOpts } from "./client";

const API_BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";

/** `https://site/wp-json` -> `https://site/wp-content/plugins/ams-fast-api/fast.php` */
function derivedFastUrl(): string {
  return `${API_BASE.replace(/\/wp-json\/?$/, "")}/wp-content/plugins/ams-fast-api/fast.php`;
}

const FAST_URL = process.env.WP_FAST_URL || derivedFastUrl();

/** `PUBLIC_FAST_READS=0` sends the public site back down the WP REST path
 *  without a code change — the A/B switch, mirroring ADMIN_FAST_READS. */
const ENABLED = process.env.PUBLIC_FAST_READS !== "0";

/** Optional shared secret, only needed if AMS_FAST_PUBLIC_KEY is defined in
 *  wp-config (it is not, by default — see fast.php). */
const PUBLIC_KEY = process.env.WP_FAST_PUBLIC_KEY ?? "";

export type QueryValue = string | number | undefined;

function buildQuery(query: Record<string, QueryValue>): string {
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

/* --- resources this deployment does not have ------------------------------
 *
 * A frontend deploy and a plugin upload are separate acts, so a build can ask
 * for a resource the live plugin has never heard of (fast.php answers
 * `ok:false reason:unknown_resource`). That is NOT a transient failure — it
 * stays true until the zip is uploaded — and counting it toward the shared
 * circuit breaker would punish every OTHER public read: two article renders in
 * a row would open the breaker and send categories, programs and menus to ~4s
 * WP REST for a minute at a time.
 *
 * So a missing resource is remembered per server instance and skipped locally,
 * without touching the breaker. The cost of shipping the frontend first is then
 * exactly "that one read is slow", which is what the fallback promises.
 */
const missingResources = new Set<string>();

export function isKnownMissing(resource: string): boolean {
  return missingResources.has(resource);
}

/**
 * One cached call against a public fast resource. Throws ApiError on anything
 * that is not a usable body, which is the same contract apiFetch has — so the
 * existing `catch -> []` degradation in every getter still behaves.
 */
export async function fastPublicFetch<T>(
  resource: string,
  query: Record<string, QueryValue>,
  { revalidate, tags }: CacheOpts,
): Promise<T> {
  // Already known absent from the deployed plugin: fail immediately, without a
  // request. fast.php is a real HTTP round trip even when it 404s.
  if (missingResources.has(resource)) {
    throw new ApiError(404, `fast:${resource}:${MISSING}`);
  }

  const path = `${buildQuery({ r: resource, ...query })}`;
  const res = await fetch(`${FAST_URL}${path}`, {
    next: { revalidate, tags: safeTags(tags) },
    headers: {
      accept: "application/json",
      ...(PUBLIC_KEY ? { "X-AMS-Public-Key": PUBLIC_KEY } : {}),
    },
  });

  if (!res.ok) throw new ApiError(res.status, `fast:${resource}`);

  const body = (await res.json().catch(() => null)) as ({ ok?: boolean; reason?: string } & T) | null;
  // fast.php reports failures as HTTP 200 + ok:false, because this host
  // replaces 4xx bodies with its own HTML error page.
  if (!body || body.ok !== true) {
    if (body?.reason === MISSING && !missingResources.has(resource)) {
      missingResources.add(resource);
      console.warn(
        `[fast-public] ${resource} is not in the deployed plugin — this instance will use WP REST for it ` +
          `until the zip is uploaded. Other fast resources are unaffected.`,
      );
    }
    throw new ApiError(res.status, `fast:${resource}:${body?.reason ?? "unparseable"}`);
  }
  return body as T;
}

/** fast.php's own reason string for a resource it does not implement. */
const MISSING = "unknown_resource";

/* --- circuit breaker ------------------------------------------------------
 *
 * Same reasoning as the admin path: a MISSING fast.php is not a cheap 404 —
 * the webserver hands the URL to WordPress, which boots the full plugin stack
 * to render its own 404 page (measured at ~15s), and only then do we pay the
 * REST call we needed anyway. After two consecutive failures, stop trying for
 * a minute so degradation is "two slow requests, then normal REST speed".
 *
 * Per server instance, which is the right granularity: each one re-probes on
 * its own schedule and a restored endpoint is picked up within the cooldown.
 */
const BREAKER_TRIP_AFTER = 2;
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

/**
 * Run a public fast read, falling back to its WP REST equivalent. The public
 * site degrades to slow-but-correct rather than broken if the plugin is
 * removed or the endpoint changes shape.
 */
export async function withPublicRestFallback<T>(
  label: string,
  fast: () => Promise<T>,
  rest: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return rest();
  if (Date.now() < breakerOpenUntil) return rest();

  try {
    const result = await fast();
    consecutiveFailures = 0;
    return result;
  } catch (e) {
    const why = e instanceof ApiError ? e.message : e instanceof Error ? e.name : "unknown";
    // A resource the deployed plugin does not implement is a KNOWN, permanent
    // gap, not evidence that the fast path is unhealthy — see missingResources.
    // It degrades itself and leaves every other resource alone.
    if (why.endsWith(MISSING)) return rest();

    consecutiveFailures += 1;
    if (consecutiveFailures >= BREAKER_TRIP_AFTER) {
      breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    }
    console.warn(
      `[fast-public] ${label} fell back to WP REST (${why}) — expect ~4s` +
        (Date.now() < breakerOpenUntil ? `; skipping the fast path for ${BREAKER_COOLDOWN_MS / 1000}s` : ""),
    );
    return rest();
  }
}
