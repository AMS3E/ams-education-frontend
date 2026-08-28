import { css, cx } from "@/styled-system/css";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { revivePortrait } from "@/components/ads/revive/zones";
import { container } from "@/components/layout/shared";
import { LeadAndRows, Thumbs } from "@/components/landing/blocks";
import type { ArticleRef } from "@/lib/articles";

/** Section — "ព័ត៌មានពេញនិយម" (a thumbs column) beside "របាយការណ៍ថ្មីៗ" (lead
 *  card + rows): the same pairing TopicHead runs for a topic's own feed, reused here
 *  for the news root (ALL_NEWS_ID — see getHomeFeed) so the homepage carries its
 *  own lead+rows / thumbs split under the paged ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ grid above it. */
export default function LatestNewsSection({ latest, recent }: { latest: ArticleRef[]; recent: ArticleRef[] }) {
  // Same rule as the other home sections: no items, no section.
  if (!latest.length && !recent.length) return null;

  return (
    <div
      className={cx(
        container,
        css({
          marginTop: "44px",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,390px) minmax(0,1fr)" },
          gap: "44px 34px",
          alignItems: "start",
        }),
      )}
    >
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          minWidth: 0,
        })}
      >
        <Thumbs block={{ heading: "ព័ត៌មានពេញនិយម", href: "/category/all-news", items: recent }} detailed variant="line" />
        <ReviveAdSlot zone={revivePortrait} />
      </div>
      <LeadAndRows
        block={{ heading: "របាយការណ៍ថ្មីៗ", href: "/category/reports", items: latest }}
        sizes="(max-width: 1024px) 100vw, 900px"
      />
    </div>
  );
}
