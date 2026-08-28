// The shapes a landing-page block comes in. Every block on a section or topic
// page is one of these, differing only in its heading and its feed.

import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import ArticleCard from "@/components/ui/ArticleCard";
import ArticleMeta from "@/components/ui/ArticleMeta";
import ArticleRow from "@/components/ui/ArticleRow";
import CategoryLinks from "@/components/ui/CategoryLinks";
import CoverImage from "@/components/ui/CoverImage";
import FeaturedArticleCard from "@/components/ui/FeaturedArticleCard";
import MiniRow from "@/components/ui/MiniRow";
import RankedList from "@/components/ui/RankedList";
import SectionHeader from "@/components/ui/SectionHeader";
import type { ArticleRef } from "@/lib/articles";
import type { Block, RankedBlock } from "@/lib/landing-data";

// Panda needs statically-analyzable values, so the two cover geometries are two
// classes rather than one parameterised by a prop (see styles.ts).
const coverTall = css({
  position: "relative",
  width: "100%",
  height: "260px",
  overflow: "hidden",
  "& img": { transition: "transform .45s ease" },
});
const coverWide = css({
  position: "relative",
  width: "100%",
  aspectRatio: "16/11",
  overflow: "hidden",
  "& img": { transition: "transform .45s ease" },
});

const cardLink = css({
  display: "block",
  color: "inherit",
  textDecoration: "none",
  _hover: { "& .cc-t": { color: "brand.blue" }, "& img": { transform: "scale(1.05)" } },
});

const thumbsGap = css({ display: "flex", flexDirection: "column", gap: "16px" });
const thumbsGapWide = css({ display: "flex", flexDirection: "column", gap: "22px" });

const cardTitle = css({
  fontSize: "15px",
  fontWeight: 600,
  color: "text",
  marginTop: "10px",
  marginBottom: "6px",
  lineHeight: 1.5,
  transition: "color .2s",
});

/** Cover, title, then the full "categories · date" meta line.
 *
 *  The meta sits OUTSIDE the link: it renders CategoryLinks, and an anchor inside
 *  an anchor is invalid HTML that browsers split apart. */
function MetaCard({ item, cover, sizes }: { item: ArticleRef; cover: string; sizes?: string }) {
  return (
    <div>
      <Link href={`/article/${item.slug}`} className={cardLink}>
        <div className={cover}>
          <CoverImage src={item.image} sizes={sizes} />
        </div>
        <div className={cx("cc-t", cardTitle)}>{item.title}</div>
      </Link>
      <ArticleMeta item={item} />
    </div>
  );
}

/** Vertical cards in a three-up row, each under a "categories · date" meta line
 *  — what live's ស្នេហានិងទំនាក់ទំនង / ទេសចរណ៍ / អត្ថបទកម្សាន្ត rows show. `big`
 *  forwards to ArticleCard's taller 4:3 thumbnail. */
export function CardRow({ block, big }: { block: Block; big?: boolean }) {
  return (
    <div>
      <SectionHeader title={block.heading} titleSize="22px" seeAllHref={block.href} />
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "repeat(2,1fr)", md: "repeat(3,1fr)" },
          gap: "18px",
        })}
      >
        {block.items.map((item) => (
          <ArticleCard key={item.slug} item={item} sizes="(max-width: 768px) 50vw, 300px" withCategories big={big} />
        ))}
      </div>
    </div>
  );
}

/** A bare four-up strip: cover, title, and the article's category tags — no
 *  section header and no date. The topic pages' lead row: live's
 *  `.panel-report-news` shows four even cards with just their categories, with no
 *  ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ heading and no day-filter tabs. */
export function TagStrip({ items, sizes }: { items: ArticleRef[]; sizes?: string }) {
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: { base: "repeat(2,1fr)", md: "repeat(4,1fr)" },
        gap: "18px",
      })}
    >
      {items.map((item) => (
        <div key={item.slug}>
          {/* categories sit OUTSIDE the link — CategoryLinks renders anchors */}
          <Link href={`/article/${item.slug}`} className={cardLink}>
            <div className={coverWide}>
              <CoverImage src={item.image} sizes={sizes} />
            </div>
            <div className={cx("cc-t", cardTitle)}>{item.title}</div>
          </Link>
          {(item.categories?.length ?? 0) > 0 && (
            <div className={css({ fontSize: "12px", color: "muted", lineHeight: 1.6 })}>
              <CategoryLinks cats={item.categories ?? []} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** A single stacked column of meta cards (ព័ត៌មានពេញនិយម). */
export function CardColumn({ block, sizes }: { block: Block; sizes?: string }) {
  return (
    <div>
      <SectionHeader title={block.heading} titleSize="22px" seeAllHref={block.href} />
      <div className={css({ display: "flex", flexDirection: "column", gap: "26px" })}>
        {block.items.map((item) => (
          <MetaCard key={item.slug} item={item} cover={coverTall} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}

/** Meta cards two to a row (ចំណាប់អារម្មណ៍របស់ប្រិយមិត្ត — four of them on a
 *  section page, two on a topic page). */
export function CardGrid({ block, sizes }: { block: Block; sizes?: string }) {
  return (
    <div>
      <SectionHeader title={block.heading} titleSize="22px" seeAllHref={block.href} />
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", sm: "repeat(2,1fr)" },
          gap: "26px 20px",
        })}
      >
        {block.items.map((item) => (
          <MetaCard key={item.slug} item={item} cover={coverWide} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}

/** A numbered, text-only list. */
export function Ranked({ block, variant = "underline" }: { block: RankedBlock; variant?: "line" | "underline" }) {
  return (
    <div>
      <SectionHeader variant={variant} title={block.heading} titleSize="22px" seeAllHref={block.href} />
      <RankedList items={block.items} />
    </div>
  );
}

/** A lead featured card ABOVE a stack of horizontal rows. `fillHeight` lets a
 * desktop column distribute its rows through the height of a taller sibling. */
export function LeadAndRows({ block, sizes, fillHeight = false }: { block: Block; sizes?: string; fillHeight?: boolean }) {
  const [lead, ...rest] = block.items;
  return (
    <div
      className={css(
        fillHeight
          ? { display: "flex", flexDirection: "column", height: { base: "auto", lg: "100%" } }
          : {},
      )}
    >
      <SectionHeader title={block.heading} titleSize="22px" seeAllHref={block.href} />
      {lead && (
        <div className={css({ marginBottom: "22px" })}>
          <FeaturedArticleCard item={lead} sizes={sizes} />
        </div>
      )}
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          ...(fillHeight ? { flex: { lg: "1" }, justifyContent: { lg: "space-between" } } : {}),
        })}
      >
        {rest.map((item) => (
          <ArticleRow key={item.slug} item={item} sizes="(max-width: 1024px) 45vw, 280px" />
        ))}
      </div>
    </div>
  );
}

/** A lead featured card BESIDE a column of thumbnail rows (បំណិនជីវិត). `detailed`
 *  bumps the row thumbnails up to MiniRow's bigger geometry (180x120 vs 125x80). */
export function LeadBesideRows({ block, sizes, detailed }: { block: Block; sizes?: string; detailed?: boolean }) {
  const [lead, ...rest] = block.items;
  return (
    <div>
      <SectionHeader title={block.heading} titleSize="22px" seeAllHref={block.href} />
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", md: "minmax(0,1fr) minmax(0,1fr)" },
          gap: "24px",
          alignItems: "start",
        })}
      >
        {lead && <FeaturedArticleCard item={lead} sizes={sizes} excerpt={false} />}
        <div className={css({ display: "flex", flexDirection: "column", gap: "18px" })}>
          {rest.map((item) => (
            <MiniRow key={item.slug} item={item} variant={detailed ? "detailed" : "compact"} meta />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A column of thumbnail rows. `detailed` gives each row a bigger cover and its
 *  categories · date line (the topic page's អត្ថបទថ្មីៗ). */
export function Thumbs({
  block,
  detailed,
  meta,
  variant = "underline",
}: {
  block: Block;
  detailed?: boolean;
  /** Show categories and date independently of thumbnail size. */
  meta?: boolean;
  variant?: "line" | "underline";
}) {
  return (
    <div>
      <SectionHeader variant={variant} title={block.heading} titleSize="22px" seeAllHref={block.href} />
      <div className={detailed ? thumbsGapWide : thumbsGap}>
        {block.items.map((item) => (
          <MiniRow
            key={item.slug}
            item={item}
            variant={detailed ? "detailed" : "compact"}
            meta={meta ?? detailed}
          />
        ))}
      </div>
    </div>
  );
}
