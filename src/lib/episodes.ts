// TV-show episodes, shared by the homepage grids, the program pages, and the
// episode pages.
//
// Every AMS program is a MasVideos `movie` post that carries a separate
// `tv_show` id — the two numbers differ, and only the tv_show id addresses the
// episode list. See src/lib/programs.ts for the id table.
//
// Episode identity is OURS, not WordPress's, for the same reason program slugs
// are (see the header of programs.ts). The live permalinks cannot be route keys:
// obsok's S2:E2 permalinks onto the program page itself and its S2:E1 onto
// /tv-show/obsok/, all 617 daily-feed episodes live at the site root rather than
// under their program, cicada-agent's episodes sit under /program/tamchetmomo/,
// and fact-check ships an /episode/testing/ row numbered "S01I100". So the route
// segment is derived from `episode_number`, here and nowhere else.
//
// `mapEpisode` lives in this file rather than in api/mappers.ts because it is
// not a field rename: the slug it produces depends on the whole episode list.

import { apiFetch } from "./api/client";
import { decodeEntities } from "./api/mappers";
import { toVideo, type Video } from "./api/video";
import type { HomeCard } from "./home-data";
import type { WpEpisode, WpListEnvelope } from "./api/wp-types";

export const episodeHref = (programSlug: string, episodeSlug: string) =>
  `/program/${programSlug}/${episodeSlug}`;

/** One request per this many episodes. Daily-feed, the largest show, has 617. */
const PAGE_SIZE = 200;
/** Runaway guard: 2,000 episodes. Nothing is close. */
const MAX_PAGES = 10;

export interface Episode {
  id: number;
  /** Our route segment, unique within a show: /program/<program>/<slug>. */
  slug: string;
  title: string;
  /** WordPress's raw label, e.g. "S1:E59". "" when the CMS has none. */
  episodeNumber: string;
  /** Index into the show's seasons. Unreliable — see WpEpisode.season_id. */
  seasonId: number;
  /** "" for the episodes with no featured image; CoverImage renders its empty state. */
  thumbnail: string;
  /** Hand-typed, e.g. "02:01 នាទី" — wrong on roughly half the episodes, but it
   *  is what the live rows print. "" until the plugin (≥1.5.0) sends it. */
  runTime: string;
  /** "13.04.2022", already in Phnom Penh time. "" until the plugin sends it. */
  releaseDate: string;
}

const PHNOM_PENH_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Phnom_Penh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** 1649782800 -> "13.04.2022".
 *
 *  The timestamp is midnight in Phnom Penh; Vodi formats it in UTC and so prints
 *  12.04.2022, a day early, on every episode page on the live site. We show the
 *  date the editor actually entered, which is also WordPress's own post date. */
export function formatReleaseDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return PHNOM_PENH_DATE.format(new Date(unixSeconds * 1000)).replace(/\//g, ".");
}

const KHMER_DIGITS = ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"];

/** 12 -> "១២". */
const toKhmerDigits = (n: number) => String(n).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);

/** The season an episode's LABEL claims: "S2:E26" -> 2. 0 when unlabelled.
 *
 *  The label, not `seasonId`: the meta field is an index editors have left wrong
 *  on plenty of episodes, while the label is what every listing on the site
 *  prints — grouping by anything else would contradict the text on the cards. */
export const seasonOf = (ep: Episode) => numberTuple(ep.episodeNumber)[0] ?? 0;

export interface Season {
  /** The season number as labelled, 0 for unlabelled episodes. */
  number: number;
  /** "រដូវកាល ១", or "គ្មានលេខរដូវកាល" for the unlabelled group — never
   *  "វគ្គទាំងអស់" ("all seasons"), which is the wrong word for this group and
   *  not a convention this site uses. */
  name: string;
  /** Ascending, same order fetchShowEpisodes returns. */
  episodes: Episode[];
}

/** A show's episodes grouped into seasons, newest season first — what fixed the
 *  grid that read "រដូវកាលទី ៣" above all three of the-fact's seasons. A
 *  single-season show comes back as one group. */
export function groupSeasons(episodes: Episode[]): Season[] {
  const byNumber = new Map<number, Episode[]>();
  for (const ep of episodes) {
    const n = seasonOf(ep);
    const group = byNumber.get(n);
    if (group) group.push(ep);
    else byNumber.set(n, [ep]);
  }
  return [...byNumber.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([number, eps]) => ({
      number,
      name: number > 0 ? `រដូវកាល ${toKhmerDigits(number)}` : "គ្មានលេខរដូវកាល",
      episodes: eps,
    }));
}

/** Every number in a label, in order: "S2:26:E555" -> [2, 26, 555]. */
function numberTuple(label: string): number[] {
  return (label.match(/\d+/g) ?? []).map(Number);
}

/** "S1:E59" -> "s1e59"; "S1E31" -> "s1e31"; "S2:26:E555" -> "s2-26-e555".
 *
 *  The plain season/episode pair is collapsed so the URLs we serve match the
 *  ones WordPress serves today for the 15 programs whose permalinks are sane.
 *  Any other shape keeps its groups hyphen-separated rather than guessing. */
function slugFromLabel(label: string): string {
  const tokens = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 2 && /^s\d+$/.test(tokens[0]) && /^e\d+$/.test(tokens[1])) {
    return tokens.join("");
  }
  return tokens.join("-");
}

/** Ascending, by the label's numbers read left to right. Episodes with no label
 *  have no place in the sequence, so they sort last. `id` breaks the ties that
 *  daily-feed's seven duplicate labels would otherwise leave to `sort`'s whim. */
function compareEpisodes(a: Episode, b: Episode): number {
  const x = numberTuple(a.episodeNumber);
  const y = numberTuple(b.episodeNumber);

  if (x.length === 0 || y.length === 0) {
    if (x.length !== y.length) return x.length === 0 ? 1 : -1;
  }

  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? -1) - (y[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return a.id - b.id;
}

/** Slugs must be unique within a show, and stable as episodes are added.
 *
 *  An episode whose label yields no slug falls back to its post id — which puts
 *  label-derived and id-derived slugs in ONE namespace. They really can meet:
 *  daily-feed has an episode labelled simply "88", whose slug is the number 88.
 *  So uniqueness is enforced after the fallback, over the combined set, not
 *  before it over the labels alone.
 *
 *  Where two episodes end up sharing a slug, EVERY member of the colliding group
 *  takes an id suffix — never just the later one — so publishing a duplicate
 *  can't silently re-point the URL of an episode that already exists. */
function assignSlugs(rows: Episode[]): Episode[] {
  const withFallback = rows.map(row => (row.slug ? row : { ...row, slug: String(row.id) }));

  const counts = new Map<string, number>();
  for (const row of withFallback) counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);

  return withFallback.map(row =>
    (counts.get(row.slug) ?? 0) > 1 ? { ...row, slug: `${row.slug}-${row.id}` } : row,
  );
}

function mapEpisode(e: WpEpisode): Episode {
  return {
    id: e.id,
    slug: slugFromLabel(e.episode_number ?? ""),
    title: e.title,
    episodeNumber: e.episode_number ?? "",
    seasonId: e.season_id ?? 0,
    thumbnail: e.post_thumbnail || "",
    // Sent by the plugin from 1.5.0 on; "" from an older plugin, and the rows
    // simply omit their runtime/Added line until the update is deployed.
    runTime: (e.run_time ?? "").trim(),
    releaseDate: formatReleaseDate(e.release_date ?? 0),
  };
}

function fetchPage(tvShowId: number, page: number) {
  return apiFetch<WpListEnvelope<WpEpisode>>(
    `/wp/v2/web/tv-show-episodes?tv_show=${tvShowId}&page_no=${page}&page_size=${PAGE_SIZE}`,
    { revalidate: false, tags: ["episodes", "program", `tv-show:${tvShowId}`] },
  );
}

/** Every episode of a show, ascending.
 *
 *  The episode page reuses this one list for both its season grid and its
 *  prev/next links, so neither costs an extra round trip. The upstream endpoint
 *  orders by post date, which is NOT episode order — 1-minute-for-health comes
 *  back E59, E64, E58 — so the sort here is load-bearing, not cosmetic.
 *
 *  THROWS. This list is an existence check as well as content: getEpisodePage
 *  looks its slug up here and calls `notFound()` on a miss, so an empty answer
 *  404s every episode of the show at once — and /program/<slug>/episodes IS this
 *  list, so an empty one is a page claiming a 617-episode show has none. Cases 2
 *  and 3 of the error-handling note in api/client.ts. The CARD helpers below
 *  degrade instead, because a rail is decoration. */
export async function fetchShowEpisodes(tvShowId: number): Promise<Episode[]> {
  const first = await fetchPage(tvShowId, 1);
  const pages = Math.min(first.total_page || 1, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchPage(tvShowId, i + 2)),
  );

  const rows = [first, ...rest].flatMap(env => env.data ?? []).map(mapEpisode);
  return assignSlugs(rows).sort(compareEpisodes);
}

function toCard(ep: Episode, programSlug: string): HomeCard {
  return {
    slug: `episode-${ep.id}`,
    href: episodeHref(programSlug, ep.slug),
    src: ep.thumbnail,
    title: ep.title,
    ep: ep.episodeNumber,
  };
}

/** One season's worth of episode cards for the program overview's season browser
 *  (the tab strip below វគ្គថ្មីៗ). */
export interface SeasonCards {
  /** The season number as labelled, 0 for the unlabelled group. */
  number: number;
  /** "រដូវកាល ១", or "គ្មានលេខរដូវកាល" for the unlabelled group — the tab label. */
  name: string;
  /** Ascending (E1 first), capped at SEASON_CARD_CAP. */
  cards: HomeCard[];
  /** The season's full episode count, before the cap — drives the "see all" link. */
  total: number;
}

/** A season carousel is a scroll track, not the whole episodes page: cap it so a
 *  617-episode show doesn't ship every card into one strip. Past the cap the
 *  section links out to /program/<slug>/episodes, same as SeasonGrid. */
const SEASON_CARD_CAP = 30;

/** A show's episodes grouped into per-season card lists for the overview browser.
 *
 *  Tabs read oldest→newest (រដូវកាល ១, ២, …) with the unlabelled group
 *  last; groupSeasons returns them newest-first, so the order is flipped here.
 *  Within a season the cards keep the show's own ascending order. */
export function toSeasonCards(episodes: Episode[], programSlug: string): SeasonCards[] {
  return groupSeasons(episodes)
    .map((s) => ({
      number: s.number,
      name: s.name,
      total: s.episodes.length,
      cards: s.episodes.slice(0, SEASON_CARD_CAP).map((ep) => toCard(ep, programSlug)),
    }))
    .sort((a, b) => (a.number === 0 ? 1 : b.number === 0 ? -1 : a.number - b.number));
}

/** The show's seasons as card lists, for the program overview. Reuses the same
 *  cached episode fetch as fetchEpisodeCards, so it costs no extra round trip.
 *
 *  Returns [] on error: the season browser is one section of the overview, and
 *  the section only renders for 2+ seasons anyway, so an empty list is already a
 *  state it handles. */
export async function fetchSeasonCards(programSlug: string, tvShowId: number): Promise<SeasonCards[]> {
  const episodes = await fetchShowEpisodes(tvShowId).catch(() => []);
  return toSeasonCards(episodes, programSlug);
}

/** Which end of the show a card list is taken from, and therefore its order.
 *
 *  "newest" (E-last first) is what a what's-new strip wants and what every grid
 *  but one uses. "oldest" (E1 first) is for a shelf presenting the show as a
 *  series to start watching — the homepage health grid. */
export type EpisodeCardOrder = "newest" | "oldest";

/** A show's episodes as cards, for the homepage grids, the program page's
 *  carousel and the landing pages' rails. Omit `size` for every episode the show
 *  has — which is what the landing rails want (live runs all 44 of ចង់ដឹងរឿងគេ).
 *
 *  `order` picks WHICH episodes as well as their order: "newest" takes the last
 *  `size` and shows them newest first, "oldest" takes the first `size` from E1.
 *  Note the upstream endpoint can't do either — it orders by post date, which is
 *  not episode order, and registers no `order` param. The ordering that matters
 *  is `compareEpisodes` above, over the whole show.
 *
 *  This goes through `fetchShowEpisodes` rather than asking the API for `size`
 *  rows, because a card's href has to be the slug the route will actually
 *  resolve — and `assignSlugs` can only spot a collision by seeing the whole
 *  show. Fetching a page of 18 in isolation would emit `s2-25-e79` for a
 *  daily-feed episode the router knows as `s2-25-e79-84312`, and every one of
 *  those links would 404. So capping here costs nothing: the whole list is
 *  already in hand.
 *
 *  Returns [] on error so a failing grid degrades to nothing rather than taking
 *  the page down — every caller is a rail or a shelf beside other content, never
 *  the reason a page exists. */
export async function fetchEpisodeCards(
  programSlug: string,
  tvShowId: number,
  size?: number,
  order: EpisodeCardOrder = "newest",
): Promise<HomeCard[]> {
  const episodes = await fetchShowEpisodes(tvShowId).catch(() => []);

  // fetchShowEpisodes is ascending, so "oldest" is already the right order.
  if (order === "oldest") {
    const first = size === undefined ? episodes : episodes.slice(0, size);
    return first.map(ep => toCard(ep, programSlug));
  }

  const newest = size === undefined ? episodes : episodes.slice(-size);
  return [...newest].reverse().map(ep => toCard(ep, programSlug));
}

/** One card in fetchEpisodeRail's result — see that function for why this
 *  exists alongside Episode/HomeCard rather than reusing them. */
export interface RailEpisode {
  id: number;
  /** The LIVE WordPress episode page — see fetchEpisodeRail for why this
   *  isn't one of our own /program/<slug>/<episode> routes. */
  href: string;
  thumbnail: string;
  title: string;
  /** "S2:E20", parsed from the WP permalink's own slug segment. "" if the
   *  permalink doesn't have one (daily-feed-style shows). */
  label: string;
  /** Runtime and Added date as printed by the legacy watch-page rail. */
  meta: string;
}

/** Adapt one legacy-rail row to the structured card shape used by SeasonGrid.
 * The legacy endpoint combines runtime and Added date into one text field, so
 * split it at the same marker its WordPress template prints. */
export function episodeFromRail(item: RailEpisode): Episode {
  const slug = item.href.split("/").filter(Boolean).at(-1) ?? String(item.id);
  const added = item.meta.match(/(?:^|\s)Added:\s*(.+)$/i);
  const runTime = item.meta.replace(/\s*Added:\s*.+$/i, "").trim();
  return {
    id: item.id,
    slug,
    title: item.title,
    episodeNumber: item.label,
    seasonId: Number(item.label.match(/^S(\d+)/i)?.[1] ?? 0),
    thumbnail: item.thumbnail,
    runTime,
    releaseDate: added?.[1]?.trim() ?? "",
  };
}

interface WpEpisodeRail {
  episode_list_html?: string;
  season_dropdown_html?: string;
  query?: { season?: number };
}

// One <li class="episode-item..."> block from the plugin's fragment — see the
// sample captured in AUDIT.md. `[\s\S]*?` because the title/meta sit a few
// lines below the <img>, not on the same line.
const RAIL_ITEM_RE =
  /<a href="([^"]+)" data-ep="(\d+)" data-season="(\d+)"[^>]*>[\s\S]*?<img class="episode-thumb" src="([^"]*)"[\s\S]*?<p class="episode-title">([^<]*)<\/p>[\s\S]*?<p class="episode-meta">([^<]*)<\/p>/g;

// The fragment's <img> is the smallest WordPress size crop (100x177) — fine
// for the site's own admin list, blurry upscaled to our 224px poster cards.
// The live homepage's own carousel uses the ORIGINAL (its <img> has no size
// suffix, e.g. "..._EWEP.jpg" not "..._EWEP-100x177.jpg", confirmed
// 2026-08-12); WordPress always keeps that unsized original alongside every
// generated crop, so stripping the suffix recovers it losslessly.
const SIZE_SUFFIX_RE = /-\d+x\d+(?=\.\w+$)/;

function parseEpisodeRailHtml(html: string): RailEpisode[] {
  return [...html.matchAll(RAIL_ITEM_RE)].map(([, href, epId, seasonIndex, thumb, title, meta]) => ({
    id: Number(epId),
    href,
    thumbnail: thumb.replace(SIZE_SUFFIX_RE, ""),
    title: decodeEntities(title).trim(),
    label: (() => {
      // The trailing "s<n>e<m>" can be the WHOLE last segment ("/s4e26/", the
      // older shows) or prefixed with the program's own slug ("/khmer-insider-
      // s5e1/", confirmed on a freshly-created episode 2026-08-26) — WordPress
      // doesn't keep one convention, so this matches the pair wherever it sits
      // at the end of the segment rather than requiring the whole segment.
      const permalink = href.match(/\/[^/]*?(s\d+e\d+)\/?$/i)?.[1];
      if (permalink) return permalink.toUpperCase().replace(/^S(\d+)E(\d+)$/, "S$1:E$2");

      // Some watch pages keep every row on the same program URL and switch
      // videos by data-ep. Their artwork still carries the canonical pair,
      // e.g. ORESS01_EP20_EWEP.jpg.
      const artwork = thumb.match(/S(\d+)[_-]?EP(\d+)/i);
      if (!artwork) return "";

      const artworkSeason = Number(artwork[1]);
      const episodeNumber = Number(artwork[2]);
      const bucketSeason = Number(seasonIndex) + 1;

      // The CMS bucket can overlap an adjacent labelled season (Khmer
      // Insider's index 2 contains S3 and part of S4), so a one-season
      // difference is legitimate and the artwork label remains preferable.
      // A larger disagreement is a corrupt filename: Financial Literacy's
      // S2:E20 image is named FINLS20_EP20, while data-season="1" and the
      // episode record both correctly identify season 2.
      const season = Math.abs(artworkSeason - bucketSeason) > 1 ? bucketSeason : artworkSeason;
      return `S${season}:E${episodeNumber}`;
    })(),
    // PHP templates indent the text around `Added:` with tabs/newlines. Collapse
    // that formatting whitespace so the React row receives one clean sentence.
    meta: decodeEntities(meta).replace(/\s+/g, " ").trim(),
  }));
}

/** Newest-first by label, e.g. "S4:E26" before "S4:E1" before "S3:E26" —
 *  descending numberTuple, the mirror of compareEpisodes' ascending one. */
function compareRailEpisodesDesc(a: RailEpisode, b: RailEpisode): number {
  const x = numberTuple(a.label);
  const y = numberTuple(b.label);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (y[i] ?? -1) - (x[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return b.id - a.id;
}

/** The season INDEXES a show has, newest first — parsed from the same
 *  fragment's `season_dropdown_html`, e.g. `data-season="3"` for Khmer
 *  Insider's newest bucket. Not the same numbers as the "S4"/"S3" labels
 *  printed on cards: the CMS's index buckets and the production's season
 *  labels are assigned independently (index 2 holds BOTH the tail of S4 and
 *  all of S3, confirmed 2026-08-12) — so index order is what reproduces the
 *  live carousel's actual sequence, not label order. */
function parseSeasonIndexes(dropdownHtml: string): number[] {
  return [...dropdownHtml.matchAll(/data-season="(\d+)"/g)].map(m => Number(m[1])).sort((a, b) => b - a);
}

function fetchSeasonFragment(showId: number, season?: number) {
  const q = season === undefined ? "" : `&season=${season}`;
  return apiFetch<WpEpisodeRail>(`/wp/v2/khmer-insider-episode?show_id=${showId}${q}`, {
    revalidate: false,
    tags: ["episodes", "program", `tv-show:${showId}`],
  });
}

/** The current Economy deployment has no khmer-insider-episode route, but the
 * canonical tv_show page server-renders the same episode-list markup. Resolve
 * its custom permalink through core REST rather than guessing it. */
interface ShowPageRail {
  episodes: RailEpisode[];
  seasonLinks: string[];
  activeSeasonLink: string;
}

function parseSeasonPageLinks(html: string, pageHref: string): { links: string[]; activeLink: string } {
  const dropdown = html.match(/<ul class="season-dropdown"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "";
  const pageOrigin = new URL(pageHref).origin;
  const links: string[] = [];

  for (const match of dropdown.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-season="\d+"[^>]*>/gi)) {
    try {
      const href = new URL(decodeEntities(match[1]), pageHref);
      if (href.origin === pageOrigin && !links.includes(href.href)) links.push(href.href);
    } catch {
      // Ignore malformed CMS links; the already-rendered list is still usable.
    }
  }

  const activeItem = dropdown.match(/<li\b[^>]*class="[^"]*\bactive\b[^"]*"[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"/i);
  let activeLink = "";
  if (activeItem) {
    try {
      const href = new URL(decodeEntities(activeItem[1]), pageHref);
      if (href.origin === pageOrigin) activeLink = href.href;
    } catch {
      // A malformed active link simply means its season page may be fetched again.
    }
  }

  return { links, activeLink };
}

async function fetchShowPage(href: string, showId: number): Promise<ShowPageRail> {
  const page = await fetch(href, {
    next: { revalidate: false, tags: ["episodes", "program", `tv-show:${showId}`] },
  });
  if (!page.ok) return { episodes: [], seasonLinks: [], activeSeasonLink: "" };

  const html = await page.text();
  const seasons = parseSeasonPageLinks(html, href);
  return {
    episodes: parseEpisodeRailHtml(html),
    seasonLinks: seasons.links,
    activeSeasonLink: seasons.activeLink,
  };
}

async function fetchShowPageRail(showId: number): Promise<RailEpisode[]> {
  const show = await apiFetch<{ link?: string }>(`/wp/v2/tv_show/${showId}?_fields=link`, {
    revalidate: false,
    tags: ["episodes", "program", `tv-show:${showId}`],
  });
  if (!show.link) return [];

  // WordPress renders only the active season's rows into a show page. Its
  // dropdown links to one representative episode per season, so collect those
  // pages as well. The active link represents the rows already present on the
  // canonical page and can be skipped. Some CMS season buckets overlap label
  // boundaries, hence the final id-based de-duplication and label sort.
  const first = await fetchShowPage(show.link, showId);
  const remainingLinks = first.seasonLinks.filter(href => href !== first.activeSeasonLink);
  const remaining = await Promise.all(
    remainingLinks.map(href => fetchShowPage(href, showId).catch(() => null)),
  );
  const all = [first, ...remaining.filter((page): page is ShowPageRail => page !== null)]
    .flatMap(page => page.episodes);
  const unique = [...new Map(all.map(episode => [episode.id, episode])).values()];
  return unique.sort(compareRailEpisodesDesc);
}

/** A show's episode history as a decorative rail, newest first. The canonical
 *  tv_show page is authoritative on the current Economy deployment and embeds
 *  the rows in its server HTML. Older deployments used the plugin fragment:
 *  `GET /wp/v2/khmer-insider-episode?show_id=<id>[&season=<idx>]`; that remains
 *  the compatibility fallback below.
 *
 *  This is a SEPARATE endpoint from fetchShowEpisodes' `tv-show-episodes`
 *  list, which answers a styled 404 on this backend (see AUDIT.md's
 *  corrections section). Both working rail sources hand back HTML rather than
 *  structured JSON, hence the regex parse instead of `env.data`.
 *
 *  One call with no `season` param returns only ONE bucket (the newest), not
 *  the whole show — a first version of this function stopped there and came
 *  up short of the live homepage's own Khmer Insider carousel, which showed
 *  all 4 seasons/99 episodes in one scroll. So this fetches every bucket (the
 *  first call also discovers how many there are, from its own
 *  `season_dropdown_html`) — but the buckets themselves do NOT split along
 *  season-label boundaries (checked 2026-08-12: Khmer Insider's index-2
 *  bucket holds both S4's back half, E18-26, AND all of S3), so
 *  concatenating bucket-by-bucket interleaves episodes out of order. Sorting
 *  the combined pool by each card's own "S<n>:E<m>" label afterward (same
 *  numberTuple ordering fetchShowEpisodes uses) is what actually produces a
 *  clean newest-first sequence — not a replay of live's own raw post-date
 *  order, which has its own well-documented quirks (see this file's header),
 *  but a strictly cleaner one for the same 99-episode pool.
 *
 *  Cards link to the LIVE WordPress episode page rather than one of our own
 *  /program/<slug>/<episode> routes: that route's existence check goes
 *  through fetchShowEpisodes, so a constructed internal href would 404 every
 *  one of these episodes rather than open them.
 *
 *  Returns [] on any failure — this is a homepage shelf beside a dozen
 *  others, never the reason the page exists. */
export async function fetchEpisodeRail(showId: number): Promise<{ episodes: RailEpisode[] }> {
  // Prefer the canonical show page: it is deployed everywhere this app reads,
  // while the fragment route is currently absent on Economy. Keeping the
  // fragment as a fallback preserves compatibility with older deployments.
  try {
    const episodes = await fetchShowPageRail(showId);
    if (episodes.length) return { episodes };
  } catch {
    // Fall through to the legacy fragment endpoint below.
  }

  try {
    const first = await fetchSeasonFragment(showId);
    const indexes = parseSeasonIndexes(first.season_dropdown_html ?? "");
    const defaultIndex = first.query?.season;
    const rest = await Promise.all(
      indexes.filter(i => i !== defaultIndex).map(i => fetchSeasonFragment(showId, i).catch(() => null)),
    );
    const fragments = [first, ...rest].filter((f): f is WpEpisodeRail => f !== null);
    const episodes = fragments.flatMap(f => parseEpisodeRailHtml(f.episode_list_html ?? ""));
    return { episodes: episodes.sort(compareRailEpisodesDesc) };
  } catch {
    return { episodes: [] };
  }
}

/** Resolve the real 16:9 Vimeo poster behind a legacy episode page.
 *
 * The fragment rail only exposes WordPress's portrait editorial thumbnail
 * (340×600 for Khmer Insider), which is correct for the sidebar but badly
 * cropped when stretched across the video stage. The public episode page still
 * contains its Vimeo player id, and Vimeo oEmbed returns the video's own poster.
 */
export interface LegacyEpisodeMedia {
  video: Video | null;
  cover: string;
}

/** Resolve both the playable Vimeo source and its wide poster from a legacy
 * episode page. This is the fallback when the structured episode-detail route
 * is absent on a WordPress deployment: the live page still embeds the real
 * Vimeo player, so a missing API must not turn a playable episode into a fake
 * poster control. */
export async function fetchLegacyEpisodeMedia(episodeHref: string, episodeId?: number): Promise<LegacyEpisodeMedia> {
  if (episodeId) {
    try {
      const detail = await apiFetch<{ id?: number | null; image_url?: string; vimeo_id?: string }>(
        `/wp/v2/post-details-episode?id=${episodeId}`,
        { revalidate: false, tags: ["episodes", `episode:${episodeId}`] },
      );
      if (detail.id && detail.vimeo_id) {
        return {
          video: toVideo({
            choice: "episode_url",
            url: `https://vimeo.com/${detail.vimeo_id}`,
            attachment: "",
            embed: "",
          }),
          cover: detail.image_url ?? "",
        };
      }
    } catch {
      // Older deployments lack this route; keep the page parser as fallback.
    }
  }

  try {
    // This helper also reads movie pages when a program embeds its Vimeo player
    // directly. Either kind of WordPress save must invalidate the cached media.
    const mediaTags = ["episodes", "program"];
    const page = await fetch(episodeHref, { next: { revalidate: false, tags: mediaTags } });
    if (!page.ok) return { video: null, cover: "" };

    const html = await page.text();
    // The id appears both as a normal URL and JSON-escaped with `\/`.
    const videoId = html.match(/player\.vimeo\.com(?:\\\/|\/)video(?:\\\/|\/)(\d+)/)?.[1];
    if (!videoId) return { video: null, cover: "" };

    const video = toVideo({
      choice: "episode_url",
      url: `https://vimeo.com/${videoId}`,
      attachment: "",
      embed: "",
    });

    const oembed = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}&width=1280`,
      { next: { revalidate: false, tags: mediaTags } },
    );
    if (!oembed.ok) return { video, cover: "" };

    const data = (await oembed.json()) as { thumbnail_url?: string };
    return { video, cover: data.thumbnail_url ?? "" };
  } catch {
    return { video: null, cover: "" };
  }
}
