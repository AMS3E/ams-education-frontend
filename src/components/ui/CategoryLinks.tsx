import Link from "next/link";
import { css } from "@/styled-system/css";
import type { CategoryLink } from "@/lib/articles";

const link = css({
  color: "#00208c",
  textDecoration: "none",
  fontSize: "12px",
  fontWeight: "600",
  transition: "color .2s",
  _hover: { color: "brand.blue", textDecoration: "underline" },
});

/** Comma-separated category labels for a card's meta line. Each links to its
 *  /category/ listing; a category whose term didn't resolve (null href) stays
 *  plain text. Font and color come from the surrounding meta line.
 *
 *  Must NOT be rendered inside a card's own <Link> — nested anchors are invalid
 *  HTML and browsers split them apart. Card components keep their meta line
 *  outside the link for this reason. */
export default function CategoryLinks({ cats }: { cats: CategoryLink[] }) {
  if (!cats.length) return null;
  return (
    <>
      {cats.map((c, i) => (
        <span key={c.id}>
          {i > 0 && ", "}
          {c.href ? (
            <Link href={c.href} className={link}>
              {c.name}
            </Link>
          ) : (
            c.name
          )}
        </span>
      ))}
    </>
  );
}
