"use client";

import { useCallback, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { css, cx } from "@/styled-system/css";
import ArticleCard from "@/components/ui/ArticleCard";
import type { ArticleRef } from "@/lib/articles";

// Overlay arrows in the site's control tokens, as TwoRowShelf's. Hidden — not
// just greyed — at each end: a dead arrow on a rail reads as broken.
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

/** Four-up summary-news rail that advances one card at a slow reading pace,
 *  with prev/next arrows for manual paging. */
export default function SummaryNewsCarousel({ items }: { items: ArticleRef[] }) {
  const [viewportRef, emblaApi] = useEmblaCarousel(
    { align: "start", loop: items.length > 4, slidesToScroll: 1 },
    items.length > 4 ? [Autoplay({ delay: 5000, stopOnInteraction: false })] : [],
  );
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Drive the arrows' disabled state straight on the DOM (as TwoRowShelf does)
  // rather than through React state, so there is no setState inside the effect.
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
    <div className={css({ position: "relative" })}>
      <div ref={viewportRef} className={css({ overflow: "hidden" })}>
        <div className={css({ display: "flex", marginLeft: "-18px" })}>
          {items.map((item) => (
            <div
              key={item.slug}
              className={css({
                flex: { base: "0 0 50%", md: "0 0 25%" },
                minWidth: 0,
                paddingLeft: "18px",
              })}
            >
              <ArticleCard item={item} sizes="(max-width: 768px) 50vw, 260px" />
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
