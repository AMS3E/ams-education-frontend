import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import AnakotFeature from "./AnakotFeature";
import ArticleCard from "@/components/ui/ArticleCard";
import DailyEventsSection from "@/components/home/sections/DailyEventsSection";
import SummaryNewsCarousel from "@/components/article/SummaryNewsCarousel";
import type { LandingFeed } from "@/lib/landing-data";
import SectionHeader from "@/components/ui/SectionHeader";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveFullLandscape } from "@/components/ads/revive/zones";
import { LeadAndRows, Ranked, Thumbs } from "./blocks";
import MatikaTabs from "./MatikaTabs";

/**
 * A section landing page's head (/entertainment-news, /life-style): the
 * section's own ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ feed, then the two global news columns,
 * then the មាតិការសនិយម strip. Everything below this is LandingTail.
 *
 * The lead grid is the homepage's own DailyEventsSection, pager and all — the
 * only difference is which feed it walks: this section's articles rather than
 * the news root. `basePath` is the section's own URL, so its pager links to
 * /entertainment-news?page=2 rather than the homepage's.
 */
export default function SectionHead({
  section,
  matika,
  anakot,
  basePath,
}: {
  section: NonNullable<LandingFeed["section"]>;
  matika: LandingFeed["matika"];
  anakot: LandingFeed["anakot"];
  /** This landing page's path, e.g. "/entertainment-news". */
  basePath: string;
}) {
  return (
    <>
      {/* The `section.updates` (របាយការណ៍ និងបច្ចុប្បន្នភាព) strip is hidden at
          the owner's request (2026-08-27) — the data still populates (real
          articles, category 589) in case it's wanted back, it just doesn't
          render. */}
      {!section.updates && (
        <DailyEventsSection cards={section.daily.cards} page={section.daily.page} totalPages={section.daily.totalPages} basePath={basePath} />
      )}

      {/* Four-up "categories · date" strip, added above របាយការណ៍ថ្មី at the
          owner's request (2026-08-27) — same category-243 feed as the tail's
          interest block, shown here at its full 4 items. No heading/"see all" —
          removed at the owner's request the same day. */}
      <div className={cx(container, css({ marginTop: "18px" }))}>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "repeat(2,1fr)", md: "repeat(4,1fr)" },
            gap: "18px",
            paddingTop: "30px",
          })}
        >
          {section.topStrip.items.map((item) => (
            <ArticleCard key={item.slug} item={item} sizes="(max-width: 768px) 50vw, 280px" withCategories />
          ))}
        </div>
      </div>

      <div
        className={cx(
          container,
          css({
            marginTop: "44px",
            display: "grid",
            gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 460px" },
            gap: "30px",
          }),
        )}
      >
        {/* របាយការណ៍ថ្មីៗ stays in the wide left column; ព័ត៌មានពេញនិយម is the
            compact image-card stack on the right. `fillHeight` spreads reports'
            few rows through the sidebar's taller height (topNews + popular)
            instead of leaving a dead gap under a short left column. */}
        <LeadAndRows block={section.reports} sizes="(max-width: 1024px) 100vw, 620px" fillHeight />
        <div className={css({ display: "flex", flexDirection: "column", gap: "44px" })}>
          <Thumbs block={section.topNews} meta />
          <Ranked block={section.popular} />
        </div>
      </div>

      {section.summary.length > 0 && (
        <>
          <div className={cx(container, css({ marginTop: "44px" }))}>
            <SectionHeader title="ព័ត៌មានសង្ខេប" titleSize="20px" seeAllText="ប្រភេទវីដេអូ (VIDEO)" />
            <SummaryNewsCarousel items={section.summary} />
          </div>
          <div className={cx(container, css({ marginTop: "44px" }))}>
            <ReviveAdSlot zone={reviveFullLandscape} />
          </div>
        </>
      )}

      <div className={cx(container, css({ marginTop: "44px" }))}>
        <MatikaTabs heading={matika.heading} tabs={matika.tabs} />
      </div>

      <AnakotFeature anakot={anakot} />
    </>
  );
}
