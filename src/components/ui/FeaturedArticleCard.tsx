import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "./CoverImage";
import ArticleMeta from "./ArticleMeta";
import type { ArticleRef } from "@/lib/articles";

const card = css({
  display: "flex",
  flexDirection: "column",
  _hover: { "& .rf-title": { color: "brand.blue" } },
});

const link = css({
  display: "flex",
  flexDirection: "column",
  color: "inherit",
  textDecoration: "none",
});

const thumb = css({
  position: "relative",
  width: "100%",
  aspectRatio: "16/10",
  overflow: "hidden",
  "& img": { transition: "transform .45s ease" },
  _hover: { "& img": { transform: "scale(1.04)" } },
});

/** Large "featured" vertical card: big image, title, meta, and a short excerpt.
 *  Used as the lead item above a stack of ArticleRow cards.
 *
 *  `excerpt={false}` drops the description — the landing pages' បំណិនជីវិត lead
 *  sits beside a column of rows and has no room for it.
 *
 *  The article link wraps only the image and title — the meta line carries its
 *  own category links, which must not nest inside another anchor. */
export default function FeaturedArticleCard({
  item,
  sizes = "(max-width: 768px) 100vw, 520px",
  excerpt = true,
}: {
  item: ArticleRef;
  sizes?: string;
  excerpt?: boolean;
}) {
  return (
    <div className={card}>
      <Link href={`/article/${item.slug}`} className={link}>
        <div className={thumb}>
          <CoverImage src={item.image} sizes={sizes} />
        </div>
        <div
          className={cx(
            "rf-title",
            css({
              fontSize: "15px",
              fontWeight: 700,
              color: "text",
              marginTop: "12px",
              lineHeight: "2.4em",
              transition: "color .2s",
            }),
          )}>
          {item.title}
        </div>
      </Link>
      <ArticleMeta item={item} />
      {excerpt && item.description && (
        <p
          className={css({
            marginTop: "5px",
            lineClamp: "3",
            lineHeight: "2.4em",
          })}>
          {item.description}
        </p>
      )}
    </div>
  );
}
