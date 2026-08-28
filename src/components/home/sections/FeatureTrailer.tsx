"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { css } from "@/styled-system/css";
import type { Video } from "@/lib/api/video";

// Centers the button (+ optional label, stacked beneath it) as one group —
// the button itself no longer self-positions, so a label can sit under it
// without throwing off the centering math. Hover scales the whole group.
const wrap = css({
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%,-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  cursor: "pointer",
  textDecoration: "none",
  transition: "transform .2s",
  _hover: { transform: "translate(-50%,-50%) scale(1.06)" },
  // Resets <button>'s native chrome — a no-op on the <Link> branch, which has
  // none of these by default.
  border: "none",
  background: "none",
  padding: 0,
  font: "inherit",
});

const playButtonBase = {
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "opacity .2s",
} as const;

// Solid: a filled white disc over photographic art (VideoFeatureStrip).
const playButtonSolid = css({
  ...playButtonBase,
  width: "84px",
  height: "84px",
  background: "rgba(255,255,255,.92)",
  boxShadow: "0 4px 24px rgba(0,0,0,.4)",
  border: "none",
});
const playGlyphSolid = css({ color: "#15161d", fontSize: "30px", marginLeft: "5px" });

// Ghost: a large outlined, mostly-transparent ring — matches the live
// section-featured-movie block's own ▶ (economy.ams.com.kh, checked 2026-08-12).
const playButtonGhost = css({
  ...playButtonBase,
  width: "120px",
  height: "120px",
  background: "transparent",
  border: "2px solid #fff",
  opacity: 0.8,
  _hover: { opacity: 1 },
});
const playGlyphGhost = css({ color: "#fff", fontSize: "40px", marginLeft: "6px" });

const watchLabel = css({
  color: "#fff",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "1px",
  textTransform: "uppercase",
  textShadow: "0 2px 8px rgba(0,0,0,.5)",
});

/** The ▶ button on the feature strip. With a trailer it opens a lightbox (the
 *  live site's fancybox behaviour); with none it NAVIGATES to `watchHref` — the
 *  show's newest episode — which is what live's own player template does. Only
 *  when it has neither does it render nothing.
 *
 *  `variant` — "solid" (default) is VideoFeatureStrip's filled white disc over
 *  photographic art; "ghost" is the large outlined ring FeaturedMovieHero uses,
 *  matching the live section-featured-movie block's own ▶.
 *
 *  `label` — optional caption stacked under the button ("WATCH").
 *
 *  `color` — ghost variant only: overrides the ring/glyph colour (default
 *  white). No effect on "solid", whose white disc is meant to read against any
 *  art — recoloring it would fight the art rather than the background.
 *
 *  `left`/`top` — override the button's position within its containing box
 *  (default dead-center, 50%/50%). Still centers ON that point either way —
 *  only the point itself moves.
 *
 *  The iframe is only mounted while the lightbox is open, so the banner costs
 *  nothing on a page nobody clicks it on. */
export default function FeatureTrailer({
  video,
  title,
  watchHref,
  variant = "solid",
  label,
  color,
  left,
  top,
}: {
  video: Video | null;
  title: string;
  watchHref?: string;
  variant?: "solid" | "ghost";
  label?: string;
  color?: string;
  left?: string;
  top?: string;
}) {
  const [open, setOpen] = useState(false);
  const playButton = variant === "ghost" ? playButtonGhost : playButtonSolid;
  const playGlyph = variant === "ghost" ? playGlyphGhost : playGlyphSolid;
  const ghostStyle = variant === "ghost" && color ? { borderColor: color } : undefined;
  const glyphStyle = variant === "ghost" && color ? { color } : undefined;
  const wrapStyle = left || top ? { left, top } : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // The page behind a lightbox must not scroll.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!video) {
    if (!watchHref) return null;
    return (
      <Link href={watchHref} aria-label={`Watch ${title}`} className={wrap} style={wrapStyle}>
        <span className={playButton} style={ghostStyle}>
          <span className={playGlyph} style={glyphStyle}>▶</span>
        </span>
        {label && <span className={watchLabel}>{label}</span>}
      </Link>
    );
  }

  return (
    <>
      <button
        type='button'
        aria-label={`Play the ${title} trailer`}
        onClick={() => setOpen(true)}
        className={wrap}
        style={wrapStyle}>
        <span className={playButton} style={ghostStyle}>
          <span className={playGlyph} style={glyphStyle}>▶</span>
        </span>
        {label && <span className={watchLabel}>{label}</span>}
      </button>

      {open && (
        <div
          role='dialog'
          aria-modal='true'
          aria-label={`${title} trailer`}
          onClick={() => setOpen(false)}
          className={css({
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          })}>
          <div
            // The backdrop closes on click; the player itself must not.
            onClick={e => e.stopPropagation()}
            className={css({
              position: "relative",
              width: "100%",
              maxWidth: "960px",
              aspectRatio: "16 / 9",
              background: "#000",
            })}>
            {/* Vimeo and YouTube are both an iframe over a `src` — toVideo always
                emits a query string on both, so `&autoplay=1` appends cleanly. */}
            {(video.kind === "vimeo" || video.kind === "youtube") && (
              <iframe
                src={`${video.src}&autoplay=1`}
                title={`${title} trailer`}
                allow='autoplay; fullscreen; picture-in-picture'
                allowFullScreen
                className={css({ width: "100%", height: "100%", border: 0 })}
              />
            )}
            {video.kind === "file" && (
              <video src={video.url} controls autoPlay className={css({ width: "100%", height: "100%" })} />
            )}
            {/* An editor-pasted embed. Trusted: it comes from our own WP admin. */}
            {video.kind === "embed" && (
              <div
                dangerouslySetInnerHTML={{ __html: video.html }}
                className={css({ width: "100%", height: "100%", "& iframe": { width: "100%", height: "100%" } })}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
