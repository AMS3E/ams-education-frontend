import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readDashboard } from "@/lib/admin/dashboard";
import { clampRange, DASH_DATE_RE, type DashRangeSpec } from "@/lib/admin/constants";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for the Dashboard, fresh on every request (A6): what used to be
// six ~4s WP round trips behind a per-user 30min cache is one ~300ms fast
// call, so the cache tier is gone.
//
// The window is either `range` (7/30/90, clamped server-side — a 365-day
// aggregate over WPP's summary table measured 57 seconds live) or a custom
// `from`/`to` pair (Y-m-d; the plugin re-validates and clamps the span to 90
// days, so this route only shape-checks). The user's capabilities go down to
// the FALLBACK only: the fast path reads the real ones out of the verified
// token, and never trusts what this route thinks.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token, user } = session;

  const params = new URL(req.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const spec: DashRangeSpec =
    DASH_DATE_RE.test(from) && DASH_DATE_RE.test(to) ? { from, to } : clampRange(params.get("range"));

  try {
    return NextResponse.json({
      ...(await readDashboard(spec, user.id, user.capabilities, token)),
      fetchedAt: Date.now(),
    });
  } catch (e) {
    return bffError(e, "dashboard");
  }
}
