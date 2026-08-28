"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { css } from "@/styled-system/css";
// Shared with the article-slider frames (SrEmbed): both forward slide clicks to
// the parent and need the same answer for "is this WP URL one of ours?".
import { mapWpUrl, WP_ORIGIN } from "@/lib/wp-url-map";
import { HOME_HERO_ALIAS } from "@/lib/hero-alias";

/**
 * Embeds a live Slider Revolution hero (authored in WordPress) via an iframe
 * pointing at /sr-embed. `alias` picks a landing page's own slider; omit it for
 * the homepage's. The route validates the alias against Slider Revolution's
 * own module table, so it follows the live CMS without the older /hero-embed
 * route's stale hand-maintained whitelist.
 *
 * The slider's grid ratios reserve the correct responsive height in CSS before
 * hydration. The embed page's postMessage is only a late exact-height
 * correction, so a message sent before this component's effect attaches can no
 * longer leave the iframe at 0px (the old intermittent disappearing-banner
 * bug).
 * It also forwards slide-link CLICKS as postMessage: every anchor in the
 * slider is an absolute WordPress URL, and before this the hero was a trapdoor
 * out of the app (AUDIT.md Tier 2 §14).
 */
// Shown over the reserved band until the slider reports its height — the same
// shimmer CoverImage uses, so the hero reads as "loading" rather than blank.
const placeholder = css({
  position: "absolute",
  inset: 0,
  backgroundColor: "skeleton.base",
  backgroundImage:
    "linear-gradient(90deg, token(colors.skeleton.base) 0%, token(colors.skeleton.sheen) 50%, token(colors.skeleton.base) 100%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s ease-in-out infinite",
  _motionReduce: { backgroundImage: "none", animation: "none" },
});

export default function HeroEmbed({ alias }: { alias?: string }) {
  const [height, setHeight] = useState(0);
  const router = useRouter();

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== WP_ORIGIN) return;
      const data = e.data as {
        amsHeroHeight?: number;
        amsHeroNav?: string;
        amsEmbedHeight?: number;
        amsEmbedNav?: string;
      } | null;

      const h = data?.amsEmbedHeight ?? data?.amsHeroHeight;
      if (typeof h === "number" && h > 0) setHeight(h);

      const nav = data?.amsEmbedNav ?? data?.amsHeroNav;
      if (typeof nav === "string" && nav) {
        const mapped = mapWpUrl(nav);
        if (mapped) router.push(mapped);
        else window.open(nav, "_blank", "noopener");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  const sliderAlias = alias ?? HOME_HERO_ALIAS;
  const src = `${WP_ORIGIN}/sr-embed?alias=${encodeURIComponent(sliderAlias)}`;

  const measured = height > 0;

  return (
    <div
      className={css({
        position: "relative",
        width: "100%",
        overflow: "hidden",
        // Slider Revolution's grid config is:
        // gw [1840, 1840, 1024, 778, 480], gh [650, 650, 400, 350, 600].
        // Match its effective breakpoints so the frame has the right height
        // even when its early postMessage is missed during React hydration.
        aspectRatio: "480 / 600",
        "@media (min-width: 481px)": { aspectRatio: "778 / 350" },
        "@media (min-width: 779px)": { aspectRatio: "1024 / 400" },
        "@media (min-width: 1025px)": { aspectRatio: "1840 / 650" },
      })}
      style={measured ? { height: `${height}px` } : undefined}
    >
      <div className={placeholder} aria-hidden />
      <iframe
        src={src}
        title="Featured banners"
        loading="eager"
        className={css({ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", border: "0" })}
      />
    </div>
  );
}
