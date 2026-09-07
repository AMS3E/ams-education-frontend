import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { css, cx } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import { ADMIN_FONT_STACK, adminFont } from "@/components/admin/font";
import LoginForm from "@/components/admin/LoginForm";
import DepartmentCredit from "@/components/admin/DepartmentCredit";
import { getValidatedSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Top-level route (outside the (site) and /admin shells) so the sign-in screen
// renders on the thin root layout alone — no public nav, no admin sidebar.
//
// Bounce already-signed-in users to /admin here (not in the proxy): getSession()
// validates the token against WordPress, so a stale-but-present cookie correctly
// falls through to the form instead of ping-ponging with the layout's redirect.
export default async function LoginPage() {
  if (await getValidatedSession()) redirect("/admin");

  return (
    <main
      // Same font as the shell behind it — sign-in is part of the tool, and it
      // sits on the thin root layout where Battambang would otherwise win.
      className={cx(
        adminFont.variable,
        css({
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px",
        }),
      )}
      style={{ background: ac.canvas, color: ac.text, fontFamily: ADMIN_FONT_STACK }}
    >
      <div className={css({ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" })}>
        <div className={css({ width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", gap: "18px" })}>
          <LoginForm />
          <DepartmentCredit />
        </div>
      </div>
      <p
        className={css({
          fontSize: "12px",
          lineHeight: 1.6,
          textAlign: "center",
          margin: 0,
          paddingTop: "24px",
          "& strong": { color: { base: "#1840AB", _dark: "#48B8F0" }, fontWeight: 700 },
        })}
        style={{ color: ac.muted }}
      >
        Copyright © {new Date().getFullYear()} AMS&nbsp;<strong>Education</strong>
      </p>
    </main>
  );
}
