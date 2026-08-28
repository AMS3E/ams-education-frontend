// A single episode page: /program/<program>/<episode>.
//
// Split from episodes.ts (which knows only tv_show ids) so that the show->program
// join lives in exactly one place. programs.ts already imports episodes.ts, so
// putting this there would close an import cycle.

import { notFound } from "next/navigation";
import { apiFetch } from "./api/client";
import { htmlToParagraphs } from "./api/mappers";
import { toVideo, type Video } from "./api/video";
import { fetchShowEpisodes, formatReleaseDate, type Episode } from "./episodes";
import { routedProgram } from "./programs";
import type { WpEpisodeDetail, WpObjectEnvelope } from "./api/wp-types";

/** An episode's playable video. Movies resolve through the same code — see
 *  `./api/video`, which is also where the `embed`-is-stale trap is documented. */
export type EpisodeVideo = Video;

const pad = (n: number) => String(n).padStart(2, "0");

/** 121 -> "02:01"; 3661 -> "1:01:01". */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The video's true length, from Vimeo's public oEmbed endpoint (no auth).
 *
 *  WordPress's `_episode_run_time` is typed by hand and is wrong on roughly half
 *  the episodes — unlock-the-life's S1:E15 claims 20:04 for a 24:17 video — so it
 *  is only ever the fallback. Returns "" on any failure and the caller degrades. */
async function fetchVimeoRunTime(videoUrl: string): Promise<string> {
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`, {
      next: { revalidate: false, tags: ["episodes"] },
    });
    if (!res.ok) return "";
    const { duration } = (await res.json()) as { duration?: number };
    return duration ? `${formatDuration(duration)} នាទី` : "";
  } catch {
    return "";
  }
}

export interface EpisodePage {
  program: { slug: string; title: string };
  episode: Episode;
  /** Lower-numbered neighbour, i.e. the header's "Previous Episode". */
  prev: Episode | null;
  next: Episode | null;
  /** Every episode of the show, ascending — the grid at the foot of the page. */
  season: Episode[];
  /** null when the detail request fails; the page still renders without a player. */
  video: EpisodeVideo | null;
  /** "02:01 នាទី". "" when unset or the detail request failed. */
  runTime: string;
  /** "13.04.2022". "" when unset or the detail request failed. */
  releaseDate: string;
  /** The episode's own blurb, as paragraphs — live renders it in a Description
   *  box under the player. [] for the many episodes with no excerpt. */
  description: string[];
  /** "រដូវកាលទី១" — the heading above the episode grid. "" when unset. */
  seasonName: string;
  /** The show's title, used in the <h1>. Falls back to the registry's. */
  showTitle: string;
}

/** A playable episode resolved directly by post id. This backs the Khmer
 * Insider overview's watch-page treatment, whose working episode rail comes
 * from the legacy HTML-fragment endpoint rather than `tv-show-episodes`. */
export interface EpisodePreview {
  id: number;
  title: string;
  episodeNumber: string;
  video: EpisodeVideo | null;
  runTime: string;
  releaseDate: string;
  description: string[];
  showTitle: string;
}

/** Everything the detail endpoint knows, or null if it failed. The episode page
 *  is still worth rendering without it — title, neighbours and the grid all come
 *  from the list — so this never throws. */
async function fetchDetail(id: number): Promise<WpEpisodeDetail | null> {
  try {
    const env = await apiFetch<WpObjectEnvelope<WpEpisodeDetail>>(`/wp/v2/web/episode?id=${id}`, {
      revalidate: false,
      tags: ["episodes", `episode:${id}`],
    });
    return env.data ?? null;
  } catch {
    return null;
  }
}

/** The episode's excerpt, from CORE rest — the one field the description box
 *  needs that our plugin's detail endpoint doesn't carry. "" on any failure;
 *  the box is simply omitted. */
async function fetchExcerpt(id: number): Promise<string> {
  try {
    const raw = await apiFetch<{ excerpt?: { rendered?: string } }>(`/wp/v2/episode/${id}?_fields=excerpt`, {
      revalidate: false,
      tags: ["episodes", `episode:${id}`],
    });
    return raw.excerpt?.rendered ?? "";
  } catch {
    return "";
  }
}

export async function getEpisodePreview(id: number): Promise<EpisodePreview | null> {
  const [detail, excerpt] = await Promise.all([fetchDetail(id), fetchExcerpt(id)]);
  if (!detail) return null;

  const video = toVideo(detail.video);
  const runTime =
    (video?.kind === "vimeo" ? await fetchVimeoRunTime(detail.video.url) : "") ||
    detail.run_time ||
    "";

  return {
    id: detail.id,
    title: detail.title,
    episodeNumber: detail.episode_number,
    video,
    runTime,
    releaseDate: formatReleaseDate(detail.release_date),
    description: htmlToParagraphs(excerpt),
    showTitle: detail.tv_show_title,
  };
}

/** 404s for an unknown program slug, or an episode slug the show doesn't have.
 *
 *  One cached fetch backs the episode, its neighbours and the season grid: with
 *  the full list in hand, prev/next is just index ±1. */
export async function getEpisodePage(programSlug: string, episodeSlug: string): Promise<EpisodePage> {
  const ref = await routedProgram(programSlug);
  if (!ref) notFound();

  const season = await fetchShowEpisodes(ref.showId);
  const index = season.findIndex(e => e.slug === episodeSlug);
  if (index === -1) notFound();

  const episode = season[index];
  const [detail, excerpt] = await Promise.all([fetchDetail(episode.id), fetchExcerpt(episode.id)]);

  const video = detail ? toVideo(detail.video) : null;
  // Vimeo is authoritative on length; WordPress is the fallback, not the source.
  const runTime =
    (video?.kind === "vimeo" && detail ? await fetchVimeoRunTime(detail.video.url) : "") ||
    detail?.run_time ||
    "";

  return {
    program: { slug: ref.slug, title: ref.title },
    episode,
    prev: season[index - 1] ?? null,
    next: season[index + 1] ?? null,
    season,
    video,
    runTime,
    releaseDate: formatReleaseDate(detail?.release_date ?? 0),
    description: htmlToParagraphs(excerpt),
    seasonName: detail?.season_name ?? "",
    showTitle: detail?.tv_show_title || ref.title,
  };
}
