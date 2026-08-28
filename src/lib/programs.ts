// AMS programs — the pages behind the header's colored nav pills, the
// មាតិកាឌីជីថល icon strip, and every /program/<slug> route.
//
// The registry is DYNAMIC (since 2026-07-31): every published MasVideos
// `movie` and `tv_show` post gets a program page, fetched from core REST at
// build/request time and ISR-cached — so a program created in the dashboard
// (or wp-admin) routes without a code change. The hand-verified table that
// used to live here became src/lib/program-curation.ts; it still pins the
// existing programs' slugs/showIds (public URLs must not change) and is the
// fallback when WordPress is unreachable.
//
// ⚠ VERIFY BEFORE DEPLOY: this relies on two anonymous core-REST behaviours —
// GET wp/v2/movie|tv_show listing published posts, and the registered
// `_khi_tv_show_id` meta being visible without auth (register_post_meta
// show_in_rest exposes reads to anyone; auth_callback gates only writes). If
// meta comes back hidden, curated programs still work fully (their showIds are
// pinned) but a NEW program's episode rail would be empty — that's the signal
// the plugin needs a tweak.

import { cache } from "react";
import { notFound } from "next/navigation";
import { apiFetch } from "./api/client";
import { fastPublicFetch, withPublicRestFallback } from "./api/fast-public";
import { decodeEntities, htmlToParagraphs, mapProgram } from "./api/mappers";
import { getNavPills } from "./navigation";
import { CURATED_PROGRAMS, type ProgramPostType } from "./program-curation";
import { fetchEpisodeCards, fetchSeasonCards, type SeasonCards } from "./episodes";
import type { HomeCard } from "./home-data";
import type { WpObjectEnvelope, WpProgram } from "./api/wp-types";

export type { ProgramPostType } from "./program-curation";

export interface ProgramRef {
  /** Our route slug: /program/<slug>. Curated for the original programs, the
   *  WordPress post slug for everything newer. */
  slug: string;
  /** Program title (decoded). Doubles as the API-failure fallback. */
  title: string;
  postType: ProgramPostType;
  /** Addresses the program's own post (title, description, poster). */
  postId: number;
  /** Addresses its episode list. Different number from postId for movies;
   *  0 when the movie has no linked tv_show (page renders without a rail). */
  showId: number;
  /** Portrait featured image (the poster surfaces want 2:3 art). "" when the
   *  post has none, or what it has is landscape. */
  poster: string;
  /** Release year, e.g. "2023". "" when unset. */
  year: string;
}

/* ── the dynamic registry ────────────────────────────────────────────────── */

interface RawProgramRow {
  id: number;
  slug?: string;
  title?: { rendered?: string };
  meta?: Record<string, unknown>;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: {
        width?: number;
        height?: number;
        sizes?: Record<string, { source_url?: string; width?: number; height?: number }>;
      };
    }[];
  };
}

const PER_PAGE = 100;
const MAX_PAGES = 5; // 43 programs today; runaway guard, not a real limit

/** One post type's published posts, newest first. Pages until a short page. */
async function fetchType(type: ProgramPostType): Promise<RawProgramRow[]> {
  const rows: RawProgramRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await apiFetch<RawProgramRow[]>(
      `/wp/v2/${type}?per_page=${PER_PAGE}&page=${page}&_fields=id,slug,title,meta,_links,_embedded&_embed=wp:featuredmedia`,
      // Tagged "program" so the plugin's publish webhook (≥1.7.3, which sends
      // that tag for movie/tv_show saves) refreshes routing on publish, plus a
      // registry-specific tag the admin's create action busts directly.
      { revalidate: false, tags: ["program", "program-registry"] },
    );
    rows.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return rows;
}

/** One pub-programs row: what the registry's mappers read, flattened. */
interface FastProgramRow {
  id: number;
  slug: string;
  /** RAW post_title — REST's title.rendered is entity-encoded, and toRef runs
   *  decodeEntities either way, so both paths land on the same string. */
  title: string;
  meta: Record<string, number>;
  media: {
    source_url: string;
    width: number;
    height: number;
    sizes: Record<string, { source_url: string; width: number; height: number }>;
  } | null;
}

/** A fast row in the core-REST row shape, so toRef/posterOf stay unchanged. */
function fromFastRow(row: FastProgramRow): RawProgramRow {
  return {
    id: row.id,
    slug: row.slug,
    title: { rendered: row.title },
    meta: row.meta,
    _embedded: row.media
      ? {
          "wp:featuredmedia": [
            {
              source_url: row.media.source_url,
              media_details: {
                width: row.media.width || undefined,
                height: row.media.height || undefined,
                sizes: row.media.sizes,
              },
            },
          ],
        }
      : undefined,
  };
}

/** Both post types' published rows: ONE fast call (pub-programs) replacing the
 *  two core-REST listings, which fall back exactly as before. */
function fetchProgramRows(): Promise<{ movies: RawProgramRow[]; shows: RawProgramRow[] }> {
  return withPublicRestFallback(
    "program-registry",
    async () => {
      const env = await fastPublicFetch<{ data: { movies: FastProgramRow[]; tv_shows: FastProgramRow[] } }>(
        "pub-programs",
        {},
        { revalidate: false, tags: ["program", "program-registry"] },
      );
      return {
        movies: (env.data?.movies ?? []).map(fromFastRow),
        shows: (env.data?.tv_shows ?? []).map(fromFastRow),
      };
    },
    async () => {
      const [movies, shows] = await Promise.all([fetchType("movie"), fetchType("tv_show")]);
      return { movies, shows };
    },
  );
}

function metaInt(meta: Record<string, unknown> | undefined, key: string): number {
  const v = Number(meta?.[key]);
  return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
}

/** Portrait art only — a landscape featured image is backdrop key art, which
 *  mapProgram likewise refuses to present as a poster. Prefers the ~300x450
 *  rendition the curated poster list uses (sharp at carousel size, and a
 *  fraction of the original's weight). */
function posterOf(row: RawProgramRow): string {
  const m = row._embedded?.["wp:featuredmedia"]?.[0];
  const det = m?.media_details;
  if (!det?.width || !det.height || det.height <= det.width) return "";
  for (const s of Object.values(det.sizes ?? {})) {
    if (s.width === 300 && s.height === 450 && s.source_url) return s.source_url;
  }
  return m?.source_url ?? "";
}

/** Khmer post slugs arrive percent-encoded from WordPress; decode so the route
 *  param is the real text (Next re-encodes it once in hrefs). */
function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

const PP_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Phnom_Penh", year: "numeric" });

function toRef(row: RawProgramRow, type: ProgramPostType): ProgramRef {
  const curated = CURATED_PROGRAMS.find((c) => c.postId === row.id);
  const releaseTs = metaInt(row.meta, type === "movie" ? "_movie_release_date" : "_tv_show_release_date");
  return {
    // Curated identity always wins: pinned slug, proven showId, stable type.
    slug: curated?.slug ?? decodeSlug(row.slug ?? String(row.id)),
    title: decodeEntities(row.title?.rendered ?? "").trim() || curated?.title || `#${row.id}`,
    postType: curated?.postType ?? type,
    postId: row.id,
    showId: curated?.showId ?? (type === "movie" ? metaInt(row.meta, "_khi_tv_show_id") : row.id),
    poster: posterOf(row),
    year: releaseTs ? PP_YEAR.format(new Date(releaseTs * 1000)) : "",
  };
}

const curatedFallback = (): ProgramRef[] =>
  CURATED_PROGRAMS.map((c) => ({ ...c, poster: "", year: "" }));

/**
 * Every routable program: all published movies + tv_shows, curated identities
 * pinned, first-seen slug wins on a collision. THROWS if WordPress is down —
 * getProgramRegistry below is the degrading view.
 *
 * React cache() dedupes the mapping work within a request, so the strict and
 * degrading readers share one build; the underlying fetches are ISR-cached
 * across requests either way.
 */
const buildProgramRegistry = cache(async (): Promise<ProgramRef[]> => {
  const { movies, shows } = await fetchProgramRows();
  const movieRefs = movies.map((r) => toRef(r, "movie"));

  // A tv_show that some movie points at via _khi_tv_show_id is that program's
  // EPISODE CONTAINER, not a program of its own — routing it would mint junk
  // duplicate pages (live had tv-show-daily-feed etc.). Only tv_shows nobody
  // references route as programs (vanna-yeatra, curated, is the one today).
  // Curated showIds are unioned in so this holds even if meta is hidden.
  const containers = new Set([
    ...movieRefs.map((r) => r.showId),
    ...CURATED_PROGRAMS.map((c) => c.showId),
  ]);
  const showRefs = shows
    .filter((r) => CURATED_PROGRAMS.some((c) => c.postId === r.id) || !containers.has(r.id))
    .map((r) => toRef(r, "tv_show"));

  // One page per SHOW: curated identities first, then first-seen wins on a
  // slug or showId collision — a stray duplicate movie post fronting an
  // already-routed show (WP has a few) is dropped rather than double-routed.
  const all = [...movieRefs, ...showRefs].sort(
    (a, b) =>
      Number(CURATED_PROGRAMS.some((c) => c.postId === b.postId)) -
      Number(CURATED_PROGRAMS.some((c) => c.postId === a.postId)),
  );
  const refs: ProgramRef[] = [];
  const seenSlug = new Set<string>();
  const seenShow = new Set<number>();
  for (const ref of all) {
    if (seenSlug.has(ref.slug) || (ref.showId > 0 && seenShow.has(ref.showId))) continue;
    seenSlug.add(ref.slug);
    if (ref.showId > 0) seenShow.add(ref.showId);
    refs.push(ref);
  }
  return refs.length ? refs : curatedFallback();
});

/** The registry, degraded to the curated table (old hardcoded behaviour, minus
 *  poster/year extras) if WordPress is down.
 *
 *  For LISTING programs — the nav's extras, generateStaticParams — where six
 *  known-good programs beat none. NOT for deciding whether a URL exists: the
 *  curated table holds 6 of ~19, so answering "no such program" from it would
 *  bake a 404 onto thirteen real pages. That is what routedProgram is for. */
export const getProgramRegistry = cache(async (): Promise<ProgramRef[]> => {
  return buildProgramRegistry().catch(() => curatedFallback());
});

export const programHref = (slug: string) => `/program/${slug}`;

export async function programBySlug(slug: string): Promise<ProgramRef | undefined> {
  return (await getProgramRegistry()).find((p) => p.slug === slug);
}

/** The program a /program/<slug> URL addresses, or undefined when there is no
 *  such program — for the four surfaces that turn undefined into `notFound()`
 *  (the overview, the episodes list, an episode, and getProgram itself).
 *
 *  Reads the UN-degraded registry, so a miss always means "not a program" and
 *  never "WordPress was down" (case 3 in the error-handling note in
 *  api/client.ts). programBySlug above stays forgiving for the surfaces that
 *  merely SHOW a program — the homepage's featured band, a landing feature —
 *  where a missing ref drops one block instead of 404ing a page. */
export async function routedProgram(slug: string): Promise<ProgramRef | undefined> {
  return (await buildProgramRegistry()).find((p) => p.slug === slug);
}

export async function programByPostId(postId: number): Promise<ProgramRef | undefined> {
  return (await getProgramRegistry()).find((p) => p.postId === postId);
}

export async function getProgramSlugs(): Promise<string[]> {
  return (await getProgramRegistry()).map((p) => p.slug);
}

/* ── a single program's page data ────────────────────────────────────────── */

export interface Program {
  slug: string;
  title: string;
  /** Description paragraphs. Empty for the programs WordPress has no excerpt for. */
  description: string[];
  /** Portrait poster art. "" if the post has no featured image — or if what it has
   *  is landscape key art, which mapProgram promotes to `backdrop` instead. */
  poster: string;
  /** Wide key art behind the hero (Vodi's `_vodi_<type>_bg_image`). "" if unset,
   *  in which case ProgramHero falls back to a blurred poster. */
  backdrop: string;
  /** Release year, e.g. "2023". "" when unset. */
  year: string;
  /** Broadcast slot, e.g. "រៀងរាល់ថ្ងៃអាទិត្យ វេលាម៉ោង ៨:៣០ នាទីព្រឹក". "" when unset
   *  (3 of 19). NOT a duration, despite living in MasVideos' `run_time` field. */
  schedule: string;
  episodes: HomeCard[];
  /** Episodes grouped by season, for the overview's season browser (one entry
   *  per season). The section only renders when there are 2+, so single-season
   *  and episode-less shows leave it out rather than repeating វគ្គថ្មីៗ. */
  seasons: SeasonCards[];
}

/** Title/description/poster/backdrop. Degrades to the registry's title so a
 *  program page still renders its hero and episodes if the request fails.
 *
 *  This goes through our own endpoint rather than `wp/v2/<type>/<id>` because the
 *  backdrop lives in Vodi post meta, which core REST will not expose at any price
 *  (it answers `meta: []`). As a bonus it drops the `_fields`/`_embed` dance that
 *  the core route needed to stay under ~768KB of Yoast metadata per movie. */
async function fetchProgramMeta(ref: ProgramRef) {
  try {
    const env = await apiFetch<WpObjectEnvelope<WpProgram>>(`/wp/v2/web/program?id=${ref.postId}`, {
      revalidate: false,
      tags: ["program", `program:${ref.slug}`],
    });
    return mapProgram(env.data, ref);
  } catch {
    return { slug: ref.slug, title: ref.title, description: [], poster: "", backdrop: "", year: "", schedule: "" };
  }
}

/** Full program by slug. 404s for slugs that aren't in the registry. */
export async function getProgram(slug: string): Promise<Program> {
  const ref = await routedProgram(slug);
  if (!ref) notFound();

  // fetchEpisodeCards and fetchSeasonCards share one cached episode fetch (same
  // tv_show id, deduped within the request), so the seasons cost no extra trip.
  // showId 0 = a new program with no linked tv_show yet — skip the rail.
  const [meta, episodes, seasons] = await Promise.all([
    fetchProgramMeta(ref),
    ref.showId ? fetchEpisodeCards(ref.slug, ref.showId, 18) : [],
    ref.showId ? fetchSeasonCards(ref.slug, ref.showId) : [],
  ]);
  return { ...meta, episodes, seasons };
}

/* ── "section-featured-movie" hero, pinned by post id (see FeaturedMovieHero) ── */

export interface FeaturedMovie {
  title: string;
  description: string[];
  poster: string;
  backdrop: string;
  year: string;
  /** The program's own page. */
  href: string;
  color: string;
  /** The show's newest episode — where WATCH NOW / ▶ actually go when set,
   *  same "no trailer, so play the newest episode instead" fallback getFeature
   *  uses in landing-data.ts. Unset when the post has no linked show. */
  watchHref?: string;
}

/** A movie/tv_show post's title + excerpt, straight off core REST rather than
 *  `/wp/v2/web/program` — confirmed 404ing for every id on this backend
 *  (2026-08-12; likely the plugin route isn't deployed here yet). Core REST's
 *  anonymous read of published movie/tv_show posts is what the registry itself
 *  already relies on (see the file header), so this costs nothing new. */
async function fetchPostSummary(postType: ProgramPostType, postId: number, tag: string) {
  const env = await apiFetch<{ title?: { rendered?: string }; excerpt?: { rendered?: string } }>(
    `/wp/v2/${postType}/${postId}?_fields=title,excerpt`,
    { revalidate: false, tags: ["program", tag] },
  );
  return {
    title: decodeEntities(env.title?.rendered ?? "").trim(),
    description: htmlToParagraphs(env.excerpt?.rendered ?? ""),
  };
}

/** A WordPress media attachment's own (full-size) URL — also core REST, also
 *  confirmed reachable where `/wp/v2/web/program` is not. */
async function fetchMediaUrl(mediaId: number): Promise<string> {
  const env = await apiFetch<{ source_url?: string }>(`/wp/v2/media/${mediaId}?_fields=source_url`, {
    revalidate: false,
    tags: ["media", `media:${mediaId}`],
  });
  return env.source_url ?? "";
}

/**
 * A "section-featured-movie" hero for an arbitrary pinned movie/tv_show post —
 * WordPress's own Vodi block's payload shape (`{"movie_id": 24747, "bg_image":
 * 79951}`, movie and art chosen independently — same pairing FEATURES in
 * landing-data.ts pins for the same reason: no endpoint returns it together).
 *
 * `postId` must already be in the program registry (it needs a route to link
 * to); `bgImageId`, when given, wins over the program's own poster. Decoration,
 * like getFeaturedProgram: null on any failure, including an unresolvable id.
 */
export async function getFeaturedMovie(postId: number, bgImageId?: number): Promise<FeaturedMovie | null> {
  try {
    const ref = await programByPostId(postId);
    if (!ref) return null;

    const [summary, bg, pills, episodes] = await Promise.all([
      fetchPostSummary(ref.postType, postId, `program:${ref.slug}`),
      bgImageId ? fetchMediaUrl(bgImageId) : Promise.resolve(""),
      getNavPills(),
      ref.showId ? fetchEpisodeCards(ref.slug, ref.showId, 1) : Promise.resolve([]),
    ]);

    return {
      title: summary.title || ref.title,
      description: summary.description,
      poster: ref.poster,
      backdrop: bg || ref.poster,
      year: ref.year,
      href: programHref(ref.slug),
      color: pills.find((p) => p.slug === ref.slug)?.background ?? "#1a5fd0",
      watchHref: episodes[0]?.href,
    };
  } catch {
    return null;
  }
}
