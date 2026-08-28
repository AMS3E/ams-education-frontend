import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import ArticleMeta from "./ArticleMeta";
import CoverImage from "./CoverImage";
import type { ArticleRef } from "@/lib/articles";

/** The thumbnail's size. `compact` is the category sidebar's; `detailed` is the
 *  bigger one the landing pages' អត្ថបទថ្មីៗ column uses. Independent of `meta`:
 *  បំណិនជីវិត pairs a compact thumbnail WITH the meta line. */
type Variant = "compact" | "detailed";

// Panda needs statically-analyzable values, so the two thumb geometries are two
// classes rather than one parameterised by a prop (see home/sections/styles.ts).
//
// `flex: 0 0 auto` is load-bearing on both: the title's flex-basis is its (very
// wide) max-content width, so the line always overflows and a shrinkable thumb
// would be squeezed well under its size — by a different amount per row, since
// shrink is proportional to each title's length.
const thumbBase = {
  flex: "0 0 auto",
  position: "relative",
  overflow: "hidden",
  "& img": { transition: "transform .45s ease" },
} as const;

const thumbCompact = css({ ...thumbBase, width: "125px", height: "80px" });
const thumbDetailed = css({ ...thumbBase, width: "180px", height: "120px" });

const row = css({
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  _hover: { "& .mr-t": { color: "brand.blue" }, "& img": { transform: "scale(1.05)" } },
});

const titleLink = css({ color: "inherit", textDecoration: "none" });

const title = css({
  fontSize: "16px",
  fontWeight: 600,
  color: "text",
  lineHeight: 1.5,
  transition: "color .2s",
  lineClamp: "3",
});

/** Horizontal row: thumbnail + title, and optionally the categories · date line.
 *  The unit of every thumbnail-list widget — the category sidebar, and the
 *  landing pages' អត្ថបទថ្មីៗ / ព័ត៌មានប្លែកៗ / បំណិនជីវិត columns.
 *
 *  The thumbnail and the title carry their own links rather than one link around
 *  the whole row, so `meta`'s category links don't nest inside another anchor
 *  (invalid HTML — browsers split it apart). */
export default function MiniRow({
  item,
  variant = "compact",
  meta,
}: {
  item: ArticleRef;
  variant?: Variant;
  meta?: boolean;
}) {
  const href = `/article/${item.slug}`;
  const detailed = variant === "detailed";

  return (
    <div className={row}>
      <Link href={href} className={detailed ? thumbDetailed : thumbCompact}>
        <CoverImage src={item.image} sizes={detailed ? "180px" : "125px"} />
      </Link>
      <div className={css({ minWidth: 0 })}>
        <Link href={href} className={titleLink}>
          <div className={cx("mr-t", title)}>{item.title}</div>
        </Link>
        {meta && <ArticleMeta item={item} className={css({ marginTop: "6px" })} />}
      </div>
    </div>
  );
}
