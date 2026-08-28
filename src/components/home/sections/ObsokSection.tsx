import { css, cx } from "@/styled-system/css";
import AdEmbed from "@/components/ui/AdEmbed";
import SectionHeader from "@/components/ui/SectionHeader";
import { container } from "@/components/layout/shared";
import type { HomeCard } from "@/lib/home-data";
import { kbPrasacFullLandscape, kbPrasacPortrait } from "@/lib/promos";
import ThumbCard from "./ThumbCard";
import TwoRowShelf from "./TwoRowShelf";
import { belowLg, episodeGrid } from "./styles";

/** Section 5 — "អផ្សុក": mirror of the health section — the 6-column grid on the
 *  left (wider 2fr column), the tall ad on the right. Below `lg` the grid becomes
 *  the same two-row swipe shelf. */
export default function ObsokSection({ items }: { items: HomeCard[] }) {
  // Nothing to show: drop the whole section rather than render a heading over
  // an empty row. Its data is fetched with a `catch -> []`, so this is also
  // how a failed read leaves the page — fewer real blocks, never faked ones.
  if (!items.length) return null;

  return (
    <div className={cx(container, css({ marginTop: "44px" }))}>
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "2fr 1fr" },
          gap: "1.5rem",
        })}
      >
        {/* minWidth 0: see HealthSection — stops the shelf track's clipped width
            from blowing the mobile grid (and the page) wider than the viewport. */}
        <div className={css({ display: "flex", flexDirection: "column", minWidth: 0 })}>
          <SectionHeader title="អផ្សុក" seeAllHref="/program/obsok" />
          <div className={episodeGrid}>
            {items.map((d, i) => (
              <ThumbCard key={i} item={d} />
            ))}
          </div>
          <TwoRowShelf items={items} className={belowLg} />
        </div>
        <AdEmbed promo={kbPrasacPortrait} />
      </div>
      <div className={css({ paddingTop: "56px" })}>
        <AdEmbed promo={kbPrasacFullLandscape} />
      </div>
    </div>
  );
}
