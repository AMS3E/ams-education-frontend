import { css, cx } from "@/styled-system/css";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveFullLandscape } from "@/components/ads/revive/zones";
import { container } from "@/components/layout/shared";
import MatikaTabs from "@/components/landing/MatikaTabs";
import type { MatikaTab } from "@/lib/landing-data";

/** Section — "មាតិការសនិយម": the same switching-tabs widget TopicHead runs
 *  below a landing page, reused here with the six NAV_SECTIONS terms (see
 *  home-data's getMatikaTabs) as the homepage's own topic browser. */
export default function MatikaSection({ heading, tabs }: { heading: string; tabs: MatikaTab[] }) {
  if (!tabs.some((t) => t.items.length)) return null;

  return (
    <div className={cx(container, css({ marginTop: "44px" }))}>
      <div className={css({ marginBottom: "44px" })}>
        <ReviveAdSlot zone={reviveFullLandscape} />
      </div>
      <MatikaTabs heading={heading} tabs={tabs} />
    </div>
  );
}
