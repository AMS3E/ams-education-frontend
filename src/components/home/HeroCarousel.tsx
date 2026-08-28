"use client";

import { useCallback, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { css } from "@/styled-system/css";
import HeroSlide from "./HeroSlide";
import type { HeroBanner } from "@/lib/hero-banners";

// Autoplay interval (ms). Shared between the plugin and the progress ring so the
// countdown animation always matches the real timer.
const AUTOPLAY_DELAY = 5000;

// Geometry of the progress ring (SVG circle). The dash length equals the
// circumference, so animating strokeDashoffset from full → 0 sweeps the arc.
const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const wrap = css({ position: "relative", width: "100%", overflow: "hidden", height: "650px" });
const viewport = css({ overflow: "hidden", height: "100%" });
const track = css({ display: "flex", alignItems: "stretch", height: "100%" });
const slide = css({ flex: "0 0 100%", minWidth: 0 });

// Prev/next controls overlaid on the slider itself, centered near the bottom.
// A light frosted pill keeps the controls legible over any banner color.
const controls = css({
  position: "absolute",
  left: "50%",
  bottom: "20px",
  transform: "translateX(-50%)",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: "12px",
  px: "12px",
  py: "7px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.55)",
  backdropFilter: "blur(10px)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "rgba(0,0,0,0.06)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
});

const navBtn = css({
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "rgba(0,0,0,0.15)",
  background: "transparent",
  color: "#1a1a22",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  lineHeight: 1,
  cursor: "pointer",
  transition: "background .2s, border-color .2s",
  _hover: { background: "rgba(0,0,0,0.06)", borderColor: "rgba(0,0,0,0.4)" },
});

const progressRing = css({ flex: "0 0 auto", display: "block" });

export default function HeroCarousel({ banners }: { banners: HeroBanner[] }) {
  const multiple = banners.length > 1;

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: multiple, align: "start" },
    multiple ? [Autoplay({ delay: AUTOPLAY_DELAY, stopOnInteraction: false })] : [],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Drive the countdown ring: each frame, read how long until the next auto
  // slide and set the arc length accordingly (0 = just advanced, full = due).
  const arcRef = useRef<SVGCircleElement>(null);
  useEffect(() => {
    if (!emblaApi) return;
    const autoplay = emblaApi.plugins()?.autoplay;
    if (!autoplay) return;

    let raf = 0;
    const tick = () => {
      const arc = arcRef.current;
      const remaining = autoplay.timeUntilNext();
      if (arc && remaining !== null) {
        const progress = Math.min(1, Math.max(0, 1 - remaining / AUTOPLAY_DELAY));
        arc.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [emblaApi]);

  return (
    <section aria-roledescription='carousel' aria-label='Featured banners'>
      <div className={wrap}>
        <div className={viewport} ref={emblaRef}>
          <div className={track}>
            {banners.map((b, i) => (
              <div key={b.id} className={slide}>
                <HeroSlide banner={b} priority={i === 0} />
              </div>
            ))}
          </div>
        </div>

        {multiple && (
          <div className={controls}>
            <button type='button' aria-label='Previous slide' onClick={scrollPrev} className={navBtn}>
              ‹
            </button>
            <svg className={progressRing} width='18' height='18' viewBox='0 0 20 20' aria-hidden='true'>
              {/* track */}
              <circle cx='10' cy='10' r={RING_RADIUS} fill='none' stroke='rgba(0,0,0,0.18)' strokeWidth='2' />
              {/* countdown arc — starts at 12 o'clock, sweeps clockwise */}
              <circle
                ref={arcRef}
                cx='10'
                cy='10'
                r={RING_RADIUS}
                fill='none'
                stroke='#e0264f'
                strokeWidth='2'
                strokeLinecap='round'
                transform='rotate(-90 10 10)'
                style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE }}
              />
            </svg>
            <button type='button' aria-label='Next slide' onClick={scrollNext} className={navBtn}>
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
