import Link from "next/link";
import { css } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import CategoryLinks from "@/components/ui/CategoryLinks";
import SectionHeader from "@/components/ui/SectionHeader";
import MiniRow from "@/components/ui/MiniRow";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { revivePortrait } from "@/components/ads/revive/zones";
import type { ArticleRef, NamedList } from "@/lib/articles";

/** Category widget: vertical list of image-topped cards. The meta line sits
 *  outside the article link so its category link doesn't nest inside it. */
function CardList({ items }: { items: ArticleRef[] }) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "18px" })}>
      {items.map((item) => {
        const cat = item.categories?.[0];
        return (
          <div key={item.slug}>
            <Link
              href={`/article/${item.slug}`}
              className={css({
                display: "block",
                color: "inherit",
                textDecoration: "none",
                _hover: { "& .cl-t": { color: "brand.blue" }, "& img": { transform: "scale(1.05)" } },
              })}
            >
              <div
                className={css({
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16/9",
                  overflow: "hidden",
                  "& img": { transition: "transform .45s ease" },
                })}
              >
                <CoverImage src={item.image} sizes="320px" />
              </div>
              <div className={`cl-t ${css({ fontSize: "13.5px", fontWeight: 600, color: "text", marginTop: "9px", lineHeight: 1.5, transition: "color .2s" })}`}>{item.title}</div>
            </Link>
            {(cat || item.date) && (
              <div className={css({ fontSize: "11px", color: "muted", marginTop: "5px" })}>
                {cat && <CategoryLinks cats={[cat]} />}
                {cat && item.date && " · "}
                {item.date}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One large lead card followed by compact thumbnail rows. */
function FeaturedList({ items }: { items: ArticleRef[] }) {
  const [lead, ...rest] = items;
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "18px" })}>
      {lead && <CardList items={[lead]} />}
      {rest.map((item) => (
        <MiniRow key={item.slug} item={item} />
      ))}
    </div>
  );
}

export default function Sidebar({ sidebarLists }: { sidebarLists: NamedList[] }) {
  const [economic, finance, realEstate, pr, innovation] = sidebarLists;
  return (
    <aside
      className={css({
        position: { lg: "sticky" },
        top: "16px",
        alignSelf: "start",
        display: "flex",
        flexDirection: "column",
        gap: "40px",
      })}
    >
      <ReviveAdSlot zone={revivePortrait} />

      {economic && (
        <div>
          <SectionHeader variant="underline" title={economic.heading} titleSize="22px" seeAllHref={economic.href} />
          <CardList items={economic.items} />
        </div>
      )}

      {finance && (
        <div>
          <SectionHeader variant="underline" title={finance.heading} titleSize="22px" seeAllHref={finance.href} />
          <FeaturedList items={finance.items} />
        </div>
      )}

      {realEstate && (
        <div>
          <SectionHeader variant="underline" title={realEstate.heading} titleSize="22px" seeAllHref={realEstate.href} />
          <CardList items={realEstate.items} />
        </div>
      )}

      <ReviveAdSlot zone={revivePortrait} />

      {economic && (
        <div>
          <SectionHeader variant="underline" title={economic.heading} titleSize="22px" seeAllHref={economic.href} />
          <CardList items={economic.items} />
        </div>
      )}

      {finance && (
        <div>
          <SectionHeader variant="underline" title={finance.heading} titleSize="22px" seeAllHref={finance.href} />
          <FeaturedList items={finance.items} />
        </div>
      )}

      {pr && (
        <div>
          <SectionHeader variant="underline" title={pr.heading} titleSize="22px" seeAllHref={pr.href} />
          <FeaturedList items={pr.items} />
        </div>
      )}

      {innovation && (
        <div>
          <SectionHeader variant="underline" title={innovation.heading} titleSize="22px" seeAllHref={innovation.href} />
          <CardList items={innovation.items} />
        </div>
      )}

    </aside>
  );
}
