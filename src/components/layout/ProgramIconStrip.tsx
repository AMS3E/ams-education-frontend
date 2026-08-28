import Link from "next/link";
import { css } from "@/styled-system/css";
import type { ProgramIcon } from "@/lib/navigation";

// A Server Component: every item is a published WordPress Program and links to
// its internal /program/<slug> page. There is no client-side state in the row.

// `.site_header__secondary-nav-v3 .yamm .menu-item` on education.ams.com.kh's
// live page (2026-08-26) — the row's real height comes from this padding +
// the 34px icon, not a fixed box on the row itself (see SiteHeader). Each item
// also carries a 1px `#bdc3c7` divider on its trailing edge in the live CSS.
const icon = css({
  padding: "11px 15px",
  lineHeight: "18px",
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "#bdc3c7",
});

const logo = css({ height: "34px", width: "auto", objectFit: "contain", display: "block" });

export default function ProgramIconStrip({ icons }: { icons: ProgramIcon[] }) {
  return (
    <>
      {icons.map(c => (
        <Link key={c.slug} href={c.href} title={c.title} className={icon}>
          {/* Brand logos of varying width, uniform height — plain <img> (many are SVG). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.image} alt={c.title} className={logo} />
        </Link>
      ))}
    </>
  );
}
