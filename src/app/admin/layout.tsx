import type { Metadata } from "next";
import { css, cx } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import { ADMIN_FONT_STACK, adminFont } from "@/components/admin/font";
import AdminSidebar from "@/components/admin/AdminSidebar";
import QueryProvider from "@/components/admin/QueryProvider";
import { requireSession, type SessionUser } from "@/lib/auth/session";
import { roleLabel } from "@/lib/admin/role-label";

export const metadata: Metadata = {
  title: "Admin",
  // The tool is internal; keep it out of search results regardless of auth.
  robots: { index: false, follow: false },
};

/** First+last initial (or first two chars for a single-token name). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toSidebarUser(user: SessionUser) {
  return { name: user.name, initials: initialsOf(user.name), roleLabel: roleLabel(user.roles) };
}

// The admin tool's own shell. It sits directly under the thin root layout, so it
// shares nothing with the public site's chrome — its own sidebar + canvas, and
// no dependency on the public nav API. Fixed 220px sidebar, scrolling content.
//
// requireSession() is the app-level gate (redirects to /login when there's no
// valid session), belt-and-suspenders with proxy.ts. It is NOT the security
// boundary — layouts don't re-render on client navigation, so an expired session
// surfaces on the next WordPress call (a 401), where the API layer forces a fresh
// login. WordPress enforces every capability regardless.
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await requireSession();

  return (
    <QueryProvider>
      <div
        // adminFont.variable declares --font-admin on this subtree only; the
        // stack then puts it ahead of the site-wide Battambang, which stays on
        // as the Khmer fallback. The public site never sees either.
        className={cx(adminFont.variable, css({ display: "flex", minHeight: "100vh", fontSize: "14px" }))}
        style={{ background: ac.canvas, color: ac.text, fontFamily: ADMIN_FONT_STACK }}
      >
        {/* No top bar. The theme control and the account menu it carried now
            live in the sidebar foot, so the content column starts at the very
            top of the viewport — which is what lets each screen's PageHeader be
            the first thing on the page. */}
        <AdminSidebar capabilities={user.capabilities} user={toSidebarUser(user)} />
        <div className={css({ flex: "1", minWidth: 0, display: "flex", flexDirection: "column" })}>{children}</div>
      </div>
    </QueryProvider>
  );
}
