import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import { container } from "@/components/layout/shared";
import { cta } from "@/components/home/sections/styles";
import FeatureTrailer from "@/components/home/sections/FeatureTrailer";
import type { FeaturedMovie } from "@/lib/programs";

// Panda needs statically-analyzable values, so the three icon placements are
// three classes rather than one parameterised by a prop (see MiniRow's
// thumbCompact/thumbDetailed for the same convention).
const iconBoxRight = css({ position: "relative", width: "45%", height: "100%", marginLeft: "auto" });
const iconBoxLeft = css({ position: "relative", width: "45%", height: "100%", marginRight: "auto" });
const iconBoxCenter = css({ position: "relative", width: "100%", height: "100%" });

/** Per-instance visual overrides — everything here has a default derived from
 *  `movie` or the live block's own look, so a pin (see HOME_FEATURED_MOVIE in
 *  HomeView.tsx) only needs to set what it wants to change. */
export interface FeaturedMovieStyle {
  /** Title pill background. Defaults to `movie.color` (its nav-pill colour). */
  titleColor?: string;
  /** Title text colour. Defaults to white. */
  titleTextColor?: string;
  /** Title font size (desktop; scales down ~6px on mobile same as the default). */
  titleFontSize?: string;
  /** Description paragraph text colour. Defaults to translucent white
   *  (rgba(255,255,255,.85)). */
  descriptionColor?: string;
  /** Description font size. Defaults to 14px. */
  descriptionFontSize?: string;
  /** Description block background — none by default (plain text over the
   *  art), set this for a boxed/pill treatment like the title's. */
  descriptionBackground?: string;
  /** Replaces `movie.backdrop`/`movie.poster` outright — for a pin that wants
   *  art other than the movie's own bg_image/poster. */
  backgroundImage?: string;
  /** ▶ ring + glyph colour. Defaults to white. */
  iconColor?: string;
  /** Where the ▶ sits horizontally. Defaults to "right", matching the live
   *  block's art (subject on the right, text on the left). */
  iconPosition?: "left" | "center" | "right";
  /** Padding on the ▶'s positioning box (any CSS `padding` value, e.g.
   *  "20px 40px"). None by default. */
  iconPadding?: string;
  /** Exact horizontal/vertical placement of the ▶ within its box (any CSS
   *  `left`/`top` value, e.g. "61%"/"37%") — wins over `iconPosition`'s
   *  dead-center default without replacing it; still centers ON that point. */
  iconOffsetX?: string;
  iconOffsetY?: string;
  /** WATCH NOW background. Defaults to `titleColor` (so the pill and the
   *  button match unless told otherwise). */
  watchButtonColor?: string;
  /** WATCH NOW text colour. Defaults to white. */
  watchButtonTextColor?: string;
  /** +PLAYLIST background. Defaults to translucent white (VideoFeatureStrip's
   *  own decorative-button look). */
  playlistButtonColor?: string;
  /** +PLAYLIST border colour. Defaults to translucent white. */
  playlistButtonBorderColor?: string;
  /** +PLAYLIST text colour. Defaults to white. */
  playlistButtonTextColor?: string;
}

/**
 * "section-featured-movie" — an arbitrary pinned movie/tv_show post (see
 * getFeaturedMovie in programs.ts), with per-instance look overrides via `style`.
 *
 * Checked against the live block (economy.ams.com.kh's own
 * `section-featured-movie` plugin CSS, 2026-08-12): `movie.backdrop`/`poster`
 * is the WHOLE section's background — full-bleed cover, not a boxed photo —
 * with the host/art already composed into that one finished image, same
 * convention as ProgramHero's key art. An earlier version of this component put
 * the art in a small cropped box beside the text; that's why it rendered as a
 * washed-out sliver of a much wider banner instead of the finished artwork.
 * A later version also added a dark gradient scrim over the art — live's own
 * CSS has none (`background-repeat/size/position` only, no overlay), so it
 * was dropped to match; the art's own tone is what a pin's `style` should
 * adjust, not a scrim.
 *
 * Core REST carries no `video` field for these posts (same limitation as
 * landing-data's getFeature), so the ▶ navigates rather than opening a trailer
 * lightbox — to `movie.watchHref` (the show's newest episode) when there is
 * one, else `movie.href` (the plain program page), same fallback WATCH NOW
 * already uses. Without it the ▶ silently rendered NOTHING for a movie with no
 * linked show (FeatureTrailer returns null with neither a video nor a
 * watchHref) — caught 2026-08-12 on Cambodia 360°, which has none.
 */
export default function FeaturedMovieHero({ movie, style }: { movie: FeaturedMovie; style?: FeaturedMovieStyle }) {
  const art = style?.backgroundImage || movie.backdrop || movie.poster;
  // No art, no band — 460px of flat color is worse than nothing (same call as
  // VideoFeatureStrip).
  if (!art) return null;

  const watchHref = movie.watchHref ?? movie.href;
  const titleColor = style?.titleColor ?? movie.color;
  const titleTextColor = style?.titleTextColor ?? "#fff";
  const descriptionColor = style?.descriptionColor ?? "rgba(255,255,255,.85)";
  const descriptionFontSize = style?.descriptionFontSize ?? "14px";
  const watchButtonColor = style?.watchButtonColor ?? titleColor;
  const watchButtonTextColor = style?.watchButtonTextColor ?? "#fff";
  const playlistButtonColor = style?.playlistButtonColor ?? "rgba(206, 193, 193, 0.7)";
  const playlistButtonBorderColor = style?.playlistButtonBorderColor ?? "rgba(255,255,255,.5)";
  const playlistButtonTextColor = style?.playlistButtonTextColor ?? "#fff";
  const iconBox =
    style?.iconPosition === "left" ? iconBoxLeft : style?.iconPosition === "center" ? iconBoxCenter : iconBoxRight;

  return (
    // Dark in both themes, like VideoFeatureStrip — the art is a finished dark
    // banner, so the light theme's text tokens would go invisible against it.
    <div
      data-theme="dark"
      className={css({
        position: "relative",
        width: "100%",
        overflow: "hidden",
        minHeight: "460px",
      })}
    >
      <CoverImage src={art} sizes="100vw" />

      <div
        className={cx(
          container,
          css({
            position: "relative",
            display: "flex",
            alignItems: "center",
            minHeight: "460px",
            paddingTop: "48px",
            paddingBottom: "48px",
          }),
        )}
      >
        <div className={css({ maxWidth: { base: "100%", md: "480px" } })}>
          <div
            className={css({
              display: "inline-block",
              fontWeight: 700,
              padding: "12px 24px",
              marginBottom: "22px",
            })}
            style={{ background: titleColor, color: titleTextColor, fontSize: style?.titleFontSize ?? "28px" }}
          >
            {movie.title}
          </div>

          {movie.description.length > 0 && (
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginBottom: "30px",
                padding: style?.descriptionBackground ? "16px 20px" : 0,
              })}
              style={style?.descriptionBackground ? { background: style.descriptionBackground } : undefined}
            >
              {movie.description.map((p, i) => (
                <p key={i} className={css({ lineHeight: 1.8 })} style={{ color: descriptionColor, fontSize: descriptionFontSize }}>
                  {p}
                </p>
              ))}
            </div>
          )}

          <div className={css({ display: "flex", gap: "14px" })}>
            <Link
              href={watchHref}
              className={cx(
                cta,
                css({ padding: "12px 26px", fontSize: "13px", fontWeight: 700, letterSpacing: "0.5px" }),
              )}
              style={{ background: watchButtonColor, color: watchButtonTextColor }}
            >
              WATCH NOW
            </Link>
            {/* Decorative, like VideoFeatureStrip's own — no playlist feature exists. */}
            <button
              type="button"
              className={cx(
                cta,
                css({
                  border: "1px solid rgba(255, 255, 255, 0.8)",
                  padding: "12px 26px",
                  fontSize: "13px",
                  fontWeight: 600,
                }),
              )}
              style={{
                background: playlistButtonColor,
                borderColor: playlistButtonBorderColor,
                color: playlistButtonTextColor,
              }}
            >
              + PLAYLIST
            </button>
          </div>
        </div>
      </div>

      {/* Constrains FeatureTrailer's own left:50%/top:50% centering to
          `iconPosition`'s box, rather than dead-center of the whole band,
          which would sit over the text on medium widths for "right"/"left". */}
      <div className={css({ position: "absolute", inset: 0, display: { base: "none", md: "block" } })}>
        <div className={iconBox} style={style?.iconPadding ? { padding: style.iconPadding } : undefined}>
          <FeatureTrailer
            video={null}
            title={movie.title}
            watchHref={watchHref}
            variant="ghost"
            label="WATCH"
            color={style?.iconColor}
            left={style?.iconOffsetX}
            top={style?.iconOffsetY}
          />
        </div>
      </div>
    </div>
  );
}
