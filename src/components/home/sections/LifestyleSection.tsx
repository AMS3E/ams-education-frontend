import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import ArticleMeta from "@/components/ui/ArticleMeta";
import CoverImage from "@/components/ui/CoverImage";
import SectionHeader from "@/components/ui/SectionHeader";
import { container } from "@/components/layout/shared";
import type { HomeCard } from "@/lib/home-data";
import { articleHref, cardLink, cardTitle, thumb16x11 } from "./styles";

/** Section — "អប់រំសម្រាប់កុមារ", category 639 (`report-children-education` —
 *  HTML-verified on the live homepage, 2026-08-27). Replaces the old
 *  `life-style-news` slug, which doesn't exist in Education's taxonomy and
 *  left this section silently empty. No ads — owner's call, 2026-08-27. */
export default function LifestyleSection({ items }: { items: HomeCard[] }) {
  // Nothing to show: drop the whole section rather than render a heading over
  // an empty row. Its data is fetched with a `catch -> []`, so this is also
  // how a failed read leaves the page — fewer real blocks, never faked ones.
  if (!items.length) return null;

  return (
    <div className={cx(container, css({ marginTop: "40px" }))}>
      <SectionHeader title="អប់រំសម្រាប់កុមារ" seeAllHref="/category/all-report/report-children-education" />
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "repeat(2,1fr)", md: "repeat(4,1fr)" },
          gap: "18px",
          alignContent: "start",
        })}
      >
        {/* The "categories · date" meta line sits OUTSIDE the card's <Link> —
            an anchor inside an anchor is invalid HTML (see CategoryLinks). */}
        {items.map((d, i) => (
          <div key={i}>
            <Link href={articleHref(d.slug)} className={cardLink}>
              <div className={thumb16x11}>
                <CoverImage src={d.src} sizes="(max-width: 768px) 50vw, 260px" />
              </div>
              <div className={cardTitle}>{d.title}</div>
            </Link>
            <ArticleMeta item={{ slug: d.slug, title: d.title, image: d.src, categories: d.tags, date: d.date }} />
          </div>
        ))}
      </div>
    </div>
  );
}
