import { css, cx } from "@/styled-system/css";

/** The same neutral surface + shimmer CoverImage uses for image placeholders, so
 *  route-level loading UI and image loading read as one system. Suppressed under
 *  `prefers-reduced-motion`, which leaves the flat surface. */
const base = css({
  backgroundColor: "skeleton.base",
  backgroundImage:
    "linear-gradient(90deg, token(colors.skeleton.base) 0%, token(colors.skeleton.sheen) 50%, token(colors.skeleton.base) 100%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s ease-in-out infinite",
  _motionReduce: { backgroundImage: "none", animation: "none" },
});

/**
 * A shimmering block. Give it either an `aspectRatio` (for image wells, so it
 * occupies exactly the height the real image will) or a `height`.
 *
 * Skeletons are laid out to match the real page's geometry rather than being a
 * generic spinner: the content swaps in without anything moving.
 */
export function Skeleton({
  height,
  width,
  aspectRatio,
  radius = "0",
  className,
}: {
  height?: string;
  width?: string;
  aspectRatio?: string;
  radius?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cx(base, className)}
      style={{ height, width, aspectRatio, borderRadius: radius }}
    />
  );
}

/** A paragraph of shimmering text lines, the last one short like real prose. */
export function SkeletonText({ lines = 3, height = "12px", gap = "10px" }: { lines?: number; height?: string; gap?: string }) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", width: "100%" })} style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={height} width={i === lines - 1 ? "62%" : "100%"} radius='3px' />
      ))}
    </div>
  );
}
