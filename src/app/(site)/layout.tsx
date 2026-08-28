import { css } from "@/styled-system/css";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import ReviveRouteCleanup from "@/components/ads/revive/ReviveRouteCleanup";

// The public site's chrome. This used to live in the root layout; it moved here
// when the admin tool was added so that /admin can render its own full-screen
// shell without inheriting the site header/footer (and their nav-API fetches).
// Route groups don't affect URLs, so every public page keeps its existing path.
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={css({
        background: "page.bg",
        color: "text",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        transition: "background .25s, color .25s",
      })}
    >
      <ReviveRouteCleanup />
      <SiteHeader />
      <main className={css({ flex: "1" })}>{children}</main>
      <SiteFooter />
    </div>
  );
}
