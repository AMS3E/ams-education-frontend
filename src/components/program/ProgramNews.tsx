import { css } from "@/styled-system/css";
import SectionHeader from "@/components/ui/SectionHeader";
import ArticleCard from "@/components/ui/ArticleCard";
import ArticleRow from "@/components/ui/ArticleRow";
import FeaturedArticleCard from "@/components/ui/FeaturedArticleCard";
import type { ArticleRef } from "@/lib/articles";

const grid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "minmax(0, 0.92fr) minmax(0, 1.78fr)" },
  gap: { base: "36px", lg: "46px" },
  alignItems: "start",
  paddingTop: "56px",
});

const column = css({ display: "flex", flexDirection: "column", gap: "22px" });

const rows = css({
  display: "flex",
  flexDirection: "column",
  gap: "20px",
  paddingTop: "6px",
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "divider",
});

/** The two news columns below the program content: entertainment on the left,
 *  general news on the right. In the design these are hand-drawn collage/KPOP
 *  cards; on the real site they're ordinary article thumbnails. */
export default function ProgramNews({ entertainment, mixed }: { entertainment: ArticleRef[]; mixed: ArticleRef[] }) {
  if (entertainment.length === 0 && mixed.length === 0) return null;

  const [lead, ...rest] = mixed;

  return (
    <section className={grid}>
      <div className={column}>
        <SectionHeader
          title='ព័ត៌មានកម្សាន្ត'
          titleSize='22px'
          titleWeight={700}
          seeAllText='មើលបន្ថែម ➧'
          seeAllHref='/category/entertainment-news/news'
        />
        {entertainment.map(item => (
          <ArticleCard key={item.slug} item={item} sizes='(max-width: 1024px) 100vw, 380px' />
        ))}
      </div>

      <div className={column}>
        <SectionHeader
          title='ព័ត៌មានចម្រុះ'
          titleSize='22px'
          titleWeight={700}
          seeAllText='មើលបន្ថែម ➧'
          seeAllHref='/category/all-news'
        />
        {lead && <FeaturedArticleCard item={lead} sizes='(max-width: 1024px) 100vw, 720px' />}
        {rest.length > 0 && (
          <div className={rows}>
            {rest.map(item => (
              <ArticleRow key={item.slug} item={item} sizes='(max-width: 1024px) 45vw, 430px' />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
