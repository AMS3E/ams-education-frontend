"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";

export interface PosterItem {
  src: string;
  title: string;
  /** Small line above the title — a year on the poster band, an episode number
   *  ("S1:E44") on a program page's episode carousel. */
  year?: string;
  /** When set, the whole card links here. */
  href?: string;
  /** The card the viewer is currently on (the episode being watched) — draws a
   *  highlight outline. Used by the episode page's season browser. */
  active?: boolean;
}

/** The left rail of the "aside" layout — heading + blurb + "see all" beside
 *  the track. */
export interface CarouselAside {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
}

const card = css({ display: "block", flex: "0 0 224px", color: "inherit", textDecoration: "none" });
// One card's scroll step: its own 224px plus the track's 16px gap — so
// "advance one card" (wheel-free auto-scroll) and the wheel handler both
// move by exactly one card width, never landing mid-card.
const CARD_STEP = 224 + 16;
// Auto-advance cadence. Long enough to read a title, short enough that the
// whole rail cycles in well under a minute.
const AUTO_SCROLL_MS = 3500;

const poster = css({
  position: "relative",
  width: "100%",
  aspectRatio: "2/3",
  overflow: "hidden",
  cursor: "pointer",
  "& img": { transition: "transform .45s ease" },
  _hover: { "& img": { transform: "scale(1.06)" } },
});

const posterCurrent = css({ outline: "2px solid token(colors.brand.blue)", outlineOffset: "2px" });

const meta = css({ marginTop: "10px" });
const yearText = css({ color: "muted", fontSize: "11px" });
const titleText = css({ color: "text", fontSize: "12.5px", fontWeight: 600, marginTop: "3px" });

// Centered on the poster IMAGE, not the whole card — the card also carries
// meta text (year/title) below the image, so "top: 50%" of the card's own
// height lands well below the image's true center. 336px = the 224px card's
// 2/3 aspect-ratio image height; 168px is that image's own vertical center.
const arrowButton = css({
  position: "absolute",
  top: "168px",
  translate: "0 -50%",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  border: "1px solid",
  borderColor: "muted",
  background: "control.bg",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "control.fg",
  cursor: "pointer",
  transition: "opacity .2s",
  zIndex: 1,
  _hover: { opacity: 0.7 },
  _disabled: { opacity: 0.35, cursor: "default", _hover: { opacity: 0.35 } },
});

export default function PosterCarousel({
  posters,
  aside,
  unoptimized,
  autoScrollMs = AUTO_SCROLL_MS,
}: {
  posters: PosterItem[];
  aside?: CarouselAside;
  /** See CoverImage's `unoptimized` — applied to every poster in the track. */
  unoptimized?: boolean;
  /** Delay between one-card auto-advances. */
  autoScrollMs?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // Tracks scroll position so the prev/next arrows can disable themselves at
  // each end, rather than looping or scrolling past the track's edges.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      setAtStart(el.scrollLeft <= 0);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [posters]);

  const scrollByCard = (direction: 1 | -1) => {
    trackRef.current?.scrollBy({ left: direction * CARD_STEP, behavior: "smooth" });
  };

  // Vertical mouse-wheel scrolls the track horizontally — the browser doesn't
  // do this on its own for an overflow-x container. A trackpad's own
  // horizontal swipe (deltaX) is left alone so it isn't fought or doubled.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "auto" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Desktop mouse drag. Native overflow already handles touch/trackpad, but a
  // mouse cannot grab a horizontal rail by default. Suppress the link click
  // only when the pointer actually moved, so ordinary card clicks still work.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > 4) moved = true;
      el.scrollLeft = startScroll - delta;
    };
    const finishDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const suppressDraggedClick = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };
    const preventImageDrag = (e: DragEvent) => e.preventDefault();

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", finishDrag);
    el.addEventListener("pointercancel", finishDrag);
    el.addEventListener("click", suppressDraggedClick, true);
    el.addEventListener("dragstart", preventImageDrag);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", finishDrag);
      el.removeEventListener("pointercancel", finishDrag);
      el.removeEventListener("click", suppressDraggedClick, true);
      el.removeEventListener("dragstart", preventImageDrag);
    };
  }, []);

  // Auto-advance one card at a time, looping back to the start at the end.
  // Paused on hover/focus so it never fights a viewer mid-read or mid-scroll.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let paused = false;
    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    const id = setInterval(() => {
      if (paused) return;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + CARD_STEP, behavior: "smooth" });
    }, autoScrollMs);
    return () => {
      clearInterval(id);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
    };
  }, [autoScrollMs]);

  const track = (
    <div
      ref={trackRef}
      tabIndex={0}
      aria-label='Scroll for more'
      className={css({
        display: "flex",
        gap: "16px",
        overflowX: "auto",
        scrollBehavior: "smooth",
        cursor: "grab",
        userSelect: "none",
        padding: "4px 0",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      })}>
      {posters.map((p, i) => {
        const body = (
          <>
            <div className={cx(poster, p.active && posterCurrent)}>
              <CoverImage src={p.src} sizes='224px' unoptimized={unoptimized} />
            </div>
            <div className={meta}>
              {p.year && <div className={yearText}>{p.year}</div>}
              <div className={titleText}>{p.title}</div>
            </div>
          </>
        );

        return p.href ? (
          <Link key={i} href={p.href} className={card}>
            {body}
          </Link>
        ) : (
          <div key={i} className={card}>
            {body}
          </div>
        );
      })}
    </div>
  );

  const arrows = (
    <>
      <button
        type="button"
        aria-label="មុន"
        onClick={() => scrollByCard(-1)}
        disabled={atStart}
        className={cx(arrowButton, css({ left: "0" }))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="បន្ទាប់"
        onClick={() => scrollByCard(1)}
        disabled={atEnd}
        className={cx(arrowButton, css({ right: "0" }))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </>
  );

  // Aside layout: heading, blurb and "see all" stacked in a left rail, with
  // the track running alongside. Used by the landing pages' សម្រាប់លោកអ្នក.
  if (aside) {
    return (
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "300px minmax(0,1fr)" },
          gap: "30px",
          alignItems: "start",
        })}>
        <div>
          <h2 className={css({ fontSize: "28px", fontWeight: 600, color: "text", lineHeight: 1.4 })}>{aside.title}</h2>
          {aside.subtitle && (
            <p className={css({ fontSize: "13px", color: "muted", marginTop: "10px" })}>{aside.subtitle}</p>
          )}
          {aside.seeAllHref && (
            <Link
              href={aside.seeAllHref}
              className={css({
                display: "inline-block",
                marginTop: "22px",
                fontSize: "14px",
                color: "muted",
                textDecoration: "none",
                transition: "opacity .2s",
                _hover: { opacity: 0.7 },
              })}>
              មើលទាំងអស់ ›
            </Link>
          )}
        </div>
        <div className={css({ position: "relative" })}>
          {track}
          {arrows}
        </div>
      </div>
    );
  }

  return (
    <div className={css({ position: "relative" })}>
      {track}
      {arrows}
    </div>
  );
}
