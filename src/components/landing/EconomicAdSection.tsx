import { css, cx } from "@/styled-system/css";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveHalfLandscape } from "@/components/ads/revive/zones";
import { container } from "@/components/layout/shared";
import { Ranked } from "@/components/landing/blocks";
import { categoryRefs } from "@/lib/articles";

/** Half-landscape campaign beside the nine latest scholarship-news headlines
 *  (category 259 — `news-scholarships-news`). Renamed from ព័ត៌មានអន្តរជាតិ
 *  (international education, category 731) at the owner's request,
 *  2026-08-27 — same category CommercialArticlesSection already uses further
 *  down the tail, in a different card shape. Was Economy's `news-economic`, a
 *  dead slug on this site's WordPress, before that first rename. */
export default async function EconomicAdSection() {
  const articles = await categoryRefs("news-scholarships-news", 9);

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
      <ReviveAdSlot zone={reviveHalfLandscape} />
      <Ranked
        block={{
          heading: "ព័ត៌មានអាហារូបករណ៍",
          href: "/category/all-news/news-scholarships-news",
          items: articles.map((article) => ({ slug: article.slug, title: article.title })),
        }}
        variant="line"
      />
    </div>
  );
}
