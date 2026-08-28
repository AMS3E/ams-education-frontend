// Transport for the SHORTINIT fast read path — the third HTTP client, and the
// rules for which is which matter:
//
//   apiFetch    (lib/api/client)   PUBLIC site, anonymous, ISR-cached, web/*
//   adminFetch  (lib/admin/client) ADMIN, authed, no-store, core wp/v2/*  ~4s
//   fastFetch   (this file)        ADMIN, authed, no-store, direct SQL    ~0.3s
//
// fastFetch talks to a standalone PHP file in a WordPress plugin folder that
// boots with SHORTINIT — WordPress's database layer and nothing else. It is hit
// by direct URL rather than through the REST API on purpose: registering it as
// a REST route would pay the ~3,900 ms plugin/theme/hook boot that is the
// entire point of avoiding. See docs/wordpress/ams-fast-api/fast.php.
//
// It carries the SAME X-AMS-Token as adminFetch and verifies it against the
// same derived key, so a user sees exactly what their WordPress capabilities
// allow — enforced by hand-written SQL rather than by WordPress. That is the
// risk this path trades for the speed, which is why the endpoint is verified
// against the REST path as an Author before anything is pointed at it.
//
// Server-only: it reads the session cookie. Never import from a Client
// Component.

import { AdminAuthError, requireToken, type QueryValue } from "./client";

const API_BASE = process.env.API_BASE_URL ?? "https://infotainment.ams.com.kh/wp-json";

/** `https://site/wp-json` -> `https://site/wp-content/plugins/ams-fast-api/fast.php` */
function derivedFastUrl(): string {
  return `${API_BASE.replace(/\/wp-json\/?$/, "")}/wp-content/plugins/ams-fast-api/fast.php`;
}

/** Override when the plugin folder moves — notably when fast.php is folded into
 *  the ams-frontend-api plugin, which is the intended end state. */
const FAST_URL = process.env.WP_FAST_URL || derivedFastUrl();

/** Escape hatch: `ADMIN_FAST_READS=0` sends every read back down the WP REST
 *  path without a deploy. Reads fall back on their own when the endpoint is
 *  missing or broken, so this is for deliberately A/B-ing the two. */
export const FAST_READS_ENABLED = process.env.ADMIN_FAST_READS !== "0";

/**
 * The endpoint answered, but not with data. `reason` is the stable string
 * fast.php returns (`bad_signature`, `cannot_read_status`, `unknown_resource`,
 * …) — worth logging verbatim, since it is the difference between "the plugin
 * is not deployed" and "the salt derivation is wrong" without another request.
 */
export class FastPathError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public resource: string,
  ) {
    super(`fast path ${status} ${reason} for ${resource}`);
    this.name = "FastPathError";
  }
}

interface FastEnvelope<T> {
  ok: boolean;
  reason?: string;
  /** The real failure code when ok=false. fast.php sends failures as HTTP 200
   *  (except auth) because this host replaces 4xx bodies with an HTML error
   *  page, which would strip `reason`. */
  status?: number;
  data: T;
  /** Server-side timings in ms: boot, the queries, and the request total. */
  ms?: { boot?: number; rows?: number; extras?: number; total?: number };
  user?: { id: number; scope: "all" | "own" };
  debug?: Record<string, unknown>;
}

function buildQuery(query: Record<string, QueryValue>): string {
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

/**
 * One typed call against the fast path. Throws AdminAuthError on 401 (the
 * session is gone — same contract as adminFetch, so callers redirect to /login)
 * and FastPathError on anything else, which read helpers treat as "fall back to
 * WP REST" rather than as a user-visible failure.
 */
export async function fastFetch<T>(
  resource: string,
  query: Record<string, QueryValue> = {},
  init: { token?: string; timeoutMs?: number } = {},
): Promise<FastEnvelope<T>> {
  const token = init.token ?? (await requireToken());
  const started = Date.now();

  const res = await fetch(`${FAST_URL}${buildQuery({ r: resource, ...query })}`, {
    headers: { accept: "application/json", "X-AMS-Token": token },
    // A path whose job is to answer in ~300ms has no business waiting 30s; a
    // short deadline means a hung endpoint costs one WP REST call, not two.
    signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
    cache: "no-store",
  });

  const elapsed = Date.now() - started;

  if (res.status === 401) throw new AdminAuthError();

  const body = (await res.json().catch(() => null)) as FastEnvelope<T> | null;

  if (!res.ok || !body?.ok) {
    throw new FastPathError(body?.status ?? res.status, body?.reason ?? "unparseable", resource);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[fast] ${resource} ${res.status} in ${elapsed}ms` +
        (body.ms ? ` (wp ${body.ms.total}ms, boot ${body.ms.boot}ms)` : ""),
    );
  }

  return body;
}

/* --- circuit breaker ------------------------------------------------------
 *
 * Falling back is meant to be cheap. It is not, if the endpoint is MISSING:
 * a request to a deleted fast.php is not a quick 404 — the webserver hands the
 * URL to WordPress, which boots the full 63-plugin stack to render its own 404
 * page. Measured with the plugin deliberately unreachable: 20.4s for one list,
 * i.e. ~15s of WordPress 404 followed by the ~5s REST call we needed all along.
 * That is four times SLOWER than never having tried.
 *
 * So after a couple of consecutive failures, stop trying for a minute. The
 * degradation becomes "two slow requests, then normal REST speed" instead of
 * "every request is 20s until someone notices". State is per server instance,
 * which is the right granularity: each one re-probes on its own schedule and a
 * restored endpoint is picked up within the cooldown, with no coordination.
 */
const BREAKER_TRIP_AFTER = 2;
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

/**
 * Run a fast read, falling back to its WP REST equivalent if the fast path is
 * unavailable. The admin degrades to slow-but-correct rather than broken when
 * the plugin is deleted or the endpoint changes shape.
 *
 * An expired session is NOT a fast-path failure — it propagates, or every
 * logged-out request would pay both paths before redirecting.
 */
export async function withRestFallback<T>(
  label: string,
  fast: () => Promise<T>,
  rest: () => Promise<T>,
): Promise<T> {
  if (!FAST_READS_ENABLED) return rest();

  if (Date.now() < breakerOpenUntil) return rest();

  try {
    const result = await fast();
    consecutiveFailures = 0;
    return result;
  } catch (e) {
    if (e instanceof AdminAuthError) throw e; // not a fast-path failure

    consecutiveFailures += 1;
    if (consecutiveFailures >= BREAKER_TRIP_AFTER) {
      breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    }

    const why = e instanceof FastPathError ? e.reason : e instanceof Error ? e.name : "unknown";
    console.warn(
      `[fast] ${label} fell back to WP REST (${why}) — expect ~4s` +
        (Date.now() < breakerOpenUntil ? `; skipping the fast path for ${BREAKER_COOLDOWN_MS / 1000}s` : ""),
    );
    return rest();
  }
}
