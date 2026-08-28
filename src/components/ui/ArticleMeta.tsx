import type { ReactNode } from "react";
import { css, cx } from "@/styled-system/css";
import type { ArticleRef } from "@/lib/articles";
import CategoryLinks from "./CategoryLinks";

const meta = css({});
const sep = css({ opacity: 0.6 });

/** Meta line for list cards: categories · date · comment link. Renders only the
 *  parts present on the item. Categories link to their listings, so this must
 *  sit OUTSIDE the card's own <Link> (nested anchors are invalid HTML). */
export default function ArticleMeta({ item, className }: { item: ArticleRef; className?: string }) {
  const cats = item.categories ?? [];

  const parts: ReactNode[] = [];
  if (cats.length) parts.push(<CategoryLinks cats={cats} />);
  if (item.date) parts.push(item.date);
  if (typeof item.commentCount === "number") {
    parts.push(item.commentCount === 0 ? "Leave a comment" : `${item.commentCount} comments`);
  }
  if (!parts.length) return null;

  return (
    <div className={cx(meta, className, css({ fontSize: "12px", color: "muted", marginBottom: "6px", lineHeight: 1.6 }))}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className={sep}> · </span>}
          {part}
        </span>
      ))}
    </div>
  );
}
