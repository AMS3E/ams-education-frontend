import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { LeadBesideRows, Ranked } from "@/components/landing/blocks";
import { categoryRefs, categoryRefsByIds } from "@/lib/articles";

/** Outstanding-youth lead stories (category 249 — `news-outstdanding-youth`,
 *  one of the header's own six nav sections). Renamed from ជំនាញ
 *  (news-skill-project, category 247) at the owner's request, 2026-08-27.
 *  Beside it, the curated popular ranking. */
export default async function InnovationPopularSection() {
  const [innovation, popular] = await Promise.all([
    categoryRefs("news-outstdanding-youth", 4),
    categoryRefsByIds("243", 7),
  ]);

  if (!innovation.length && !popular.length) return null;

  return (
    <div
      className={cx(
        container,
        css({
          marginTop: "44px",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,2fr) minmax(0,1fr)" },
          gap: "44px 34px",
          alignItems: "start",
        }),
      )}
    >
      <LeadBesideRows
        block={{
          heading: "យុវជនឆ្នើម",
          href: "/category/all-news/news-outstdanding-youth",
          items: innovation,
        }}
        sizes="(max-width: 768px) 100vw, 500px"
        detailed
      />
      <Ranked
        block={{
          // Renamed from ប្រធានបទពេញនិយម at the owner's request, 2026-08-27 —
          // label only, no matching Education category exists; still sourced
          // from category 243.
          heading: "អ្នកជំនាញចិត្តសាស្រ្ត",
          href: "/category/all-news",
          items: popular.map((article) => ({ slug: article.slug, title: article.title })),
        }}
        variant="line"
      />
    </div>
  );
}
