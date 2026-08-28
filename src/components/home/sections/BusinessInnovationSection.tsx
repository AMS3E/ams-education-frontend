import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { LeadBesideRows, Ranked } from "@/components/landing/blocks";
import type { ArticleRef, PopularItem } from "@/lib/articles";

/** Section — "យុវជនឆ្នើម" (a lead card beside its rows, category 249) next to
 *  "ព័ត៌មានអាហារូបករណ៍" (a numbered ranked list, category 259) — the live
 *  homepage's own pairing (HTML-verified, 2026-08-27; see
 *  docs/wordpress/education-categories.md). */
export default function BusinessInnovationSection({ youth, scholarshipNews }: { youth: ArticleRef[]; scholarshipNews: PopularItem[] }) {
  if (!youth.length && !scholarshipNews.length) return null;

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
      <LeadBesideRows
        block={{ heading: "យុវជនឆ្នើម", href: "/outstanding-youth", items: youth }}
        sizes="(max-width: 768px) 100vw, 500px"
        detailed
      />
      <Ranked block={{ heading: "ព័ត៌មានអាហារូបករណ៍", href: "/schoolaship-news", items: scholarshipNews }} variant="line" />
    </div>
  );
}
