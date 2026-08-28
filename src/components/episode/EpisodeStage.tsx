import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import EpisodePlayer from "./EpisodePlayer";
import { episodeHref, type Episode } from "@/lib/episodes";
import type { EpisodeVideo } from "@/lib/episode";

const stage = css({
  display: "grid",
  gridTemplateColumns: { base: "34px 1fr 34px", md: "120px 1fr 120px" },
  alignItems: "center",
  gap: { base: "6px", md: "12px" },
  paddingTop: "24px",
});

const arrow = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6px",
  color: "muted",
  textDecoration: "none",
  fontSize: "12px",
  lineHeight: 1.3,
  textAlign: "center",
  transition: "color .2s, transform .2s",
  _hover: { color: "text", transform: "scale(1.04)" },
});

// Holds the column open when there is no neighbour, so the player never shifts
// sideways between the first episode and the second.
const spacer = css({ visibility: "hidden" });

const chevron = css({ fontSize: { base: "30px", md: "56px" }, fontWeight: 200, lineHeight: 1 });
const label = css({ display: { base: "none", md: "block" } });

function Arrow({ episode, programSlug, dir }: { episode: Episode | null; programSlug: string; dir: "prev" | "next" }) {
  const glyph = dir === "prev" ? "‹" : "›";
  const text = dir === "prev" ? "Previous\nEpisode" : "Next\nEpisode";

  if (!episode) {
    return (
      <span className={cx(arrow, spacer)} aria-hidden>
        <span className={chevron}>{glyph}</span>
      </span>
    );
  }

  return (
    <Link
      href={episodeHref(programSlug, episode.slug)}
      className={arrow}
      aria-label={`${dir === "prev" ? "Previous" : "Next"} episode: ${episode.episodeNumber || episode.title}`}>
      <span className={chevron}>{glyph}</span>
      <span className={cx(label, css({ whiteSpace: "pre-line" }))}>{text}</span>
    </Link>
  );
}

/** The player flanked by its prev/next episode arrows, as on the live page.
 *  Neighbours come from the show's full episode list, so the arrows walk the
 *  episodes that actually exist rather than doing arithmetic on their numbers —
 *  several programs have gaps (unlock-the-life starts at S1:E2). */
export default function EpisodeStage({
  video,
  title,
  programSlug,
  prev,
  next,
}: {
  video: EpisodeVideo | null;
  title: string;
  programSlug: string;
  prev: Episode | null;
  next: Episode | null;
}) {
  return (
    <div className={stage}>
      <Arrow episode={prev} programSlug={programSlug} dir='prev' />
      <EpisodePlayer video={video} title={title} />
      <Arrow episode={next} programSlug={programSlug} dir='next' />
    </div>
  );
}
