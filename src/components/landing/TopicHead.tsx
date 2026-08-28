import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import AnakotFeature from "./AnakotFeature";
import type { LandingFeed } from "@/lib/landing-data";
import { LeadAndRows, Ranked, TagStrip, Thumbs } from "./blocks";
import MatikaTabs from "./MatikaTabs";

/**
 * A topic landing page's head (/celebrity, /life-style/travel): a bare four-card
 * lead strip, then the topic's feed as a lead card + rows with the global
 * អត្ថបទថ្មីៗ and ប្រធានបទពេញនិយម widgets alongside, then the មាតិការសនិយម strip.
 * Everything below this is LandingTail.
 *
 * Unlike the home and section pages, a topic page does NOT carry the
 * ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ daily-events widget: live renders just four even cards
 * with their categories — no heading and no day-filter tabs — so the lead here is
 * a plain TagStrip.
 *
 * The strip runs the topic's បទយកការណ៍ (reports), while the feed below it stays on
 * the topic's ព្រឹត្តិការណ៍ (news) — the two halves of every topic in the nav. See
 * TOPIC_REPORTS in landing-data.
 *
 * ប្រធានបទពេញនិយម sits here rather than in the tail — a section page carries the
 * same block, but further down.
 */
export default function TopicHead({
  topic,
  matika,
  anakot,
}: {
  topic: NonNullable<LandingFeed["topic"]>;
  matika: LandingFeed["matika"];
  anakot: LandingFeed["anakot"];
}) {
  return (
    <>
      {/* Dropped whole — wrapper included, so no empty gap — on the two topics
          whose បទយកការណ៍ term holds no articles (culture, architecture). */}
      {topic.lead.items.length > 0 && (
        <div className={cx(container, css({ marginTop: "26px" }))}>
          <TagStrip items={topic.lead.items} sizes="(max-width: 768px) 50vw, 280px" />
        </div>
      )}

      <div
        className={cx(
          container,
          css({
            marginTop: "44px",
            display: "grid",
            gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 460px" },
            gap: "44px 34px",
            alignItems: "start",
          }),
        )}
      >
        <LeadAndRows block={topic.latest} sizes="(max-width: 1024px) 100vw, 900px" />

        <div className={css({ display: "flex", flexDirection: "column", gap: "44px" })}>
          <Thumbs block={topic.recent} detailed />
          <Ranked block={topic.popular} />
        </div>
      </div>

      <div className={cx(container, css({ marginTop: "44px" }))}>
        <MatikaTabs heading={matika.heading} tabs={matika.tabs} />
      </div>

      <AnakotFeature anakot={anakot} />
    </>
  );
}
