import { css, cx } from "@/styled-system/css";
import { ac } from "./tokens";

// The admin shell's brand lockup, in one place. The sidebar and the sign-in card
// both draw it, so there is one component and no chance of the two drifting.

/** The AMS Education mark — the site's own favicon (cropped-AMS-EDUCATION-
 *  FAVICON-180x180.png), mirrored locally from s3.ams.com.kh 2026-08-28 so the
 *  admin shell doesn't depend on the CDN for every page load. Square 1:1, so
 *  one theme is enough: it holds its own on both the cream and near-black rail.
 *  Only the wordmark beside it needs to follow the theme, and that is live text. */
export const BRAND_MARK = "/ams-logo.png";

/** Rendered size of the mark, holding the artwork's real 1:1 ratio. Passed as
 *  width/height so the browser reserves the box before it loads and the nav
 *  below never jumps. */
export const BRAND_MARK_W = 40;
export const BRAND_MARK_H = 40;

/** The AMS Education lockup: the mark, with the name set beside it.
 *
 *  The wordmark is TEXT rather than part of the artwork. That is what lets it
 *  recolour per theme — a baked-in black wordmark disappears on the dark rail,
 *  which is exactly the trap the previous PNG lockup fell into and needed a
 *  second file to escape.
 *
 *  Pass `className` to position it. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cx(css({ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }), className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset at icon size */}
      <img
        src={BRAND_MARK}
        alt=""
        width={BRAND_MARK_W}
        height={BRAND_MARK_H}
        className={css({ borderRadius: "9px", flex: "none", display: "block" })}
      />
      <span className={css({ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 })}>
        <span className={css({ fontWeight: 700, fontSize: "20px", letterSpacing: "-0.02em" })} style={{ color: ac.text }}>
          AMS
        </span>
        {/* Tracked out so the two lines finish at roughly the same width — the
            lockup then reads as one block rather than a big word with a small
            one hanging off it. */}
        <span
          className={css({ fontSize: "11px", fontWeight: 600, letterSpacing: "0.145em", textTransform: "uppercase" })}
          style={{ color: ac.faint }}
        >
          Education
        </span>
      </span>
    </span>
  );
}
