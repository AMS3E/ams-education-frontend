"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { css } from "@/styled-system/css";
import { mapWpUrl, WP_ORIGIN } from "@/lib/wp-url-map";
import type { SliderRatio } from "@/lib/article-sliders";

/**
 * One Slider Revolution module from an article body, framed from `/sr-embed`.
 *
 * Why a frame and not a port: the module needs sr7.css, tptools.js, sr7.js, the
 * `_tpt` bootstrap and its own ~51KB `SR7.JSON` config, none of which travel in
 * `post_content`. WordPress emits all of it around `[rev_slider]`, so the honest
 * move is to let WordPress render the slider and frame the result — the same
 * shape the hero (HeroEmbed) and the display ads (AdEmbed) already use.
 *
 * Differs from HeroEmbed in two ways that matter here:
 *
 *  - SPACE IS RESERVED FROM THE MODULE'S OWN GEOMETRY, not a guess. An article
 *    holds many modules at wildly different heights (477–1069px on the post that
 *    drove this), so a single fixed reservation would be wrong for nearly all of
 *    them. `ratio` comes from SR's own breakpoint arrays, which means zero
 *    layout shift when the real height arrives.
 *  - IT LOADS ON INTERSECTION, NOT `loading="lazy"`. This is what makes the
 *    modules ANIMATE instead of arriving as finished stills, and it is not a
 *    performance tweak — it is the whole behaviour.
 *
 *    Each module sets `globalViewPort: true`, so Slider Revolution plays its
 *    intro once the module is "in the viewport". Inside a frame that test is
 *    satisfied the moment the document loads, because the module IS the frame's
 *    viewport. Measured on the live embed: layer opacity is 0.20 at t=400ms and
 *    settled at 1.0 by t=800ms — the animation runs, start to finish, within a
 *    second of the frame loading.
 *
 *    `loading="lazy"` does not save us: Chrome's lazy threshold is generous
 *    (hundreds to thousands of px), so the frame loaded far below the fold,
 *    played its intro to nobody, and was a static image by the time it was
 *    scrolled to. Holding `src` until an IntersectionObserver says the box is
 *    genuinely near the viewport puts the load — and therefore the animation —
 *    where the reader can see it.
 *
 *    The 200px rootMargin is deliberate: it covers the frame's boot cost (the
 *    runtime is shared, so every module after the first is warm) so the intro
 *    starts as the module comes into view rather than after a visible pause. It
 *    also mirrors the `-200px` viewport threshold the modules themselves carry.
 */
export default function SrEmbed({ alias, ratio }: { alias: string; ratio: SliderRatio | null }) {
  const [height, setHeight] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    // The observer STAYS connected after the first load. It has two jobs: load
    // the frame the first time the module nears the viewport, and afterwards
    // ask it to replay each time it comes BACK — which is what WordPress does
    // natively and a framed module cannot work out for itself, since it never
    // leaves its own viewport. Only this side knows where the frame really sits.
    let loaded = false;
    let wasVisible = false;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);

        if (visible && !loaded) {
          loaded = true;
          wasVisible = true;
          setSrc(`${WP_ORIGIN}/sr-embed?alias=${encodeURIComponent(alias)}`);
          return;
        }

        // Edge-triggered: only a genuine out-then-in replays. Without the edge
        // check every scroll tick that keeps the module on screen would restart
        // the intro mid-read.
        if (visible && !wasVisible && loaded) {
          frameRef.current?.contentWindow?.postMessage({ amsEmbedReplay: true }, WP_ORIGIN);
        }
        wasVisible = visible;
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(box);
    return () => io.disconnect();
  }, [alias]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== WP_ORIGIN) return;
      // Only listen to OUR frame. Every slider on the page posts the same
      // message shape, so without this the tallest module would win and every
      // frame on the article would resize to it.
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;

      const data = e.data as { amsEmbedHeight?: number; amsEmbedNav?: string } | null;

      // The reported height is a FALLBACK, not the source of truth.
      //
      // Slider Revolution lays a module out several times while booting, and
      // the frame dutifully reports each attempt: measured on this article,
      // every module announced a transient 460px (SR's tablet layout) and one
      // announced 5030px before settling seconds later. Applying those is what
      // made the page heave up and down as the reader scrolled.
      //
      // The declared geometry does not have that problem, and it is not an
      // approximation — it matches where every module actually lands:
      //     declared  589 1069 477 934 876 496 758 150
      //     measured  589 1069 477 934 876 496 758 146
      // So when we have it, we size from it and ignore the chatter entirely.
      // Only a module whose geometry we could not parse falls back to asking.
      if (!ratio) {
        const h = data?.amsEmbedHeight;
        if (typeof h === "number" && h > 0) setHeight(h);
      }

      const nav = data?.amsEmbedNav;
      if (typeof nav === "string" && nav) {
        const mapped = mapWpUrl(nav);
        if (mapped) router.push(mapped);
        else window.open(nav, "_blank", "noopener");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router, ratio]);

  // Geometry wins when we have it: a fixed aspect box that never renegotiates,
  // so there is no layout shift to chase. `height` only ever fills in for the
  // module we could not measure statically.
  const measured = !ratio && height > 0;

  return (
    <div
      ref={boxRef}
      // NO vertical margin, deliberately. These modules are authored to tile
      // into one continuous composition — backgrounds run edge to edge across
      // module boundaries — and WordPress stacks them flush (measured: 0px
      // between all eight). A 24px gap here punched white bands through the
      // middle of the artwork.
      className={css({ width: "100%" })}
      // Hold the module's declared shape until it reports its real height, then
      // hand control to that. `aspectRatio` and an explicit height would fight
      // otherwise, and the frame's own number is the truthful one.
      style={
        measured
          ? { height: `${height}px` }
          : ratio
            ? ({ "--ar-m": ratio.mobile, "--ar-d": ratio.desktop } as React.CSSProperties)
            : { minHeight: "320px" }
      }
    >
      <iframe
        ref={frameRef}
        // Undefined until the observer above fires. Setting it later is what
        // starts the load, and with it the module's intro animation.
        src={src ?? undefined}
        title="Article graphic"
        scrolling="no"
        className={css({
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          // Only applies while the wrapper is still ratio-reserved; once a real
          // height lands the wrapper is a fixed box and height:100% fills it.
          aspectRatio: { base: "var(--ar-m, auto)", md: "var(--ar-d, auto)" },
        })}
      />
    </div>
  );
}
