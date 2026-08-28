import { getEpisodePreview } from "./episode";
import { fetchEpisodeRail, fetchLegacyEpisodeMedia, type RailEpisode } from "./episodes";
import type { Video } from "./api/video";
import { CURATED_PROGRAMS } from "./program-curation";
import { getFeaturedMovie, getProgram, routedProgram, type Program } from "./programs";
import { notFound } from "next/navigation";

interface WatchProgramOverrides {
  heroImageId?: number;
  defaults?: Partial<{
    description: string[];
    poster: string;
    backdrop: string;
    year: string;
    schedule: string;
  }>;
  verifiedVideoCovers?: Record<number, string>;
}

const WATCH_PROGRAM_OVERRIDES: Record<string, WatchProgramOverrides> = {
  "khmer-insider": {
    heroImageId: 79854,
    defaults: {
      description: [],
      poster: "",
      backdrop: "",
      year: "2023",
      schedule: "ផ្សាយរៀងរាល់ថ្ងៃសុក្រ ម៉ោង 12:30 ថ្ងៃត្រង់",
    },
    verifiedVideoCovers: {
      125153:
        "https://i.vimeocdn.com/video/1936314855-096fa5a03eec7aef6958d9bba111e11797003de81e097ffb86a8afde3e7e301e-d_1280?region=us",
      132563:
        "https://i.vimeocdn.com/video/1972991921-459a0ce86815948d73cb8a605567cc49280d20f3d45e14fd9adbd8c4fbc626fd-d_1280?region=us",
    },
  },
  "financial-street": {
    defaults: {
      description: [],
      poster: "",
      backdrop: "",
      year: "2023",
      schedule: "ចាក់ផ្សាយជារៀងរាល់ថ្ងៃពុធ វេលាម៉ោង ០៧យប់",
    },
  },
};

const hrefSlug = (href: string) => href.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
const labelSlug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "");

export interface ProgramWatchData {
  program: Program;
  episodes: RailEpisode[];
  current: RailEpisode | null;
  episode: Awaited<ReturnType<typeof getEpisodePreview>>;
  programVideo: Video | null;
  videoCover: string;
}

/** Shared data path for the custom watch-page programs and their episode URLs.
 * It deliberately uses the legacy fragment rail because the structured episode
 * list route currently 404s on production. */
export async function getProgramWatchData(
  slug: string,
  episodeSlug?: string,
): Promise<ProgramWatchData> {
  const config = WATCH_PROGRAM_OVERRIDES[slug];
  const defaults = config?.defaults;
  const ref = await routedProgram(slug);
  if (!ref) notFound();

  const [rawProgram, rail, feature] = await Promise.all([
    getProgram(slug),
    ref.showId ? fetchEpisodeRail(ref.showId) : Promise.resolve({ episodes: [] }),
    getFeaturedMovie(ref.postId, config?.heroImageId),
  ]);

  const program = {
    ...rawProgram,
    description: rawProgram.description.length
      ? rawProgram.description
      : feature?.description.length
        ? feature.description
        : [...(defaults?.description ?? [])],
    poster: rawProgram.poster || feature?.poster || defaults?.poster || "",
    backdrop: rawProgram.backdrop || feature?.backdrop || defaults?.backdrop || "",
    year: rawProgram.year || feature?.year || defaults?.year || "",
    schedule: rawProgram.schedule || defaults?.schedule || "",
  };
  const wanted = episodeSlug?.toLowerCase();
  const current = wanted
    ? rail.episodes.find(item =>
        hrefSlug(item.href) === wanted || String(item.id) === wanted || labelSlug(item.label) === wanted,
      ) ?? null
    : rail.episodes[0] ?? null;
  const programPageHref = CURATED_PROGRAMS.find(item => item.postId === ref.postId)?.wpHref;

  const [preview, legacyMedia] = current
    ? await Promise.all([getEpisodePreview(current.id), fetchLegacyEpisodeMedia(current.href, current.id)])
    : [null, programPageHref ? await fetchLegacyEpisodeMedia(programPageHref) : { video: null, cover: "" }];
  const episode = preview
    ? { ...preview, video: preview.video ?? legacyMedia.video }
    : current && legacyMedia.video
      ? {
          id: current.id,
          title: current.title,
          episodeNumber: current.label,
          video: legacyMedia.video,
          runTime: "",
          releaseDate: "",
          description: [],
          showTitle: program.title,
        }
      : null;

  return {
    program,
    episodes: rail.episodes,
    current,
    episode,
    programVideo: current ? null : legacyMedia.video,
    videoCover: legacyMedia.cover || (current ? config?.verifiedVideoCovers?.[current.id] ?? "" : ""),
  };
}
