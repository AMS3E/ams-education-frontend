// Authed, UNCACHED HTTP client for the admin dashboard's reads and writes.
//
// Distinct from src/lib/api/client.ts (apiFetch): that one is for the PUBLIC
// site — anonymous, ISR-cached, and hits the custom read-only web/* endpoints
// (published content only). The admin instead talks to CORE wp/v2/* AS the
// logged-in user: it needs drafts/pending, search + author/category/status
// filters, the X-WP-Total pagination headers, and write verbs. So every call
// carries the X-AMS-Token from the session cookie and is `no-store` — an
// admin read must never serve another user's cached view or a stale draft.
// (An opt-in tagged Data Cache option existed while WP REST cost ~4s/call;
// it went with the rest of the caching scaffolding in A6 — reads route
// through the fast path now and are cheap enough to always be fresh.)
//
// Server-only: it reads next/headers. Import from Server Components, Server
// Actions, or Route Handlers, never a Client Component.

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";

/** No token, or WordPress rejected it (401): the session is gone/expired. The
 *  caller maps this to a redirect to /login. */
export class AdminAuthError extends Error {
  constructor() {
    super("admin session expired");
    this.name = "AdminAuthError";
  }
}

/** Any other non-2xx from WordPress. `detail` is a truncated body for logs. */
export class AdminApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public detail: string,
  ) {
    super(`admin API ${status} for ${path}`);
    this.name = "AdminApiError";
  }
}

/** The session token, or AdminAuthError. Exported for the fast read path
 *  (lib/admin/fast.ts), which carries the same token to a different endpoint. */
export async function requireToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new AdminAuthError();
  return token;
}

export type QueryValue = string | number | boolean | undefined;

export interface AdminFetchInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Query params; undefined/empty-string entries are dropped. */
  query?: Record<string, QueryValue>;
  /** JSON request body (writes). */
  body?: unknown;
  /** Extra request headers for a narrowly-scoped WordPress integration flag.
   *  Authentication remains owned here and cannot be overridden by callers. */
  headers?: Record<string, string>;
  /**
   * Explicit session token, bypassing the cookie read. The BFF routes pass
   * the token they already read for their auth gate; everything else lets the
   * cookie read happen here.
   */
  token?: string;
  /**
   * Request deadline override, milliseconds (default 30s). For the rare
   * write whose WP-side save hooks legitimately run long — program creation
   * trips the Khmer→slug Google-Translate hook, which alone can blow the
   * default — not for reads, which should keep failing fast.
   */
  timeoutMs?: number;
}

export interface AdminResponse<T> {
  data: T;
  /** X-WP-Total — total rows across all pages (0 when the header is absent). */
  total: number;
  /** X-WP-TotalPages — total page count (1 when the header is absent). */
  totalPages: number;
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

/**
 * Typed call against core WordPress REST as the current user. Throws
 * AdminAuthError on 401 and AdminApiError on any other failure; returns the
 * parsed body plus the pagination totals from the response headers.
 */
export async function adminFetch<T>(path: string, init: AdminFetchInit = {}): Promise<AdminResponse<T>> {
  const token = init.token ?? (await requireToken());
  const hasBody = init.body !== undefined;
  const method = init.method ?? "GET";
  // Dev-only: print every WordPress call's wall time. The admin's latency is
  // ~entirely WP's fixed ~4s-per-REST-call bootstrap — this makes it visible
  // (and makes regressions on our side, like N calls per screen, obvious).
  // WRITES also log in production (they're rare), with the X-AMS-Cache-Preload
  // response header: `skipped:4` proves the plugin skipped ams-cache's
  // synchronous warm-up crawl for this request; fewer/absent means the slow
  // path ran — check it before any other theory about a minutes-long save
  // (docs/project-context.md §3).
  const started = Date.now();
  const logTiming = (outcome: string, preload?: string | null) => {
    if (process.env.NODE_ENV !== "production" || preload !== undefined) {
      const suffix = preload !== undefined ? ` cache-preload=${preload ?? "absent"}` : "";
      console.log(`[adminFetch] ${method} ${path} ${outcome} in ${Date.now() - started}ms${suffix}`);
    }
  };

  const res = await fetch(`${BASE}${path}${buildQuery(init.query)}`, {
    method,
    headers: {
      accept: "application/json",
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...init.headers,
      // Keep the authenticated session authoritative for every call.
      "X-AMS-Token": token,
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
    // WordPress occasionally hangs a request outright (observed after an
    // outage); without a deadline that leaves the UI on "Saving…" forever.
    // 30s is far above the ~4-6s normal ceiling, so real requests never trip
    // — except writes with slow WP save hooks, which pass timeoutMs.
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    cache: "no-store",
  }).catch((e) => {
    logTiming(e instanceof Error ? e.name : "network-error");
    throw e;
  });
  logTiming(String(res.status), method !== "GET" ? res.headers.get("x-ams-cache-preload") : undefined);

  if (res.status === 401) throw new AdminAuthError();
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AdminApiError(res.status, path, detail.slice(0, 300));
  }

  return {
    data: (await res.json()) as T,
    total: Number(res.headers.get("x-wp-total") ?? "0") || 0,
    totalPages: Number(res.headers.get("x-wp-totalpages") ?? "1") || 1,
  };
}
