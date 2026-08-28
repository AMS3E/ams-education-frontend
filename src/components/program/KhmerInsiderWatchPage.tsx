import { css } from "@/styled-system/css";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveFullLandscape } from "@/components/ads/revive/zones";
import CoverImage from "@/components/ui/CoverImage";
import EpisodePlayer from "@/components/episode/EpisodePlayer";
import EpisodePosterPlayer from "./EpisodePosterPlayer";
import KhmerInsiderSidebar from "./KhmerInsiderSidebar";
import type { EpisodePreview } from "@/lib/episode";
import type { RailEpisode } from "@/lib/episodes";
import type { Video } from "@/lib/api/video";
import type { Program } from "@/lib/programs";

const shell = css({
  maxWidth: "1440px",
  mx: "auto",
  px: { base: "14px", md: "24px" },
  pt: { base: "16px", md: "24px" },
  pb: "54px",
});
const columns = css({
  display: "grid",
  gridTemplateColumns: { base: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 331px" },
  gridTemplateAreas: {
    base: `"player" "sidebar" "extra"`,
    lg: `"player sidebar" "extra sidebar"`,
  },
  gap: { base: "24px", lg: "12px" },
  alignItems: "start",
});
const playerArea = css({ gridArea: "player", minWidth: 0 });
const sidebarArea = css({ gridArea: "sidebar", minWidth: 0 });
const extraArea = css({ gridArea: "extra", minWidth: 0 });
const fullLandscapeAd = css({ marginTop: { base: "24px", md: "44px" } });
const videoTitle = css({
  margin: "12px 0 0",
  fontWeight: 400,
  fontSize: { base: "17px", md: "20px" },
  lineHeight: 1.5,
  color: "text",
});
const videoMeta = css({ margin: "2px 0 0", fontSize: "12px", lineHeight: 2.2, color: "muted" });
const box = css({ background: { base: "#efefef", _dark: "#191a20" } });
const descriptionBox = css({ marginTop: "10px", padding: { base: "20px", md: "24px 30px" } });
const boxTitle = css({ margin: 0, fontWeight: 400, fontSize: "20px", lineHeight: 1.5, color: "text" });
const copy = css({ margin: "8px 0 0", fontSize: "12px", lineHeight: 1.85, color: "text" });
const aboutBox = css({ marginTop: "15px", padding: { base: "24px 20px", md: "34px 35px" } });
const aboutGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "92px minmax(0, 1fr)", md: "139px minmax(0, 1fr)" },
  gridTemplateAreas: '"thumb head" "thumb text"',
  columnGap: { base: "18px", md: "31px" },
  rowGap: "16px",
});
const aboutThumb = css({
  gridArea: "thumb",
  position: "relative",
  width: { base: "92px", md: "139px" },
  height: { base: "162px", md: "244px" },
  overflow: "hidden",
  background: "skeleton.base",
});
const aboutHead = css({ gridArea: "head", minWidth: 0 });
const aboutSchedule = css({ margin: 0, fontSize: "12px", lineHeight: 2.2, color: "muted" });
const aboutText = css({ gridArea: "text", minWidth: 0, margin: 0, fontSize: "12px", lineHeight: 1.85, color: "text", textAlign: "justify" });

export default function KhmerInsiderWatchPage({
  programSlug,
  program,
  episode,
  programVideo,
  episodes,
  videoCover,
  currentEpisode,
}: {
  programSlug: string;
  program: Program;
  episode: EpisodePreview | null;
  programVideo: Video | null;
  episodes: RailEpisode[];
  videoCover: string;
  currentEpisode?: RailEpisode | null;
}) {
  const description = episode?.description.length ? episode.description : program.description;
  const current = currentEpisode ?? episodes[0];
  const currentSlug = current?.href.split("/").filter(Boolean).at(-1);
  const currentHref = currentSlug ? `/program/${programSlug}/${currentSlug}` : `/program/${programSlug}`;
  const title = episode
    ? [episode.showTitle, episode.episodeNumber, episode.title].filter(Boolean).join(" - ")
    : current?.title || program.title;
  const facts = episode
    ? [episode.runTime, episode.releaseDate && `Added: ${episode.releaseDate}`].filter(Boolean).join("  |  ")
    : current?.meta || "";

  return (
    <div className={shell}>
      <div className={columns}>
        <div className={playerArea}>
          {episode?.video ? (
            <EpisodePlayer video={episode.video} title={title} />
          ) : current ? (
            <EpisodePosterPlayer
              href={currentHref}
              thumbnail={videoCover || program.backdrop}
              title={current.title}
            />
          ) : programVideo ? (
            <EpisodePlayer video={programVideo} title={title} />
          ) : (
            <EpisodePlayer video={null} title={title} />
          )}
          <h1 className={videoTitle}>{title}</h1>
          {facts && <p className={videoMeta}>{facts}</p>}
        </div>

        <div className={sidebarArea}>
          <KhmerInsiderSidebar
            key={current?.id ?? "program"}
            programSlug={programSlug}
            episodes={episodes}
            title={program.title}
            schedule={program.schedule}
            currentEpisodeId={current?.id}
          />
        </div>

        <div className={extraArea}>
          <section className={`${box} ${descriptionBox}`}>
            <h2 className={boxTitle}>Description</h2>
            {description.length ? description.map((paragraph, index) => <p className={copy} key={index}>{paragraph}</p>) : <p className={copy}>Khmer Insider</p>}
          </section>

          <section className={`${box} ${aboutBox}`}>
            <div className={aboutGrid}>
              <div className={aboutThumb}>
                <CoverImage src={program.poster} alt={program.title} sizes="139px" />
              </div>
              <div className={aboutHead}>
                <h2 className={boxTitle}>អំពី {program.title}</h2>
                {[program.year, program.schedule].filter(Boolean).length > 0 && (
                  <p className={aboutSchedule}>{[program.year, program.schedule].filter(Boolean).join(" | ")}</p>
                )}
              </div>
              <p className={aboutText}>{program.description.join(" ") || description.join(" ")}</p>
            </div>
          </section>
        </div>
      </div>

      <div className={fullLandscapeAd}>
        <ReviveAdSlot zone={reviveFullLandscape} />
      </div>
    </div>
  );
}
