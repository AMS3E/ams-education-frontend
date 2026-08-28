"use client";

import { useCallback, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { css, cx } from "@/styled-system/css";
import type { HomeCard } from "@/lib/home-data";
import ThumbCard from "./ThumbCard";

// The mobile/tablet form of the health + obsok grids. On a phone the 12-card grid
// would drop to 3 columns and stack into four tall rows; instead we pack the cards
// two-per-column and let embla scroll the columns, so it reads as a two-row shelf
// you swipe sideways. Desktop keeps the static 6×2 grid — this only renders below
// `lg` (the parent hides it above).
function toColumns(items: HomeCard[]): HomeCard[][] {
  const out: HomeCard[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

const viewport = css({ overflow: "hidden" });
const track = css({ display: "flex", gap: "10px" });

// ~2.5 columns peek on a phone so it plainly reads as scrollable, capped so the
// cards don't balloon on a tablet.
const column = css({
  flex: "0 0 42%",
  minWidth: "132px",
  maxWidth: "188px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
});

// Overlay arrows in the site's control tokens (as PosterCarousel does). Hidden —
// not just greyed — at each end: a dead arrow on a shelf reads as broken.
const arrow = css({
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 2,
  width: "34px",
  height: "34px",
  borderRadius: "50%",
  border: "none",
  background: "control.bg",
  color: "control.fg",
  fontSize: "20px",
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 2px 10px rgba(0,0,0,.35)",
  transition: "opacity .2s",
  _disabled: { opacity: 0, pointerEvents: "none" },
});

export default function TwoRowShelf({ items, className }: { items: HomeCard[]; className?: string }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Drive the arrows' disabled state straight on the DOM (as HeroCarousel drives
  // its progress ring) rather than through React state, so there is no setState
  // inside the effect and no cascading render on every "select".
  const sync = useCallback((api: NonNullable<typeof emblaApi>) => {
    if (prevRef.current) prevRef.current.disabled = !api.canScrollPrev();
    if (nextRef.current) nextRef.current.disabled = !api.canScrollNext();
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    sync(emblaApi);
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi, sync]);

  return (
    <div className={cx(css({ position: "relative" }), className)}>
      <div className={viewport} ref={emblaRef}>
        <div className={track}>
          {toColumns(items).map((col, i) => (
            <div key={i} className={column}>
              {col.map((item, j) => (
                <ThumbCard key={j} item={item} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* prev starts disabled (nothing to the left yet); sync() corrects both
          arrows once embla measures. */}
      <button ref={prevRef} type="button" aria-label="មុន" disabled onClick={() => emblaApi?.scrollPrev()} className={cx(arrow, css({ left: "-6px" }))}>
        ‹
      </button>
      <button ref={nextRef} type="button" aria-label="បន្ទាប់" onClick={() => emblaApi?.scrollNext()} className={cx(arrow, css({ right: "-6px" }))}>
        ›
      </button>
    </div>
  );
}
