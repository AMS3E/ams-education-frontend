import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { CardRow } from "@/components/landing/blocks";
import type { ArticleRef } from "@/lib/articles";

/** Section — "ជំនាញ": a three-up card row, category 247 (`news-skill-project`
 *  — HTML-verified on the live homepage, 2026-08-27). Replaces the old
 *  top-news fallback that stood in for Economy's entertainment-news, which
 *  has no counterpart in Education's taxonomy. */
export default function EntertainmentSection({ items }: { items: ArticleRef[] }) {
  if (!items.length) return null;

  return (
    <div className={cx(container, css({ marginTop: "44px" }))}>
      <CardRow block={{ heading: "ជំនាញ", href: "/category/all-news/news-skill-project", items }} />
    </div>
  );
}
