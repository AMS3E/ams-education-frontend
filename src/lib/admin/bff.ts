// Shared plumbing for the /api/admin/* BFF read routes (the TanStack Query
// fetch targets). Each route: getSession() → 401 JSON when absent, then a
// FRESH readX() through the fast path (A6 removed the shared cache tier).
// The routes' remaining job is keeping the httpOnly token out of browser JS.
// Route Handlers only (imports next/server).

import { NextResponse } from "next/server";
import { AdminAuthError, AdminApiError } from "./client";

/** 401 body. The client fetcher treats this status as "session gone" and
 *  sends the browser to /login. */
export function bffAuthRequired(): NextResponse {
  return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
}

/** Map a thrown read error to a JSON response. AdminAuthError means WordPress
 *  rejected the token mid-session → same 401 contract as a missing session. */
export function bffError(e: unknown, resource: string): NextResponse {
  if (e instanceof AdminAuthError) return bffAuthRequired();
  console.warn(`[api/admin/${resource}] ${e instanceof Error ? e.message : String(e)}`);
  return NextResponse.json(
    { error: `Couldn't load ${resource} from WordPress.` },
    { status: e instanceof AdminApiError ? 502 : 500 },
  );
}
