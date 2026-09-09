import type { Metadata, Viewport } from "next";
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

// THIS PAGE ONLY extends under the iPhone home indicator (`viewport-fit=cover`):
// that is what makes `env(safe-area-inset-bottom)` non-zero, so the frame below
// can step its footer above the indicator. Per-page on purpose — the public
// site's fixed furniture carries no safe-area padding of its own. Width and
// scale restate Next's defaults so the tag stays `width=device-width,
// initial-scale=1` with the one addition.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
          // On a phone `100vh` is the viewport with the address bar HIDDEN, so
          // a footer pinned to its bottom sits one bar-height below the fold
          // until the user scrolls (measured: ~58px in Chrome). The SMALL
          // viewport unit is the bar-showing height — what "visible on first
          // paint" needs. `vh` stays as the fallback for browsers that predate
          // it (2022); Panda cannot repeat a property, hence the @supports.
          minHeight: "100vh",
          "@supports (min-height: 100svh)": { minHeight: "100svh" },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // Bottom edge also clears the iPhone home indicator (the `viewport`
          // export above is what makes the inset non-zero); zero elsewhere.
          padding: "24px 24px calc(24px + env(safe-area-inset-bottom))",
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
        })}
        style={{ color: ac.muted }}
      >
        © {new Date().getFullYear()} Apsara Media Services CO., LTD. All rights reserved.
      </p>
    </main>
  );
}
