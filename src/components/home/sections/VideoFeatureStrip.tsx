import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import { container } from "@/components/layout/shared";
import type { FeaturedProgram } from "@/lib/featured-program";
import { cta } from "./styles";
import FeatureTrailer from "./FeatureTrailer";

/** Full-width dark video feature strip for whichever program is featured in WP
 *  admin (Settings → Featured Program) — វនយាត្រា today. WATCH NOW opens the
 *  program page; ▶ opens the trailer.
 *
 *  The title is drawn ONCE, small, top-left — same as the live site. The show's
 *  wordmark is part of the banner artwork itself (centred, in the pixels), so a
 *  second large title on top of it would just be the logo twice. The design mock
 *  had one only because its placeholder image had no wordmark to begin with.
 *
 *  Renders nothing when no program is configured, or when one is but has no
 *  banner art: 380px of flat green is worse than no band at all. */
export default function VideoFeatureStrip({ program }: { program: FeaturedProgram | null }) {
  if (!program?.cover) return null;

  return (
    // Dark in both themes — re-scope the theme tokens so the backdrop's
    // placeholder doesn't resolve to its light-mode grays.
    <div
      data-theme='dark'
      className={css({
        position: "relative",
        width: "100%",
        marginTop: "30",
        marginBottom: "30px",
        minHeight: "380px",
        background: "#0c2417",
        overflow: "hidden",
      })}>
      <CoverImage src={program.cover} sizes='100vw' />
      <div
        className={css({
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.25),rgba(0,0,0,.55))",
        })}
      />
      <div
        className={cx(
          container,
          css({
            position: "relative",
            minHeight: "380px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }),
        )}>
        <div className={css({ color: "#fff", fontSize: "26px", fontWeight: 700, marginBottom: "18px" })}>
          {program.title}
          {program.year && (
            <span className={css({ fontSize: "15px", fontWeight: 500, opacity: 0.75, marginLeft: "10px" })}>
              {program.year}
            </span>
          )}
        </div>
        <div className={css({ display: "flex", gap: "1.5rem" })}>
          <Link
            href={program.href}
            className={cx(
              cta,
              css({
                background: "#fff",
                color: "#15161d",
                padding: "10px 22px",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }),
            )}>
            WATCH NOW
          </Link>
          {/* Decorative, permanently. There is no playlist feature and none is
              planned; the live WordPress site's button only ever opened a "sign
              in first" dropdown. It stays for visual parity with that design —
              don't wire it up. */}
          <button
            className={cx(
              cta,
              css({
                background: "rgba(255,255,255,.16)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,.5)",
                padding: "10px 22px",
                fontSize: "13px",
                fontWeight: 600,
              }),
            )}>
            + PLAYLIST
          </button>
        </div>
      </div>

      <FeatureTrailer video={program.video} title={program.title} watchHref={program.watchHref} />
    </div>
  );
}
