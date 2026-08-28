import { css } from "@/styled-system/css";
import SectionHeader from "@/components/ui/SectionHeader";
import PosterCarousel from "@/components/home/PosterCarousel";
import type { HomeCard } from "@/lib/home-data";

const section = css({ paddingTop: "44px" });

/** A program's episodes as 2:3 poster cards, reusing the homepage's carousel
 *  (same cards, same scroll-by-a-page arrows).
 *
 *  Defaults to the program page's "វគ្គថ្មីៗ" heading with no "see all" — that
 *  page already IS the program's. The landing pages pass the show's own name and
 *  a link to it instead.
 *
 *  Renders nothing when a program has no episodes rather than leaving an empty
 *  header behind. */
export default function EpisodeCarousel({
  episodes,
  title = "វគ្គថ្មីៗ",
  seeAllHref,
  unoptimized,
  autoScrollMs,
}: {
  episodes: HomeCard[];
  title?: string;
  seeAllHref?: string;
  /** See CoverImage's `unoptimized` — applied to every card. */
  unoptimized?: boolean;
  /** Optional one-card autoplay interval for this rail. */
  autoScrollMs?: number;
}) {
  if (episodes.length === 0) return null;

  return (
    <section className={section}>
      <SectionHeader title={title} titleSize='22px' titleWeight={700} seeAllHref={seeAllHref} />
      <PosterCarousel
        posters={episodes.map(e => ({
          src: e.src,
          title: e.title,
          year: e.ep,
          href: e.href,
        }))}
        unoptimized={unoptimized}
        autoScrollMs={autoScrollMs}
      />
    </section>
  );
}
