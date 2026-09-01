// WordPress CORE post queries (`/wp/v2/posts`), for the questions the custom
// `wp/v2/web/*` endpoints cannot answer:
//
//   - posts by AUTHOR (`?author=`) — the /author/<slug> archives
//
// Core returns a different shape from the web/* endpoints (rendered/escaped
// titles, thumbnails behind `_embedded`), so it gets its own mapper rather than
// leaking that shape into api/mappers.ts.
//
// The fast path (`?r=pub-articles&author=`) serves the same page, so this file
// holds TWO mappers into the one ArticleRef — see mapFastPost, which exists to
// be byte-identical to mapCorePost's output rather than convenient.

import { decodeEntities } from "./api/mappers";
import { fastPublicFetch, withPublicRestFallback } from "./api/fast-public";
import type { CacheOpts } from "./api/client";
import type { WpArticleListItem, WpListEnvelope } from "./api/wp-types";
import { getCategoryHrefs } from "./categories";
import type { ArticleRef } from "./articles";

const BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";

/** A post from core `/wp/v2/posts` with `_embed=wp:featuredmedia,wp:term`. */
interface WpCorePost {
  id: number;
  slug: string;
  date: string; // "2026-07-13T14:46:50" — site-local (Asia/Phnom_Penh), no zone
  title: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: { source_url?: string }[];
    // One array per taxonomy queried; categories come first.
    "wp:term"?: { id: number; name: string; slug: string; taxonomy: string }[][];
  };
}

export interface CorePostList {
  items: ArticleRef[];
  totalPages: number;
}

/** "2026-07-13T14:46:50" -> "13/07/2026" — the display format the rest of the
 *  site uses (see mappers.formatDate). */
function coreDate(dt: string): string {
  const parts = dt.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dt;
}

function mapCorePost(p: WpCorePost, hrefs: Map<number, string>): ArticleRef {
  const terms = (p._embedded?.["wp:term"] ?? []).flat().filter(t => t.taxonomy === "category");
  return {
    slug: p.slug,
    title: decodeEntities(p.title?.rendered ?? "").trim(),
    image: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? "",
    date: coreDate(p.date ?? ""),
    categories: terms.map(t => ({ id: t.id, name: t.name, href: hrefs.get(t.id) ?? null })),
  };
}

/**
 * The SAME ArticleRef, from a `pub-articles` row. Every field here is a
 * deliberate match for mapCorePost above, not a convenience:
 *
 *  - `title` — core hands back `title.rendered`; the fast path hands back raw
 *    `post_title`. decodeEntities covers the difference (measured identical on
 *    200 posts, this site's titles carrying no texturizable punctuation).
 *  - `date` — coreDate reads the first 10 characters, so it does not care that
 *    core sends "2021-09-27T05:04:51" and SQL sends "2021-09-27 05:04:51".
 *  - `categories` — SORTED BY NAME, which is the one thing the two paths do
 *    NOT agree on out of the box: core's `_embed` uses wp_get_object_terms'
 *    default (name), pub-articles emits term-id order (what web/get-articles
 *    emits, and what every other card on the site renders). Measured over 200
 *    posts: the SETS always match, the id order matches core on only 40, and
 *    this sort reproduces core exactly on all 200. Ties keep their incoming
 *    id order — JS sort is stable — and a post would have to carry both of a
 *    twin-named pair to notice.
 *  - `description` is deliberately NOT mapped. The fast row carries the card
 *    excerpt and core never did, and ArticleRow renders one when it is there —
 *    so mapping it would smuggle a UI change into a transport change. It is
 *    one line away if the owner ever wants author rows to match category rows.
 */
function mapFastPost(a: WpArticleListItem, hrefs: Map<number, string>): ArticleRef {
  const cats = [...(a.categories ?? [])].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return {
    slug: a.slug,
    title: decodeEntities(a.title ?? "").trim(),
    image: a.thumbnail ?? "",
    date: coreDate(a.publish_date || a.post_date || ""),
    categories: cats.map(c => ({ id: c.id, name: c.name, href: hrefs.get(c.id) ?? null })),
  };
}

/**
 * A page of core posts, with the list's page count.
 *
 * Not apiFetch(): the total lives in the `X-WP-TotalPages` HEADER, which
 * apiFetch's json-only contract throws away, so this is the one place that
 * calls fetch directly. Throws on failure — callers decide what degrading
 * looks like for their surface.
 */
async function fetchCorePosts(query: string, { revalidate, tags }: CacheOpts): Promise<CorePostList> {
  const [res, hrefs] = await Promise.all([
    // `_fields` keeps `_links` (the `_embed` mechanism resolves through it) and
    // trims the rest — without it an author's page of posts weighs ~3–4MB,
    // which is over Next's 2MB data-cache ceiling, so every request refetched.
    fetch(`${BASE}/wp/v2/posts?${query}&_embed=wp:featuredmedia,wp:term&_fields=id,slug,date,title,_links,_embedded`, {
      next: { revalidate, tags },
      headers: { accept: "application/json" },
    }),
    getCategoryHrefs(),
  ]);
  if (!res.ok) throw new Error(`wp-core ${res.status} for ${query}`);

  const posts = (await res.json()) as WpCorePost[];
  return {
    items: posts.map(p => mapCorePost(p, hrefs)),
    totalPages: Number(res.headers.get("x-wp-totalpages") ?? "1") || 1,
  };
}

/** The same page from the fast path. `total_page` replaces the X-WP-TotalPages
 *  header, and coerces the same way it does — an empty archive reports 1. */
async function fetchFastAuthorPosts(authorId: number, page: number, perPage: number, cache: CacheOpts) {
  const [env, hrefs] = await Promise.all([
    fastPublicFetch<WpListEnvelope<WpArticleListItem>>(
      "pub-articles",
      { author: authorId, page, per_page: perPage },
      cache,
    ),
    getCategoryHrefs(),
  ]);
  return {
    items: (env.data ?? []).map(row => mapFastPost(row, hrefs)),
    totalPages: Number(env.total_page) || 1,
  };
}

/** A page of an author's posts, newest first. Throws on failure — the author
 *  route turns an unknown author into a 404 instead of an empty archive.
 *
 *  Fast path first, core REST as the fallback: the two disagree on what a page
 *  PAST THE END is (REST 400s, pub-articles answers ok + empty data + the real
 *  total), and both land in the route's `items.length === 0` -> notFound()
 *  branch, so the 404 survives the switch either way. */
export function fetchAuthorPosts(authorId: number, page: number, perPage = 10): Promise<CorePostList> {
  const cache: CacheOpts = {
    // 1h floor (ISR-writes budget): rides the "articles" tag, which the
    // publish webhook busts — the window is only the no-webhook fallback.
    revalidate: 3600,
    tags: ["articles", `author:${authorId}`],
  };
  return withPublicRestFallback(
    `author:${authorId}`,
    () => fetchFastAuthorPosts(authorId, page, perPage, cache),
    // `orderby=date&order=desc` is EXPLICIT for a measured reason: this site's
    // DEFAULT post order is not date order. A plugin injects a menu_order sort
    // ahead of it, so one dragged post rides above its date (soloeurk-ams page
    // 1: post 89344, 2023-02-27, sits above 89683, 2023-03-02). Asking for the
    // order we actually want makes REST reproduce the fast path exactly, so a
    // fallback doesn't reshuffle the archive under the reader.
    () => fetchCorePosts(`author=${authorId}&page=${page}&per_page=${perPage}&orderby=date&order=desc`, cache),
  );
}

// The per-day bucket helpers (`fetchDayCards`, `dayStart`, `phnomPenhToday`)
// lived here until the ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ widget dropped its today/yesterday/
// day-before tabs for a pager. Nothing queries a date window any more; the
// homepage and the landing sections both page their feed through
// home-data.ts's fetchCardPage. Recover them from git if a date filter is ever
// wanted again — the Phnom Penh timezone arithmetic in particular was fiddly.
