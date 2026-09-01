import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import { footerCols, footerLegal, type FooterLink } from "@/lib/home-data";
import { SOCIALS } from "@/lib/site";
import { container } from "./shared";
import SocialIcon from "@/components/ui/SocialIcon";

const linkStyle = css({
  color: "#949cb0",
  fontSize: "15px",
  textDecoration: "none",
  transition: "color .2s",
  _hover: { color: "#19272e" },
});

const legalStyle = css({
  color: "#a6a6a6",
  fontSize: "13px",
  textDecoration: "none",
  transition: "color .2s",
  // White, not the site-wide dark-navy hover (#19272e) — this bar's own
  // background is black, where a dark hover colour would be unreadable.
  _hover: { color: "#fff" },
});

/** An internal link goes through <Link> for client-side navigation; an AMS
 *  sister site is a plain anchor, since it leaves the app entirely. */
function FooterAnchor({ link, className }: { link: FooterLink; className: string }) {
  return link.external ? (
    <a href={link.href} className={className} target="_blank" rel="noopener noreferrer">
      {link.label}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/** Shared site footer (used on every page via the layout). */
export default function SiteFooter() {
  return (
    <footer
      className={css({
        background: "#eeeff0",
        width: "100%",
        padding: "40px 0 0px",
        borderTop: "1px solid #cdcdcd",
      })}
    >
      <div className={container}>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "18px",
            paddingBottom: "28px",
            borderBottom: "1px solid #cdcdcd",
          })}
        >
          {/* Full-colour logo — live's own light footer (site__footer--v1.light,
              #eeeff0 background) uses the colour mark, not the white one; a white
              SVG would be invisible here. Same CDN-hosted-SVG convention as the
              header's own logo (SiteHeader.tsx). Intrinsic size 181×58;
              width/height attrs reserve space to avoid layout shift. */}
          <img
            src="https://s3.ams.com.kh/education/2022/09/APSARA-MEDIA-SERVICES-COLOUR-FULL-H58.svg"
            alt="Apsara Media Services"
            width={181}
            height={58}
            className={css({ height: "60px", width: "auto", display: "block" })}
          />
          <div className={css({ display: "flex", flexWrap: "wrap", gap: "22px" })}>
            {/* These were <span cursor:pointer> — they looked clickable and were
                not. They are the real AMS accounts now. */}
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#949cb0",
                  fontSize: "16px",
                  textDecoration: "none",
                  transition: "color .2s",
                  _hover: { color: "#19272e" },
                })}
              >
                <span className={css({ display: "inline-flex", color: "#19272e", fontSize: "16px" })}>
                  <SocialIcon name={s.name} />
                </span>
                {s.name}
              </a>
            ))}
          </div>
        </div>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "repeat(2,1fr)", md: "repeat(3,1fr)" },
            gap: "28px",
            padding: "30px 0",
          })}
        >
          {footerCols.map((col, i) => {
            // Split links into two column-major halves: first half fills the
            // left sub-column, the rest fills the right (matches the design).
            const half = Math.ceil(col.links.length / 2);
            const groups = [col.links.slice(0, half), col.links.slice(half)];
            return (
              <div
                key={col.heading}
                className={css(i > 0 ? { borderLeft: "1px solid #cdcdcd", paddingLeft: "24px" } : {})}
              >
                <div className={css({ color: "#19272e", fontSize: "18px", fontWeight: 600, marginBottom: "25px" })}>{col.heading}</div>
                <div
                  className={css({
                    display: "grid",
                    gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
                    columnGap: "20px",
                    rowGap: "10px",
                  })}
                >
                  {groups.map((group, gi) => (
                    <div key={gi} className={css({ display: "flex", flexDirection: "column", gap: "18px" })}>
                      {group.map((l) => (
                        <FooterAnchor key={l.label} link={l} className={linkStyle} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Full-bleed bar: the background sits on the outer element so it spans
          the viewport, and `container` constrains the content inside it. Black
          by deliberate choice, not to match the live site — its own
          `.footer-bottom-bar` base rule IS black, but a more specific rule
          overrides it to #fff there; this app keeps black regardless. */}
      <div className={css({ background: "#000" })}>
        <div
          className={cx(
            container,
            css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              padding: "15px 0px",
            }),
          )}
        >
          <div className={css({ color: "#a6a6a6", fontSize: "13px" })}>
            ឆ្នាំ2020 - 2024 © រក្សាសិទ្ធិគ្រប់យ៉ាងដោយ៖ អគ្គនាយកដ្ឋានវិទ្យុ និងទូរទស្សន៍អប្សរា | អភិវឌ្ឍដោយ Apsara Media Services
          </div>
          <div className={css({ display: "flex", gap: "20px", flexWrap: "wrap" })}>
            {footerLegal.map((l) => (
              <FooterAnchor key={l.label} link={l} className={legalStyle} />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
