import Link from "next/link";
import { css } from "@/styled-system/css";
import type { PopularItem } from "@/lib/articles";

/** Numbered, text-only article list (no thumbnails). Used by the article
 *  sidebar's ប្រធានបទពេញនិយម and by the landing pages' ranked columns
 *  (គន្លឹះថែរក្សាសម្ផស្ស, ភាពយន្ត). */
export default function RankedList({ items }: { items: PopularItem[] }) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" })}>
      {items.map((item, i) => (
        <Link
          key={item.slug}
          href={`/article/${item.slug}`}
          className={css({
            gap: "16px",
            display: "flex",
            alignItems: "center",
            _hover: { "& .pl-t": { color: "brand.blue" } },
          })}
        >
          <span
            className={css({
              width: "38px",
              height: "38px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "1px solid rgba(0,0,0,0.3)",
              fontSize: "18px",
              padding: "1rem",
            })}
          >
            {i + 1}
          </span>
          <span className={`pl-t ${css({ fontSize: "15px", fontWeight: 600 })}`}>{item.title}</span>
        </Link>
      ))}
    </div>
  );
}
