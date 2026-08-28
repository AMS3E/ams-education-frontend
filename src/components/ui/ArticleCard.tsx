import Link from "next/link";
import { css } from "@/styled-system/css";
import ArticleMeta from "./ArticleMeta";
import CoverImage from "./CoverImage";
import type { ArticleRef } from "@/lib/articles";

const link = css({ display: "flex", flexDirection: "column", color: "inherit", textDecoration: "none" });

const thumbBase = {
  position: "relative",
  width: "100%",
  overflow: "hidden",
  "& img": { transition: "transform .45s ease" },
  _hover: { "& img": { transform: "scale(1.06)" } },
} as const;

const thumb = css({ ...thumbBase, aspectRatio: "16/11" });
// Panda needs statically-analyzable values, so this is a second class rather
// than a prop-driven aspect-ratio (see MiniRow's thumbCompact/thumbDetailed).
const thumbBig = css({ ...thumbBase, aspectRatio: "4/3" });

const title = css({
  fontSize: "12.5px",
  fontWeight: 600,
  color: "text",
  marginTop: "8px",
  lineHeight: 1.5,
});

const dateOnly = css({ fontSize: "11px", color: "muted", marginTop: "4px" });

// Only a margin: ArticleMeta sets its own size and colour, and Panda's cx
// concatenates rather than merges, so overriding those from here would resolve
// by stylesheet source order instead of by intent.
const metaLine = css({ marginTop: "4px" });

/** Small vertical article card (image on top, title, then either the bare date
 *  or the full meta line). Used in related sections and grids.
 *
 *  `withCategories` renders "categories · date" instead of just the date — what
 *  the landing tail's three-up rows show, matching live. It restructures the
 *  card rather than just adding a line: the meta has to sit OUTSIDE the Link,
 *  because CategoryLinks renders anchors and an anchor inside an anchor is
 *  invalid HTML that browsers silently split apart.
 *
 *  `big` swaps the thumbnail to a taller 4:3 crop instead of the default 16:11. */
export default function ArticleCard({
  item,
  sizes = "(max-width: 768px) 50vw, 240px",
  withCategories = false,
  big = false,
}: {
  item: ArticleRef;
  sizes?: string;
  withCategories?: boolean;
  big?: boolean;
}) {
  const card = (
    <Link href={`/article/${item.slug}`} className={link}>
      <div className={big ? thumbBig : thumb}>
        <CoverImage src={item.image} sizes={sizes} />
      </div>
      <div className={title}>{item.title}</div>
      {!withCategories && item.date && <div className={dateOnly}>{item.date}</div>}
    </Link>
  );

  if (!withCategories) return card;

  return (
    <div>
      {card}
      <ArticleMeta item={item} className={metaLine} />
    </div>
  );
}
