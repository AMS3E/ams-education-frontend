"use client";

import { useEffect, useRef, useState } from "react";
import { css } from "@/styled-system/css";

// For a FIXED-size creative (see Promo.fixed): the export renders at its native
// pixel width and clips in a narrower column, so we render the iframe at that
// native size and scale the whole frame down to the column with a transform.
// Scaling DOWN keeps it sharp; we cap at 1× so a column wider than the creative
// (desktop) shows it native rather than upscaled and soft.
//
// The box carries the creative's aspect ratio, so the slot holds its height
// before the frame paints and the scaled iframe fills it exactly (visual width =
// native width × scale = box width).

const box = css({ position: "relative", width: "100%", mx: "auto", alignSelf: "start", overflow: "hidden" });
const frame = css({ position: "absolute", top: 0, left: 0, border: 0, transformOrigin: "top left" });

export default function ScaledAdFrame({ src, title, width, height }: { src: string; title: string; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // setState fires from the observer callback (a subscription), not synchronously
    // in the effect body — so it doesn't trip the repo's set-state-in-effect rule.
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={ref} className={box} style={{ maxWidth: `${width}px`, aspectRatio: `${width} / ${height}` }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        scrolling="no"
        className={frame}
        style={{ width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` }}
      />
    </div>
  );
}
