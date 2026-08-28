import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import SectionHeader from "@/components/ui/SectionHeader";
import { episodeHref, type Episode } from "@/lib/episodes";

/** Above this, the grid links out to the all-episodes page instead of rendering
 *  the rest. Only daily-feed (617 episodes) hits it; the next largest show has
 *  80, so every other program still renders in full, exactly as the live page
 *  does. The all-episodes page itself passes `max={Infinity}`. */
const MAX_CARDS = 100;

const grid = css({
  display: "grid",
  gridTemplateColumns: { base: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)", lg: "repeat(6, 1fr)" },
  gap: "16px",
  paddingTop: "6px",
});

const card = css({ display: "block", color: "inherit", textDecoration: "none" });

const poster = css({
  position: "relative",
  width: "100%",
  aspectRatio: "2/3",
  overflow: "hidden",
  borderRadius: "4px",
  background: "skeleton.base",
});

const current = css({ outline: "2px solid token(colors.brand.blue)", outlineOffset: "2px" });

const epText = css({ marginTop: "8px", color: "muted", fontSize: "11px", letterSpacing: "0.04em" });

const titleText = css({ color: "text", fontSize: "12.5px", lineHeight: 1.4, lineClamp: "2" });

/** The season's episodes as poster cards — the grid at the foot of the live page,
 *  headed by the season's own name (e.g. "រដូវកាលទី១"). Each card carries the
 *  episode's run time + Added date once the plugin (≥1.5.0) sends them. */
export default function SeasonGrid({
  episodes,
  programSlug,
  currentId,
  seasonName,
  max = MAX_CARDS,
}: {
  episodes: Episode[];
  programSlug: string;
  /** 0 marks no card as the current episode (the all-episodes page). */
  currentId: number;
  seasonName: string;
  max?: number;
}) {
  if (episodes.length === 0) return null;

  const shown = episodes.slice(0, max);
  const truncated = episodes.length > shown.length;

  return (
    <section className={css({ paddingTop: "56px" })}>
      <SectionHeader
        title={seasonName || "វគ្គទាំងអស់"}
        titleSize='22px'
        titleWeight={700}
        seeAllHref={truncated ? `/program/${programSlug}/episodes` : undefined}
        seeAllText={truncated ? `មើលទាំងអស់ (${episodes.length}) ➧` : undefined}
      />

      <div className={grid}>
        {shown.map(ep => {
          const facts = [ep.runTime, ep.releaseDate && `Added: ${ep.releaseDate}`].filter(Boolean).join(" | ");
          return (
            <Link key={ep.id} href={episodeHref(programSlug, ep.slug)} className={card}>
              <div className={cx(poster, ep.id === currentId && current)}>
                <CoverImage src={ep.thumbnail} sizes='(max-width: 768px) 50vw, 16vw' />
              </div>
              {ep.episodeNumber && <div className={epText}>{ep.episodeNumber}</div>}
              <div className={titleText}>{ep.title}</div>
              {facts && <div className={epText}>{facts}</div>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
