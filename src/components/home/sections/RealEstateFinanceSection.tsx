import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { CardRow, Thumbs } from "@/components/landing/blocks";
import type { ArticleRef } from "@/lib/articles";

/** Section — "អាហារូបករណ៍", "ពានរង្វាន់" and "ទេពកោសល្យ" (three stacked
 *  three-up card rows, categories 251, 253 and 255 — all children of 249 /
 *  យុវជនឆ្នើម) beside "ព្រឹត្តិការណ៍ព័ត៌មានជាតិ" (a thumbnail list, category
 *  723) — the live homepage's own pairing (HTML-verified, 2026-08-27; see
 *  docs/wordpress/education-categories.md). ទេពកោសល្យ added below ពានរង្វាន់
 *  at the owner's request, same day. */
export default function RealEstateFinanceSection({
  scholarships,
  awards,
  talent,
  nationalNews,
}: {
  scholarships: ArticleRef[];
  awards: ArticleRef[];
  talent: ArticleRef[];
  nationalNews: ArticleRef[];
}) {
  if (!scholarships.length && !awards.length && !talent.length && !nationalNews.length) return null;

  return (
    <div
      className={cx(
        container,
        css({
          marginTop: "44px",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 420px" },
          gap: "44px 34px",
          alignItems: "start",
        }),
      )}
    >
      <div className={css({ display: "flex", flexDirection: "column", gap: "44px" })}>
        <CardRow block={{ heading: "អាហារូបករណ៍", href: "/category/all-news/news-outstdanding-youth/news-youth-scholarship", items: scholarships }} big />
        <CardRow block={{ heading: "ពានរង្វាន់", href: "/category/all-news/news-outstdanding-youth/news-award", items: awards }} big />
        <CardRow block={{ heading: "ទេពកោសល្យ", href: "/category/all-news/news-outstdanding-youth/news-talent", items: talent }} big />
      </div>
      <Thumbs
        block={{
          heading: "ព្រឹត្តិការណ៍ព័ត៌មានជាតិ",
          href: "/category/all-news/news-national-and-international-education-update/news-national-education",
          items: nationalNews,
        }}
        detailed
        variant="line"
      />
    </div>
  );
}
