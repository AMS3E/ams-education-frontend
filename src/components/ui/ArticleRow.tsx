import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "./CoverImage";
import ArticleMeta from "./ArticleMeta";
import type { ArticleRef } from "@/lib/articles";

const row = css({
  display: "flex",
  gap: { base: "16px", md: "30px" },
  alignItems: "flex-start",
  _hover: { "& .rr-title": { color: "brand.blue" } },
});

// Half the column, at the ratio of the design's 480x300. Sized proportionally
// rather than in pixels because the row runs in columns of very different
// widths — a category page's ~1000px, a related-article column's ~520px — and
// in every one of them the design puts the image at about half the width.
const thumb = css({
  display: "block",
  flex: "0 0 48%",
  aspectRatio: "16 / 10",
  position: "relative",
  overflow: "hidden",
});

const titleLink = css({ color: "inherit", textDecoration: "none" });

/** Horizontal article card: image left, title + meta + excerpt right.
 *
 *  The image and title carry their own article links (rather than one link
 *  around the whole row) so the meta line's category links don't nest inside
 *  another anchor.
 *
 *  The thumb tracks the column, so `sizes` is the one thing a caller has to
 *  restate: pass roughly half the width of the column the row sits in. */
export default function ArticleRow({
  item,
  sizes = "(max-width: 1024px) 45vw, 500px",
}: {
  item: ArticleRef;
  sizes?: string;
}) {
  return (
    <div className={row}>
      <Link href={`/article/${item.slug}`} className={thumb}>
        <CoverImage src={item.image} sizes={sizes} />
      </Link>
      <div className={css({ minWidth: 0 })}>
        <Link href={`/article/${item.slug}`} className={titleLink}>
          <div
            className={cx(
              "rr-title",
              css({
                fontSize: "15px",
                fontWeight: 600,
                color: "text",
                lineHeight: "2.4em",
                transition: "color .2s",
                marginBottom: "8px",
              }),
            )}
          >
            {item.title}
          </div>
        </Link>
        <ArticleMeta item={item} />
        {item.description && <p className={css({ fontSize: "14px", lineClamp: "3", lineHeight: "2.4em", marginTop: "5px" })}>{item.description}</p>}
      </div>
    </div>
  );
}
