import Link from "next/link";
import { css } from "@/styled-system/css";

const seeAllStyle = css({
  fontSize: "14px",
  color: "muted",
  textDecoration: "none",
  transition: "opacity .2s",
  _hover: { opacity: 0.7 },
});

type Variant = "line" | "underline";

/**
 * Section heading with an optional "see all" link.
 *  - `variant="line"` (default): title, a growing divider line, then "see all".
 *  - `variant="underline"`: title + "see all" with a bottom border (used by the
 *    article sidebar and below-article widgets).
 *
 * The "see all" renders ONLY when `seeAllHref` is given. It used to be a bare
 * <span> with `cursor: pointer` on every section of the site — a link-shaped
 * decoy that swallowed clicks. A heading with no destination now simply has no
 * "see all".
 */
export default function SectionHeader({
  title,
  titleSize,
  titleWeight = 500,
  variant = "line",
  seeAllHref,
  seeAllText,
}: {
  title: string;
  titleSize?: string;
  titleWeight?: number;
  variant?: Variant;
  seeAllHref?: string;
  seeAllText?: string;
}) {
  const size = titleSize ?? (variant === "underline" ? "18px" : "24px");
  const label = seeAllText ?? (variant === "underline" ? "មើលទាំងអស់ ▸" : "មើលទាំងអស់ ➧");
  const tail = seeAllHref ? (
    <Link href={seeAllHref} className={seeAllStyle}>
      {label}
    </Link>
  ) : seeAllText ? (
    <span className={seeAllStyle}>{seeAllText}</span>
  ) : null;

  if (variant === "underline") {
    return (
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          paddingBottom: "8px",
          marginBottom: "14px",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "divider",
        })}>
        <h2
          className={css({ margin: 0, color: "text", lineHeight: 1.3 })}
          style={{ fontSize: size, fontWeight: titleWeight }}>
          {title}
        </h2>
        {tail}
      </div>
    );
  }

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "18px",
      })}>
      <h2 style={{ fontSize: size, fontWeight: titleWeight }}>{title}</h2>
      <div className={css({ flex: "auto", height: "1px", margin: "0px 16px", background: "divider" })}></div>
      {tail}
    </div>
  );
}
