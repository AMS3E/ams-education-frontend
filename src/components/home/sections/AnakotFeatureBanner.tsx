import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { cta } from "./styles";
import type { FeaturedMovie } from "@/lib/programs";

/** "អនាគត" — the live homepage's own hand-built promo card, NOT the Vodi
 *  full-bleed backdrop hero FeaturedMovieHero renders.
 *
 *  The live block's own markup (`outerHTML`, pasted 2026-08-27) pins a
 *  background-image — but that exact URL 404s right now
 *  (`.../wp-content/uploads/2023/12/02_ANAS01_PWHP-1-scaled.jpg`, confirmed
 *  via this app's own image-optimizer log: "upstream image response failed
 *  for ... 404"), which is why the live page — and every screenshot taken of
 *  it in this session — actually renders a plain background, not a photo.
 *  Building against a permanently-dead image guarantees a broken-image
 *  fallback forever, so this renders the plain-card look that's what
 *  visitors actually see. `.btn-play{border-style:none !important}` in the
 *  live CSS also strips the inline white circle border; a muted gray
 *  (#bdc3c7, matching the buttons' own border colour) is used here so the
 *  circle stays visible against the plain background instead of vanishing.
 *
 *  Still sourced from the same `getFeaturedMovie` data (title/description/
 *  color/watchHref) — only the layout differs from FeaturedMovieHero. */
export default function AnakotFeatureBanner({ movie }: { movie: FeaturedMovie }) {
  const watchHref = movie.watchHref ?? movie.href;
  // The live block shows only its opening paragraph before the buttons — the
  // rest of movie.description is the /program/anakot page's fuller bio, not
  // part of this homepage teaser (REST-verified against the raw block, which
  // has exactly one <p> here, 2026-08-27).
  const teaser = movie.description.slice(0, 1);

  return (
    <div
      className={cx(
        container,
        css({
          height: "50vh",
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          justifyContent: "center",
        }),
      )}
    >
      <div
        className={css({
          display: "grid",
          width: "100%",
          gridTemplateColumns: { base: "1fr", md: "minmax(0,1fr) 50%" },
          gap: "24px",
          alignItems: "center",
        })}
      >
        <div className={css({ maxWidth: "560px" })}>
          <div
            className={css({
              display: "block",
              width: "100%",
              fontWeight: 700,
              fontSize: "20px",
              borderRadius: "5px",
              padding: "15px 30px",
              marginBottom: "18px",
            })}
            style={{ background: movie.color, color: "#fff" }}
          >
            {movie.title}
          </div>

          {teaser.length > 0 && (
            <div className={css({ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" })}>
              {teaser.map((p, i) => (
                <p key={i} className={css({ color: "#2c3e50", lineHeight: 2, fontSize: "15px" })}>
                  {p}
                </p>
              ))}
            </div>
          )}

          <div className={css({ display: "flex", gap: "15px", flexWrap: "wrap" })}>
            <Link
              href={watchHref}
              className={cx(
                cta,
                css({
                  borderRadius: "5px",
                  padding: "15px 30px",
                  fontSize: "16px",
                  fontWeight: 700,
                  border: "2px solid #bdc3c7",
                }),
              )}
              style={{ background: movie.color, color: "#fff" }}
            >
              ទស្សនាឥឡូវនេះ
            </Link>
            {/* Decorative, like FeaturedMovieHero's own +PLAYLIST — no watch-later feature exists. */}
            <Link
              href={watchHref}
              className={cx(
                cta,
                css({
                  borderRadius: "5px",
                  padding: "15px 30px",
                  fontSize: "16px",
                  fontWeight: 700,
                  border: "2px solid #95a5a6",
                }),
              )}
              style={{ color: "#000" }}
            >
              ទស្សនានៅពេលក្រោយ
            </Link>
          </div>
        </div>

        <div className={css({ display: { base: "none", md: "flex" }, justifyContent: "flex-start" })}>
          <Link
            href={watchHref}
            aria-label={movie.title}
            className={css({
              display: "flex",
              width: "220px",
              height: "220px",
              borderRadius: "50%",
              border: "1px solid #bdc3c7",
              alignItems: "center",
              justifyContent: "center",
              color: "#bdc3c7",
              transition: "color .2s, border-color .2s",
              _hover: { color: "text", borderColor: "text" },
            })}
          >
            <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
