// Single-program read + write for the Programs editor, plus the read-only
// episode list. Programs are MasVideos `movie` / `tv_show` posts; the admin
// route's [id] doesn't say which type, so the loader probes both in parallel
// and keeps whichever answers (movie wins a tie; ids never collide anyway).
//
// Reads use context=edit — allowed since plugin v1.7.2, whose user_has_cap
// filter supplies the per-post capability variants (edit_others_movies,
// edit_published_movies, …) that map_meta_cap demands — and return the curated
// meta set the plugin registered for REST in v1.7.1.
//
// Write scope: title, description (post_EXCERPT — MasVideos' "Movie short
// description", which is what /web/program serves as the public page's
// description; verified live on #221836, 2026-08-27), release date,
// broadcast schedule, poster and backdrop. The video source and post_content
// are READ but never written (both cut from the editor on the owner's
// request, 2026-08-27 — see docs/session-log.md S47): post_content is a
// Gutenberg columns + [epsode-carousel] layout canvas the old WP-rendered
// page depends on, not prose, and the _movie_* video meta stays managed in
// WordPress.
// Status, poster/backdrop and the `_seasons` repeater are out of scope: status
// stays whatever it is, artwork waits on the media picker, seasons stay in
// WordPress.

import { cache } from "react";
import { adminFetch, AdminApiError } from "./client";
import { fastFetch, FastPathError, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";

export type ProgramType = "movie" | "tv_show";

/** Unix seconds ↔ "YYYY-MM-DD" in Asia/Phnom_Penh (UTC+7, no DST). The CMS
 *  stores release dates as midnight Phnom Penh; formatting them in UTC is the
 *  live site's off-by-one-day bug, so both directions pin the offset. */
const TZ_OFFSET = 7 * 3600;

function tsToIsoDate(ts: number): string {
  return ts > 0 ? new Date((ts + TZ_OFFSET) * 1000).toISOString().slice(0, 10) : "";
}

/** "" for blank, a positive timestamp for a valid date, null for garbage. */
export function isoDateToTs(iso: string): number | null {
  const s = iso.trim();
  if (!s) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000 - TZ_OFFSET;
  return Number.isFinite(ts) ? ts : null;
}

interface RawEditProgram {
  id: number;
  status: string;
  slug?: string;
  link?: string;
  title?: { raw?: string; rendered?: string };
  excerpt?: { raw?: string };
  content?: { raw?: string };
  featured_media?: number;
  meta?: Record<string, unknown>;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { sizes?: { medium?: { source_url?: string }; thumbnail?: { source_url?: string } } };
    }[];
  };
}

export interface ProgramVideo {
  /** movie_url | movie_file | movie_embed ("" when never set). */
  choice: string;
  url: string;
  embed: string;
  attachmentId: number;
}

export interface EditableProgram {
  id: number;
  type: ProgramType;
  /** URL slug — seeds the slugs of things created FROM the program (the
   *  companion show, episodes). */
  slug: string;
  title: string;
  /** excerpt.raw as plain text — MasVideos' "Movie short description", the
   *  text the public program page shows (/web/program serves get_the_excerpt).
   *  NOT post_content — see `body`. */
  description: string;
  /** content.raw, READ-ONLY in the editor. On newer programs this is the old
   *  WP page's layout canvas (Gutenberg columns + [epsode-carousel]); shown so
   *  editors know it exists, never written so it can't be mangled. */
  body: string;
  status: string;
  /** WordPress permalink, for the top bar's View button. */
  link: string;
  posterThumb: string;
  /** Poster = the post's featured image; 0 when unset. */
  posterId: number;
  /** Backdrop attachment id (_vodi_*_bg_image); 0 when unset. There is no
   *  cheap thumb for it on load (it isn't the featured image), so the form
   *  shows "#id" until a new one is picked. */
  backdropId: number;
  /** "YYYY-MM-DD" (Phnom Penh) or "". */
  releaseDate: string;
  /** Broadcast schedule — free text, not a duration (_*_run_time). */
  schedule: string;
  /** null for a tv_show — it has no video source of its own. */
  video: ProgramVideo | null;
  /** tv_show id addressing the episode list (a movie's _khi_tv_show_id, a
   *  tv_show's own id). 0 = no linked show. */
  showId: number;
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v : "";
}
function metaInt(meta: Record<string, unknown> | undefined, key: string): number {
  const v = Number(meta?.[key]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

async function fetchOne(type: ProgramType, id: number): Promise<RawEditProgram | null> {
  try {
    const { data } = await adminFetch<RawEditProgram>(`/wp/v2/${type}/${id}`, {
      query: {
        context: "edit",
        _fields: "id,status,slug,link,title,excerpt,content,featured_media,meta,_links,_embedded",
        _embed: "wp:featuredmedia",
      },
    });
    return data?.id ? data : null;
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 404) return null;
    throw e;
  }
}

function toEditable(raw: RawEditProgram, type: ProgramType): EditableProgram {
  const media = raw._embedded?.["wp:featuredmedia"]?.[0];
  const meta = raw.meta;
  const movie = type === "movie";
  return {
    id: raw.id,
    type,
    slug: raw.slug ?? "",
    title: decodeEntities(raw.title?.raw ?? "").trim(),
    description: excerptToText(raw.excerpt?.raw ?? ""),
    body: raw.content?.raw ?? "",
    status: raw.status,
    link: raw.link ?? "",
    posterThumb:
      media?.media_details?.sizes?.medium?.source_url ??
      media?.media_details?.sizes?.thumbnail?.source_url ??
      media?.source_url ??
      "",
    posterId: raw.featured_media ?? 0,
    backdropId: metaInt(meta, movie ? "_vodi_movie_bg_image" : "_vodi_tv_show_bg_image"),
    releaseDate: tsToIsoDate(metaInt(meta, movie ? "_movie_release_date" : "_tv_show_release_date")),
    schedule: metaStr(meta, movie ? "_movie_run_time" : "_tv_show_run_time"),
    video: movie
      ? {
          choice: metaStr(meta, "_movie_choice"),
          url: metaStr(meta, "_movie_url_link"),
          embed: metaStr(meta, "_movie_embed_content"),
          attachmentId: metaInt(meta, "_movie_attachment_id"),
        }
      : null,
    showId: movie ? metaInt(meta, "_khi_tv_show_id") : raw.id,
  };
}

// Both type probes fire in PARALLEL (WordPress costs ~4s per call, so a serial
// movie→tv_show fallback doubled the tv_show program's load time; one wasted
// 404 probe is cheaper than a second round trip). React cache() dedupes the
// call within a request — the [id] layout and the episodes page both ask for
// the same program and must not pay for it twice.
export const getProgramForEdit = cache(async (id: number): Promise<EditableProgram | null> => {
  const [asMovie, asShow] = await Promise.all([fetchOne("movie", id), fetchOne("tv_show", id)]);
  if (asMovie) return toEditable(asMovie, "movie");
  return asShow ? toEditable(asShow, "tv_show") : null;
});

/** The same program in ONE query — the fast endpoint resolves the type from
 *  the row, so the two-probe race above isn't needed. Returns null for a
 *  missing program, matching the REST loader. */
export async function getProgramForEditFast(id: number, token?: string): Promise<EditableProgram | null> {
  let body;
  try {
    body = await fastFetch<{
      id: number;
      type: ProgramType;
      slug: string;
      title: string;
      /** post_excerpt. ABSENT from ams-fast-api < 1.8.4 — see the guard below. */
      excerpt?: string;
      /** post_content (pre-1.8.4 builds sent it as `description`). */
      body?: string;
      status: string;
      link: string;
      posterThumb: string;
      posterId: number;
      backdropId: number;
      releaseTs: number;
      schedule: string;
      video: ProgramVideo | null;
      showId: number;
    }>("program", { id }, { token });
  } catch (e) {
    // "no such program" is an ANSWER, not a fast-path failure — falling back
    // to REST for it would pay ~8s of 404 probes to learn the same thing.
    if (e instanceof FastPathError && e.reason === "not_found") return null;
    throw e;
  }

  const d = body.data;
  // A fast-api build older than 1.8.4 has no `excerpt`. Reading it as ""
  // would BLANK the short description on the editor's next save, so a stale
  // plugin hands this one read to WP REST — directly, not by throwing: an old
  // build is not a fast-path failure and must not trip the breaker.
  if (typeof d.excerpt !== "string") {
    console.warn("[fast] program: plugin predates `excerpt` (needs ams-fast-api 1.8.4) — reading via WP REST");
    return getProgramForEdit(id);
  }
  return {
    id: d.id,
    type: d.type,
    slug: d.slug ?? "",
    title: decodeEntities(d.title ?? "").trim(),
    description: excerptToText(d.excerpt),
    body: d.body ?? "",
    status: d.status,
    link: d.link ?? "",
    posterThumb: d.posterThumb ?? "",
    posterId: d.posterId ?? 0,
    backdropId: d.backdropId ?? 0,
    releaseDate: tsToIsoDate(d.releaseTs ?? 0),
    schedule: d.schedule ?? "",
    video: d.video,
    showId: d.showId ?? 0,
  };
}

/** The read the program editor should call. React cache() dedupes within a
 *  request, exactly as the REST loader does — the [id] layout and the
 *  episodes page both ask for the same program. */
export const readProgramForEdit = cache(
  (id: number, token?: string): Promise<EditableProgram | null> =>
    withRestFallback(
      "program",
      () => getProgramForEditFast(id, token),
      () => getProgramForEdit(id),
    ),
);

/** The fields the editor writes back. `releaseTs` is already converted (0 clears). */
export interface ProgramWrite {
  title: string;
  /** post_excerpt — the public page's description. post_content is never
   *  written (see the header). */
  description: string;
  releaseTs: number;
  schedule: string;
  /** Poster (featured image) attachment id; 0 = clear. */
  posterId: number;
  /** Backdrop attachment id (_vodi_*_bg_image); 0 = clear. */
  backdropId: number;
  /** Omit to leave the status untouched (the plain Save). Setting it is what
   *  puts a program on, or takes it off, the public site. */
  status?: "draft" | "publish";
}

export async function updateProgram(
  type: ProgramType,
  id: number,
  patch: ProgramWrite,
): Promise<{ id: number; status: string }> {
  const movie = type === "movie";
  const meta: Record<string, string | number> = movie
    ? {
        _movie_release_date: patch.releaseTs,
        _movie_run_time: patch.schedule,
        _vodi_movie_bg_image: patch.backdropId,
      }
    : {
        _tv_show_release_date: patch.releaseTs,
        _tv_show_run_time: patch.schedule,
        _vodi_tv_show_bg_image: patch.backdropId,
      };
  const { data } = await adminFetch<{ id: number; status: string }>(`/wp/v2/${type}/${id}`, {
    method: "POST",
    body: {
      title: patch.title,
      excerpt: patch.description,
      featured_media: patch.posterId,
      ...(patch.status ? { status: patch.status } : {}),
      meta,
    },
    // Saving a post that IS or BECOMES published runs WordPress's slow
    // publish-path hooks (~75s measured). The default 30s cap would report a
    // legitimate slow success as a failure.
    timeoutMs: CREATE_TIMEOUT,
  });
  return data;
}

/** Status-only flip, for the top bar's Publish/Unpublish when no Details form
 *  is mounted (the Episodes tab). Touches nothing else on the post. */
export async function updateProgramStatus(
  type: ProgramType,
  id: number,
  status: "draft" | "publish",
): Promise<{ id: number; status: string }> {
  const { data } = await adminFetch<{ id: number; status: string }>(`/wp/v2/${type}/${id}`, {
    method: "POST",
    body: { status },
    timeoutMs: CREATE_TIMEOUT,
  });
  return data;
}

/* --- create --- */

/** Create-time field set. `slug` is the /program/<slug> route (Latin — the
 *  action validates), already resolved by the form. */
export interface ProgramCreateWrite {
  title: string;
  slug: string;
  /** draft = dashboard-only; publish = live on the public site (the dynamic
   *  registry routes any published program). */
  status: "draft" | "publish";
  /** post_excerpt — see ProgramWrite.description. */
  description: string;
  releaseTs: number;
  schedule: string;
  posterId: number;
  backdropId: number;
}

// WP-side save hooks can be genuinely slow — a PUBLISH-path save was measured
// at ~79s (tv_show create; draft saves run the normal ~5s), and 120s proved
// too tight for real writes: an episode DELETE completed at ~166s and an
// episode edit-save overran 120s outright (both 2026-08-26), each surfacing
// as a TimeoutError for a write that then succeeded. 300s means a slow hook
// is a slow success, not an abort.
const CREATE_TIMEOUT = 300_000;

/**
 * Create a program = its `movie` post ONLY. The companion `tv_show` (episode
 * container) is NOT made here any more — most creates don't need it yet, and
 * its publish-path save is the slow one. It's created on demand from the
 * editor's Episodes tab (createShowForProgram), which sets the movie's
 * `_khi_tv_show_id` at that point.
 */
export async function createProgram(w: ProgramCreateWrite): Promise<{ id: number }> {
  const meta: Record<string, string | number> = {
    _movie_release_date: w.releaseTs,
    _movie_run_time: w.schedule,
    _vodi_movie_bg_image: w.backdropId,
  };

  const { data: movie } = await adminFetch<{ id: number }>(`/wp/v2/movie`, {
    method: "POST",
    body: {
      title: w.title,
      slug: w.slug,
      excerpt: w.description,
      status: w.status,
      ...(w.posterId ? { featured_media: w.posterId } : {}),
      meta,
    },
    timeoutMs: CREATE_TIMEOUT,
  });
  return { id: movie.id };
}

/**
 * Create a program's episode container on demand: a DRAFT `tv_show`, then the
 * movie's `_khi_tv_show_id` pointer to it. Returns the new show id.
 *
 * Draft, not published, for two reasons:
 *
 * 1. It cannot become a junk public page. The registry only treats a tv_show
 *    as a container while some PUBLISHED movie still points at it — trash or
 *    unpublish the movie and the container would start routing as a program
 *    of its own (three such pages exist on the live site from before this).
 *    A draft never enters the anonymous registry at all, so the whole failure
 *    mode is gone rather than patched per-path.
 * 2. It's fast. The publish-path save was the ~79s cost that pushed container
 *    creation out of the create flow in the first place.
 *
 * Safe because nothing public reads the show POST: episodes are fetched
 * through the plugin's `web/tv-show-episodes`, which filters EPISODES by
 * post_status and joins on `_tv_show_id` — the show's own status is never
 * consulted. The one caveat is wp-admin's native episode picker, which may
 * not list draft shows; episodes created from this dashboard set
 * `_tv_show_id` directly and don't use it.
 */
export async function createShowForProgram(movie: { id: number; title: string; slug: string }): Promise<{ showId: number }> {
  const { data: show } = await adminFetch<{ id: number }>(`/wp/v2/tv_show`, {
    method: "POST",
    body: { title: movie.title, slug: `${movie.slug}-show`, status: "draft" },
    timeoutMs: CREATE_TIMEOUT,
  });

  // Link the movie to it. A published movie's save may itself run the slow
  // publish-path hooks, so this write gets the long deadline too.
  await adminFetch(`/wp/v2/movie/${movie.id}`, {
    method: "POST",
    body: { meta: { _khi_tv_show_id: show.id } },
    timeoutMs: CREATE_TIMEOUT,
  });
  return { showId: show.id };
}

/** Episode create-time field set — mirrors what wp-admin's episode editor
 *  collects (see docs/api/how-to-create-home-page-v1.pdf) using the meta
 *  the plugin registered for REST (≥1.7.1). */
export interface EpisodeCreateWrite {
  showId: number;
  /** e.g. "S1:E13" — the site's label convention; single source of ordering. */
  label: string;
  /** Episode post slug (Latin, unique-ified by WordPress if taken). */
  slug: string;
  title: string;
  /** Video URL (Vimeo/YouTube) — every episode on the site is `episode_url`. */
  videoUrl: string;
  /** Unix seconds at midnight Phnom Penh; 0 = unset. */
  releaseTs: number;
  /** Free text, e.g. "27:18 នាទី". */
  runTime: string;
  /** post_excerpt — the "Description" box under the player on the episode
   *  page. Both sites print the EXCERPT there, not the content body
   *  (verified on a Daily Feed episode where the two differ). Plain text. */
  description: string;
  /** Thumbnail attachment id; 0 = none. */
  thumbId: number;
}

/**
 * Create a PUBLISHED episode attached to a show. Published because the
 * episode endpoints (web/tv-show-episodes, the public episode page) only
 * surface published episodes — a draft would just vanish from every list.
 * The public site updates itself: the plugin's publish webhook busts
 * `episodes` + `tv-show:<id>` on the episode's publish.
 */
export async function createEpisode(w: EpisodeCreateWrite): Promise<{ id: number }> {
  const { data } = await adminFetch<{ id: number }>(`/wp/v2/episode`, {
    method: "POST",
    body: {
      title: w.title,
      slug: w.slug,
      status: "publish",
      excerpt: w.description,
      ...(w.thumbId ? { featured_media: w.thumbId } : {}),
      meta: {
        _tv_show_id: w.showId,
        _episode_number: w.label,
        _episode_choice: "episode_url",
        _episode_url_link: w.videoUrl,
        _episode_release_date: w.releaseTs,
        _episode_run_time: w.runTime,
      },
    },
    timeoutMs: CREATE_TIMEOUT,
  });
  return { id: data.id };
}

/**
 * Move a program-family post to the TRASH — recoverable from wp-admin's Trash,
 * not a force-delete (`?force=true` would be permanent). A published post runs
 * the same slow save hooks on the way out as on the way in, so this gets the
 * long deadline too.
 */
export async function trashProgramPost(
  type: ProgramType | "episode",
  id: number,
  timeoutMs: number = CREATE_TIMEOUT,
): Promise<void> {
  await adminFetch(`/wp/v2/${type}/${id}`, { method: "DELETE", timeoutMs });
}

/**
 * Did this post actually leave the site? A DELETE that times out has very
 * often COMPLETED WordPress-side and simply not answered inside the deadline —
 * the publish-path hooks keep running after the delete itself is done. Asking
 * beats assuming: reporting "couldn't trash it" about a post that is already
 * in the trash sends people to wp-admin to fix nothing.
 */
export async function isTrashed(type: ProgramType | "episode", id: number): Promise<boolean> {
  try {
    const { data } = await adminFetch<{ id: number; status: string }>(`/wp/v2/${type}/${id}`, {
      query: { context: "edit", _fields: "id,status" },
    });
    return !data?.id || data.status === "trash";
  } catch (e) {
    // Some setups 404 a trashed post rather than returning status:"trash".
    if (e instanceof AdminApiError && e.status === 404) return true;
    throw e;
  }
}

/* --- single episode read/write (the Edit-episode dialog) --- */

/** "S2:E14" / "S01I100" / bare "88" — season then episode, best-effort.
 *  The label is the site's single source of episode ordering; the stored
 *  season_id index is unreliable. */
export function parseEpisodeLabel(label: string): { season: number; episode: number } {
  const m = /s\s*0*(\d+)\D+0*(\d+)/i.exec(label);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  const bare = /^\s*0*(\d+)\s*$/.exec(label);
  return { season: 0, episode: bare ? Number(bare[1]) : 0 };
}

/** The excerpt as an editor should see it. wp-admin's block editor stores the
 *  excerpt WITH its <p> wrappers (the déjà vu episode reads "<p>…</p>" raw),
 *  which a textarea must not show. Paragraph breaks become blank lines and
 *  <br> a newline; anything else (rare inline markup) is left alone. Writing
 *  the plain text back renders identically: every excerpt surface — REST's
 *  `rendered`, Vodi's short description — runs wpautop, which re-wraps
 *  blank-line-separated text in <p>. */
export function excerptToText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n\n")
    .replace(/<\/?p\b[^>]*>/gi, "")
    .trim();
}

interface RawEditEpisode {
  id: number;
  slug?: string;
  title?: { raw?: string };
  excerpt?: { raw?: string };
  featured_media?: number;
  meta?: Record<string, unknown>;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { sizes?: { medium?: { source_url?: string }; thumbnail?: { source_url?: string } } };
    }[];
  };
}

/** An episode's editable state — what the edit dialog prefills from. The list
 *  endpoint (web/tv-show-episodes) can't serve this: it has no video URL, and
 *  its release date is already display-formatted. */
export interface EditableEpisode {
  id: number;
  /** The show it hangs off (_tv_show_id); 0 when detached. */
  showId: number;
  season: number;
  episode: number;
  title: string;
  /** The excerpt as typed (the Description box), "" when blank. */
  description: string;
  videoUrl: string;
  /** "YYYY-MM-DD" (Phnom Penh) or "". */
  releaseDate: string;
  runTime: string;
  thumbId: number;
  thumbUrl: string;
}

export async function getEpisodeForEdit(id: number): Promise<EditableEpisode | null> {
  let raw: RawEditEpisode | null;
  try {
    const { data } = await adminFetch<RawEditEpisode>(`/wp/v2/episode/${id}`, {
      query: {
        context: "edit",
        _fields: "id,slug,title,excerpt,featured_media,meta,_links,_embedded",
        _embed: "wp:featuredmedia",
      },
    });
    raw = data?.id ? data : null;
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 404) return null;
    throw e;
  }
  if (!raw) return null;

  const meta = raw.meta;
  const media = raw._embedded?.["wp:featuredmedia"]?.[0];
  const { season, episode } = parseEpisodeLabel(metaStr(meta, "_episode_number"));
  return {
    id: raw.id,
    showId: metaInt(meta, "_tv_show_id"),
    season,
    episode,
    title: decodeEntities(raw.title?.raw ?? "").trim(),
    description: excerptToText(raw.excerpt?.raw ?? ""),
    videoUrl: metaStr(meta, "_episode_url_link"),
    releaseDate: tsToIsoDate(metaInt(meta, "_episode_release_date")),
    runTime: metaStr(meta, "_episode_run_time"),
    thumbId: raw.featured_media ?? 0,
    thumbUrl:
      media?.media_details?.sizes?.medium?.source_url ??
      media?.media_details?.sizes?.thumbnail?.source_url ??
      media?.source_url ??
      "",
  };
}

/** The same episode from the fast path. Season/episode are parsed from the
 *  label by the SAME parseEpisodeLabel both paths use. */
export async function getEpisodeForEditFast(id: number, token?: string): Promise<EditableEpisode | null> {
  let body;
  try {
    body = await fastFetch<{
      id: number;
      slug: string;
      title: string;
      showId: number;
      label: string;
      videoUrl: string;
      releaseTs: number;
      runTime: string;
      /** post_excerpt. ABSENT from ams-fast-api < 1.8.3 — see the guard below. */
      excerpt?: string;
      thumbId: number;
      thumbUrl: string;
    }>("episode", { id }, { token });
  } catch (e) {
    if (e instanceof FastPathError && e.reason === "not_found") return null;
    throw e;
  }

  const d = body.data;
  // A fast-api build older than 1.8.3 has no `excerpt`. Reading it as ""
  // would BLANK the description on the editor's next save, so a stale plugin
  // hands this one read to WP REST — directly, not by throwing: an old build
  // is not a fast-path failure and must not trip the breaker.
  if (typeof d.excerpt !== "string") {
    console.warn("[fast] episode: plugin predates `excerpt` (needs ams-fast-api 1.8.3) — reading via WP REST");
    return getEpisodeForEdit(id);
  }
  const { season, episode } = parseEpisodeLabel(d.label ?? "");
  return {
    id: d.id,
    showId: d.showId ?? 0,
    season,
    episode,
    title: decodeEntities(d.title ?? "").trim(),
    description: excerptToText(d.excerpt),
    videoUrl: d.videoUrl ?? "",
    releaseDate: tsToIsoDate(d.releaseTs ?? 0),
    runTime: d.runTime ?? "",
    thumbId: d.thumbId ?? 0,
    thumbUrl: d.thumbUrl ?? "",
  };
}

export function readEpisodeForEdit(id: number, token?: string): Promise<EditableEpisode | null> {
  return withRestFallback(
    "episode",
    () => getEpisodeForEditFast(id, token),
    () => getEpisodeForEdit(id),
  );
}

/** Episode edit write set. `slug` and `status` are deliberately NOT written:
 *  the episode is published and its public URL is derived from the slug, so
 *  renumbering an episode must not silently break existing links. */
export interface EpisodeWrite {
  label: string;
  title: string;
  /** post_excerpt — see EpisodeCreateWrite.description. */
  description: string;
  videoUrl: string;
  releaseTs: number;
  runTime: string;
  thumbId: number;
}

export async function updateEpisode(id: number, w: EpisodeWrite): Promise<{ id: number }> {
  const { data } = await adminFetch<{ id: number }>(`/wp/v2/episode/${id}`, {
    method: "POST",
    body: {
      title: w.title,
      excerpt: w.description,
      featured_media: w.thumbId,
      meta: {
        _episode_number: w.label,
        _episode_choice: "episode_url",
        _episode_url_link: w.videoUrl,
        _episode_release_date: w.releaseTs,
        _episode_run_time: w.runTime,
      },
    },
    timeoutMs: CREATE_TIMEOUT, // saving a PUBLISHED post runs the slow hooks
  });
  return { id: data.id };
}

/* --- read-only episodes (the plugin's web/tv-show-episodes endpoint) --- */

interface RawEpisodeRow {
  id: number;
  title: string;
  episode_number?: string;
  run_time?: string;
  release_date?: number;
  post_thumbnail?: string;
  permalink?: string;
}
interface EpisodesEnvelope {
  status: string;
  data?: RawEpisodeRow[];
  total?: number;
  total_page?: number;
}

export interface AdminEpisode {
  id: number;
  title: string;
  /** Raw CMS label, e.g. "S2:E14"; "" when unset. */
  label: string;
  /** Parsed from the label; 0 when unparseable. */
  season: number;
  episode: number;
  runTime: string;
  /** "13.04.2022" in Phnom Penh time, or "". */
  releaseDate: string;
  thumbnail: string;
  permalink: string;
}

const PAGE_SIZE = 200;
const MAX_PAGES = 10; // runaway guard; daily-feed (617 eps) is the largest show

const PP_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Phnom_Penh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function mapEpisodeRow(e: RawEpisodeRow): AdminEpisode {
  const label = (e.episode_number ?? "").trim();
  const { season, episode } = parseEpisodeLabel(label);
  return {
    id: e.id,
    title: decodeEntities(e.title ?? "").trim() || `#${e.id}`,
    label,
    season,
    episode,
    runTime: (e.run_time ?? "").trim(),
    releaseDate: e.release_date ? PP_DATE.format(new Date(e.release_date * 1000)).replace(/\//g, ".") : "",
    thumbnail: e.post_thumbnail || "",
    permalink: e.permalink || "",
  };
}

/** Every episode of a show, newest first (season desc, then episode desc, then
 *  id desc — the endpoint's own order is post date, which lies). */
export async function listShowEpisodes(showId: number): Promise<AdminEpisode[]> {
  const page = (n: number) =>
    adminFetch<EpisodesEnvelope>(`/wp/v2/web/tv-show-episodes`, {
      query: { tv_show: showId, page_no: n, page_size: PAGE_SIZE },
    });

  const first = (await page(1)).data;
  const pages = Math.min(first.total_page || 1, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 2)),
  );

  const rows = [first, ...rest.map((r) => r.data)].flatMap((env) => env.data ?? []).map(mapEpisodeRow);
  return sortEpisodes(rows);
}

/** Newest first: season desc, episode desc, id desc. Shared by both paths —
 *  neither endpoint's own order is the one the admin wants. */
function sortEpisodes(rows: AdminEpisode[]): AdminEpisode[] {
  return rows.sort((a, b) => b.season - a.season || b.episode - a.episode || b.id - a.id);
}

/** A row as fast.php's ?r=episodes emits it (release date still a timestamp —
 *  the display formatting is shared below). */
interface FastEpisodeRow {
  id: number;
  title: string;
  label: string;
  runTime: string;
  releaseTs: number;
  thumbnail: string;
  permalink: string;
}

/**
 * Every episode of a show in ONE request. The REST path walks
 * web/tv-show-episodes 200 rows at a time — for the biggest show
 * (daily-feed, 617 episodes) that is four ~4s calls, and up to ten.
 *
 * Dates go through the SAME PP_DATE formatter as the REST path, so a
 * difference between paths is a data difference, not a formatting one.
 */
export async function listShowEpisodesFast(showId: number, token?: string): Promise<AdminEpisode[]> {
  const body = await fastFetch<{ items: FastEpisodeRow[]; total: number }>("episodes", { show: showId }, { token });

  const rows = (body.data.items ?? []).map((e): AdminEpisode => {
    const label = (e.label ?? "").trim();
    const { season, episode } = parseEpisodeLabel(label);
    return {
      id: e.id,
      title: decodeEntities(e.title ?? "").trim() || `#${e.id}`,
      label,
      season,
      episode,
      runTime: (e.runTime ?? "").trim(),
      releaseDate: e.releaseTs ? PP_DATE.format(new Date(e.releaseTs * 1000)).replace(/\//g, ".") : "",
      thumbnail: e.thumbnail || "",
      permalink: e.permalink || "",
    };
  });
  return sortEpisodes(rows);
}

export function readShowEpisodes(showId: number, token?: string): Promise<AdminEpisode[]> {
  return withRestFallback(
    "episodes",
    () => listShowEpisodesFast(showId, token),
    () => listShowEpisodes(showId),
  );
}
