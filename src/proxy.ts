import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Next 16 renamed Middleware to Proxy (same mechanism). This is an OPTIMISTIC
// gate only — it checks cookie PRESENCE, never validity, and never calls the
// network (the docs are explicit: no data fetching in proxy). Real enforcement
// is WordPress verifying the token on every call, plus requireSession() in the
// admin layout. This just spares unauthenticated users a flash of the shell.
//
// It deliberately does NOT bounce cookie-holders away from /login: a stale-but-
// present cookie (e.g. a password change invalidates the token before the
// cookie's own 12h expiry) would loop forever against the layout's redirect to
// /login. The "already signed in?" check lives on the login page instead, where
// getSession() can actually validate the token.

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/admin") && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
