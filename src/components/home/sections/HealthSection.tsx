import { css, cx } from "@/styled-system/css";
import AdEmbed from "@/components/ui/AdEmbed";
import SectionHeader from "@/components/ui/SectionHeader";
import { container } from "@/components/layout/shared";
import type { HomeCard } from "@/lib/home-data";
import { kbPrasacFullLandscape, kbPrasacPortrait } from "@/lib/promos";
import ThumbCard from "./ThumbCard";
import TwoRowShelf from "./TwoRowShelf";
import { belowLg, episodeGrid } from "./styles";

/** Section 4 — "១នាទីដើម្បីសុខភាព និងសម្រស់": tall ad on the left, a dense
 *  6-column episode grid on the right. On phones and tablets (below `lg`) the
 *  grid gives way to a two-row swipe shelf. */
export default function HealthSection({ items }: { items: HomeCard[] }) {
  // Nothing to show: drop the whole section rather than render a heading over
  // an empty row. Its data is fetched with a `catch -> []`, so this is also
  // how a failed read leaves the page — fewer real blocks, never faked ones.
  if (!items.length) return null;

  return (
    <div className={cx(container)}>
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "1fr 2fr" },
          gap: "1.5rem",
        })}
      >
        <AdEmbed promo={kbPrasacPortrait} />
        {/* minWidth 0: without it this column's auto min-width equals the shelf
            track's full (clipped) width, which blows the single-column mobile grid
            — and the page — wider than the viewport and shoves the ad off-centre. */}
        <div className={css({ display: "flex", flexDirection: "column", minWidth: 0 })}>
          <SectionHeader title="១នាទីដើម្បីសុខភាព និងសម្រស់" seeAllHref="/program/1-minute-for-health" />
          <div className={episodeGrid}>
            {items.map((d, i) => (
              <ThumbCard key={i} item={d} />
            ))}
          </div>
          <TwoRowShelf items={items} className={belowLg} />
        </div>
      </div>
      <div className={css({ paddingTop: "56px" })}>
        <AdEmbed promo={kbPrasacFullLandscape} />
      </div>
    </div>
  );
}
