import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import ArticleCard from "@/components/ui/ArticleCard";
import PosterCarousel from "@/components/home/PosterCarousel";
import type { ArticleExtras } from "@/lib/articles";
import { programHref } from "@/lib/programs";
import SectionHeader from "../ui/SectionHeader";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveHalfLandscape } from "@/components/ads/revive/zones";
import SummaryNewsCarousel from "./SummaryNewsCarousel";

/** One side of the prev/next pager. `align` flips the text for the "next" side. */
function PagerCard({ post, label, align }: { post: { slug: string; title: string; meta: string }; label: string; align: "left" | "right" }) {
  // getArticleExtras() falls back to "#" when the recent feed is short. Render
  // nothing rather than a link to /article/#, which would 404.
  if (!post.slug || post.slug === "#") return null;

  return (
    <Link
      href={`/article/${post.slug}`}
      className={css({
        display: "block",
        padding: "18px 22px",
        color: "inherit",
        textDecoration: "none",
        transition: "background .2s",
        _hover: { background: "rgba(127,127,140,0.05)", "& .pg-title": { color: "brand.blue" } },
      })}
      style={{ textAlign: align }}
    >
      <div className={css({ fontSize: "12px", color: "muted", marginBottom: "8px" })}>{label}</div>
      <div className={cx("pg-title", css({ fontSize: "14.5px", fontWeight: 600, color: "text", lineHeight: 1.5, transition: "color .2s" }))}>{post.title}</div>
      <div className={css({ fontSize: "11px", color: "muted", marginTop: "6px" })}>{post.meta}</div>
    </Link>
  );
}

export default function BelowArticle({ extras }: { extras: ArticleExtras }) {
  return (
    <div>
      {/* AMS program posters — a scrolling carousel (live wraps it in a
          `section-movies-carousel`), not a grid. The one slot on the site that
          shows every program (live: 20); it used to be capped at 4. */}
      <section id="special-programs" className={css({ marginTop: "44px" })}>
        <SectionHeader title="កម្មវិធីពិសេសរបស់ AMS ECONOMY" titleSize="20px" />
        <PosterCarousel
          posters={extras.programs.map((p) => ({
            src: p.image,
            title: p.title,
            year: p.year,
            href: programHref(p.slug),
          }))}
        />
      </section>

      {/* Video news */}
      <div className={css({ marginTop: "40px" })}>
        <SectionHeader title={extras.videos.heading} titleSize="20px" seeAllText="ប្រភេទវីដេអូ (VIDEO)" />
        <SummaryNewsCarousel items={extras.videos.items} />
      </div>

      <div className={css({ margin: "30px 0px" })}>
        <ReviveAdSlot zone={reviveHalfLandscape} />
      </div>

      {/* Previous / Next article pager */}
      <div
        className={css({
          marginTop: "34px",
          display: "grid",
          gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
          background: "#f5f5f5",
          padding: "25px",
        })}
      >
        <PagerCard post={extras.prevPost} label="អត្ថបទមុន" align="left" />
        <PagerCard post={extras.nextPost} label="អត្ថបទបន្ទាប់" align="right" />
      </div>

      {/* Other news */}
      <div className={css({ marginTop: "40px" })}>
        <SectionHeader title={extras.otherNews.heading} seeAllHref="/category/all-news" seeAllText="View all" />
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", sm: "repeat(3,1fr)" },
            gap: "20px",
          })}
        >
          {extras.otherNews.items.map((item) => (
            <ArticleCard key={item.slug} item={item} sizes="(max-width: 768px) 100vw, 400px" withCategories />
          ))}
        </div>
      </div>
    </div>
  );
}
