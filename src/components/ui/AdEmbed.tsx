import { css } from "@/styled-system/css";
import type { Promo } from "@/lib/promos";
import ScaledAdFrame from "./ScaledAdFrame";

/** A display ad served as a self-contained HTML creative in an iframe.
 *
 *  The creatives are Slider Revolution exports: a whole document each, with
 *  their own scripts and global CSS. An iframe is what keeps that off our page.
 *
 *  The box is sized by aspect ratio so nothing shifts when the creative paints,
 *  and never wider than the creative's own width — these are animated raster
 *  compositions, and upscaling one visibly softens it. In a column wider than
 *  that, the ad centres. `alignSelf: start` opts out of the grid/flex stretch
 *  its parents apply, which would otherwise fight the aspect ratio for control
 *  of the height. */
export default function AdEmbed({ promo }: { promo: Promo }) {
  // The creative reads its landing page from `?clickTag=` and wires up its own
  // click handler. Without one it renders, but does nothing when clicked.
  const src = promo.clickTag ? `${promo.src}?clickTag=${encodeURIComponent(promo.clickTag)}` : promo.src;

  // Fixed-size creatives can't shrink themselves — scale the frame to fit instead.
  if (promo.fixed) {
    return <ScaledAdFrame src={src} title={promo.title} width={promo.width} height={promo.height} />;
  }

  return (
    <div
      className={css({ width: "100%", mx: "auto", alignSelf: "start" })}
      style={{ maxWidth: `${promo.width}px` }}>
      <div className={css({ position: "relative", width: "100%" })} style={{ aspectRatio: `${promo.width} / ${promo.height}` }}>
        <iframe
          src={src}
          title={promo.title}
          loading='lazy'
          scrolling='no'
          className={css({ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 })}
        />
      </div>
    </div>
  );
}
