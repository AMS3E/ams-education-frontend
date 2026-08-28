import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { CardRow } from "@/components/landing/blocks";
import { categoryRefs } from "@/lib/articles";

/** Latest skill/project articles (category 247 — `news-skill-project`, the
 *  header's own ជំនាញ section). Renamed from ព័ត៌មានអាហារូបករណ៍
 *  (news-scholarships-news, category 259) at the owner's request,
 *  2026-08-27 — 247 was freed up by InnovationPopularSection's own
 *  ជំនាញ -> យុវជនឆ្នើម rename the same day. Was Economy's PR category
 *  (`news-pr`), a dead slug on this site's WordPress, before that. */
export default async function CommercialArticlesSection() {
  const articles = await categoryRefs("news-skill-project", 3);
  if (!articles.length) return null;

  return (
    <div className={cx(container, css({ marginTop: "44px" }))}>
      <CardRow
        block={{
          heading: "ជំនាញ",
          href: "/category/all-news/news-skill-project",
          items: articles,
        }}
        big
      />
    </div>
  );
}
