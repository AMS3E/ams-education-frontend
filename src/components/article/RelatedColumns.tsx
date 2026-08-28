import { css } from "@/styled-system/css";
import ArticleCard from "@/components/ui/ArticleCard";
import ArticleRow from "@/components/ui/ArticleRow";
import FeaturedArticleCard from "@/components/ui/FeaturedArticleCard";
import type { NamedList } from "@/lib/articles";
import SectionHeader from "@/components/ui/SectionHeader";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveLandscapeShort } from "@/components/ads/revive/zones";

/** The two-column "recent reports | entertainment" block that sits inside the
 *  main article column (the sidebar runs alongside it). */
export default function RelatedColumns({ recentReports, generalNews }: { recentReports: NamedList; generalNews: NamedList }) {
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: { base: "1fr", sm: "0.5fr 1fr" },
        gap: "2em",
      })}
    >
      <div>
        <SectionHeader title={recentReports.heading} titleSize="22px" seeAllHref="/category/all-report" />
        <div className={css({ display: "flex", flexDirection: "column", gap: "22px" })}>
          {recentReports.items.map((item) => (
            <ArticleCard key={item.slug} item={item} sizes="(max-width: 768px) 100vw, 320px" />
          ))}
        </div>
      </div>
      <div>
        <SectionHeader title={generalNews.heading} titleSize="22px" seeAllHref="/category/all-news" />
        {/* Lead item as a large featured card, the rest as horizontal rows. */}
        {generalNews.items[0] && (
          <div className={css({ marginBottom: "22px" })}>
            <FeaturedArticleCard item={generalNews.items[0]} />
          </div>
        )}
        <div className={css({ display: "flex", flexDirection: "column", gap: "22px" })}>
          {generalNews.items.slice(1).map((item) => (
            <ArticleRow key={item.slug} item={item} sizes="(max-width: 1024px) 45vw, 320px" />
          ))}
        </div>
        <div className={css({ marginTop: "22px" })}>
          <ReviveAdSlot zone={reviveLandscapeShort} />
        </div>
      </div>
    </div>
  );
}
