"use client";

import Image from "next/image";
import { useState } from "react";
import { css } from "@/styled-system/css";

type Props = {
  src: string;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  /** Skips next/image's optimizer, serving `src` as-is (no `/_next/image`
   *  proxy, no resize). For sources already served pre-sized — WordPress's
   *  own thumbnail crops, e.g. the episode rail's 100x177 exports — the
   *  optimizer only adds a hop with nothing to shrink. */
  unoptimized?: boolean;
};

// Shared geometry: both layers fill the (positioned) parent, exactly as
// next/image's `fill` does, so the placeholder and the photo occupy the same box.
const layer = { position: "absolute", inset: 0 } as const;

// The resting placeholder. Also the whole of the empty/broken state — a flat,
// unanimated surface reads as "there is no image here" rather than "still loading".
const surface = css({ ...layer, background: "skeleton.base" });

// The loading state: same surface, plus a highlight band swept across it. Under
// `prefers-reduced-motion` the gradient is dropped entirely, leaving `surface`.
const loadingSurface = css({
  ...layer,
  backgroundColor: "skeleton.base",
  backgroundImage:
    "linear-gradient(90deg, token(colors.skeleton.base) 0%, token(colors.skeleton.sheen) 50%, token(colors.skeleton.base) 100%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s ease-in-out infinite",
  _motionReduce: { backgroundImage: "none", animation: "none" },
});

const photo = css({ objectFit: "cover" });

/**
 * A remote cover image that fills its (positioned) parent, showing a neutral
 * placeholder underneath until it loads.
 *
 * The placeholder is deliberately *behind* an always-opaque image rather than
 * cross-faded with it: the photo then paints the instant it decodes, with no
 * dependency on hydration. Fading it in would mean rendering it at `opacity: 0`
 * on the server, which hides it from Largest Contentful Paint until React boots.
 */
export default function CoverImage({
  src,
  alt = "",
  sizes = "(max-width: 768px) 50vw, 25vw",
  priority = false,
  unoptimized = false,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // No src (e.g. an episode with no featured image) or a load failure: the flat
  // surface is the final state, so never animate it.
  if (!src || failed) return <span className={surface} aria-hidden />;

  return (
    <>
      {!loaded && <span className={loadingSurface} aria-hidden />}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={unoptimized}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={photo}
      />
    </>
  );
}
