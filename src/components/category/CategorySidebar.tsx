import { Fragment } from "react";
import { css } from "@/styled-system/css";
import MiniRow from "@/components/ui/MiniRow";
import type { NamedList } from "@/lib/articles";
import { kbPrasacPortrait } from "@/lib/promos";
import SectionHeader from "../ui/SectionHeader";
import AdEmbed from "../ui/AdEmbed";

/** Right column of the category page: stacked thumbnail-row widgets. */
export default function CategorySidebar({ lists }: { lists: NamedList[] }) {
  return (
    <aside
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "36px",
        position: { lg: "sticky" },
        top: "16px",
        alignSelf: "start",
      })}
    >
      {lists.map((list, i) => (
        <Fragment key={list.heading}>
          {/* Ad above the first widget, and another below the second. */}
          <AdEmbed promo={kbPrasacPortrait} />
          <div>
            <SectionHeader title={list.heading} titleSize="22px" titleWeight={600} seeAllHref={list.href} />
            <div className={css({ display: "flex", flexDirection: "column", gap: "16px" })}>
              {list.items.map((item) => (
                <MiniRow key={item.slug} item={item} />
              ))}
            </div>
          </div>
        </Fragment>
      ))}
    </aside>
  );
}
