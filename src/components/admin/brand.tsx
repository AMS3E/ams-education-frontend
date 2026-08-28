import { css, cx } from "@/styled-system/css";
import { ac } from "./tokens";

// The admin shell's brand lockup, in one place. The sidebar and the sign-in card
// both draw it, so there is one component and no chance of the two drifting.

/** The AMS mark: violet → crimson → gold, on a rounded square.
 *
 *  SVG, and deliberately so — it is 11KB against the 210KB of the PNG lockup it
 *  replaced, and stays sharp at any size. It is also a single asset for BOTH
 *  themes: the gradient is mid-toned enough to hold its own on cream and on the
 *  warm near-black, which is why there is no light/dark pair here any more.
 *  Only the wordmark beside it needs to follow the theme, and that is live text. */
export const BRAND_MARK = "/ams-logo.svg";

/** Rendered size of the mark, holding the artwork's real 837×779 ratio. Passed
 *  as width/height so the browser reserves the box before the SVG loads and the
 *  nav below never jumps. */
export const BRAND_MARK_W = 44;
export const BRAND_MARK_H = 41;

/** The AMS Infotainment lockup: the mark, with the name set beside it.
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
          Infotainment
        </span>
      </span>
    </span>
  );
}
