// Raw response shapes from the AMS Economy WordPress REST API
// (namespace `wp/v2/web`). These are the ONLY place the API's field names live;
// everything downstream uses the mapped domain types (ArticleRef, Article, …).
// Verified against live responses on 2026-07-08.

import type { WpVideoSource } from "./video";

/** A category as embedded in an article. `slug` is present on list endpoints,
 *  absent on the article-detail endpoint. */
export interface WpCategory {
  id: number;
  name: string;
  slug?: string;
}

/** An article as returned by the LIST endpoints (get-articles,
 *  get-article-by-category-slug). */
export interface WpArticleListItem {
  id: number;
  title: string;
  categories: WpCategory[];
  category: string; // primary category slug
  slug: string;
  post_date: string; // relative Khmer string, e.g. "1ម៉ោងមុន"
  /** Raw publish time, site-local (Asia/Phnom_Penh): "2026-07-23 11:44:40".
   *
   *  OPTIONAL because the AMS3E-API plugin only started sending it on the list
   *  routes recently — `get-article-by-slug` has always had it. Until that patch
   *  is deployed the mappers fall back to `post_date`, so the two halves can ship
   *  independently. Prefer this: `post_date` is a string WordPress rendered at
   *  fetch time ("2ម៉ោងមុន"), which then freezes in our cache and goes stale. */
  publish_date?: string;
  thumbnail: string;
  description: string;
}

/** The `{ status, data, page, … }` wrapper the list endpoints use. Note `total`
 *  comes back as a string on get-articles but a number on the category endpoint,
 *  so always coerce with Number(). */
export interface WpListEnvelope<T> {
  status: string;
  data: T[];
  page: number;
  per_page: number;
  total: string | number;
  total_page: number;
}

/** The article-DETAIL endpoint (get-article-by-slug) returns this object
 *  directly — no envelope. `post_content` is Gutenberg HTML. */
export interface WpArticleDetail {
  id: number;
  title: string;
  thumbnail: string;
  categories: WpCategory[];
  publish_date: string; // "2026-07-08 10:14:12"
  last_updated: string;
  description: string;
  post_content: string; // HTML
  author: {
    id: string;
    author_name: string;
    profile: string; // avatar URL
    description: string; // bio
  };
  seo: { title: string; description: string };
}

/** An episode from the custom `tv-show-episodes` endpoint (AMS Frontend API
 *  plugin). Wrapped in the standard WpListEnvelope. */
export interface WpEpisode {
  id: number;
  title: string;
  episode_number: string; // e.g. "S1:E44"
  /** Index into the show's `_seasons` array, not an id — and editors have left it
   *  wrong on plenty of episodes (obsok's "S2:E2" claims season 1). A hint only. */
  season_id: number;
  permalink: string;
  post_thumbnail: string; // may be "" (episode without a featured image)
  /** Hand-typed run time ("02:01 នាទី"). Absent before plugin 1.5.0. */
  run_time?: string;
  /** Unix seconds at MIDNIGHT Asia/Phnom_Penh. Absent before plugin 1.5.0. */
  release_date?: number;
}

/** The `{ status, data }` wrapper the single-object endpoints use. */
export interface WpObjectEnvelope<T> {
  status: string;
  data: T;
}

/** One episode in full, from the custom `episode` endpoint. Everything here is
 *  MasVideos private post meta that WordPress core will not expose. */
export interface WpEpisodeDetail {
  id: number;
  title: string;
  episode_number: string;
  /** Free text and inconsistently typed: "02:01 នាទី", "02: 15នាទី". */
  run_time: string;
  /** Unix seconds at MIDNIGHT Asia/Phnom_Penh. Format it in THAT zone — the Vodi
   *  theme formats it in UTC, which is why the live site prints every episode's
   *  "Added:" date one day early. */
  release_date: number;
  tv_show_id: number;
  /** The show's title, which is what the live <h1> uses. */
  tv_show_title: string;
  season_id: number;
  /** e.g. "រដូវកាលទី១" — the heading above the live page's episode grid. */
  season_name: string;
  post_thumbnail: string;
  video: WpVideoSource;
}

/** The homepage's featured-program banner, from the custom `featured-program`
 *  endpoint. `data` is null when no program is configured in WP admin
 *  (Settings → Featured Program) — the frontend then hides the banner.
 *
 *  Everything here except `cover` is MasVideos `_movie_*` post meta that core
 *  REST will not expose (`wp/v2/movie/<id>` answers `meta: []`). */
export interface WpFeaturedProgram {
  id: number;
  slug: string;
  title: string;
  /** Gutenberg HTML, same shape as core's `excerpt.rendered`. */
  description: string;
  permalink: string;
  /** The movie's featured image — a PORTRAIT poster (~346x600). */
  poster: string;
  /** The WIDE banner art (~2560x576), chosen per-slot in WP admin — a different
   *  crop from the movie's own `_vodi_movie_bg_image` (~2560x398), which is why
   *  the slot picks its own rather than reading the movie's.
   *
   *  It carries the show's WORDMARK in the pixels, so the strip prints only a
   *  small title label; drawing a large one would render the logo twice. "" if unset. */
  cover: string;
  /** Unix seconds at MIDNIGHT Asia/Phnom_Penh. Format it in THAT zone — the Vodi
   *  theme formats it in UTC, which is why the live site prints dates a day early. */
  release_date: number;
  /** NOT a duration. Editors put the broadcast schedule here, e.g.
   *  "រៀងរាល់ថ្ងៃអាទិត្យ វេលាម៉ោង ៨:៣០ នាទីព្រឹក". Never render it as a run time. */
  schedule: string;
  /** The movie's parent show. Movies link via `_khi_tv_show_id`; episodes use
   *  `_tv_show_id` — different keys for the same idea. 0 when unlinked. */
  tv_show_id: number;
  video: WpVideoSource;
}

/** An attachment with its dimensions. `url` is "" when there is no image. */
export interface WpImage {
  url: string;
  width: number;
  height: number;
}

/** A program, from the custom `program` endpoint. Covers both post types the
 *  registry uses — most programs are a MasVideos `movie`, vanna-yeatra is a
 *  `tv_show`.
 *
 *  `backdrop` is Vodi's `_vodi_<post_type>_bg_image`: the wide key art behind the
 *  hero. It is the reason this endpoint exists at all — core REST can serve the
 *  title, description and poster, but answers `meta: []`, so the backdrop is
 *  unreachable there. Often unset; `url` is "" then.
 *
 *  Both images carry dimensions because the featured-image slot is NOT reliably a
 *  portrait poster: vanna-yeatra's holds 2560x398 landscape key art. Judge by
 *  shape, not by which field it came from — see mapProgram. */
export interface WpProgram {
  id: number;
  slug: string;
  title: string;
  /** Gutenberg HTML, same shape as core's `excerpt.rendered`. */
  description: string;
  permalink: string;
  poster: WpImage;
  backdrop: WpImage;
  /** Unix seconds at MIDNIGHT Asia/Phnom_Penh. Only the YEAR is shown — but format
   *  it in that zone anyway: in UTC a New Year's release prints the year before. */
  release_date: number;
  /** MasVideos calls this `run_time`, but it holds the BROADCAST SLOT, not a
   *  duration: "រៀងរាល់ថ្ងៃអាទិត្យ វេលាម៉ោង ៨:៣០ នាទីព្រឹក". "" when unset (3 of 19).
   *
   *  There is deliberately no cast/crew here: MasVideos has the fields and Vodi's
   *  template prints them, but they are empty on every program on this site. */
  schedule: string;
}

/** A category term from WordPress core's `categories` endpoint.
 *
 *  `link` is the term's REAL permalink, and the site rewrites those, so it does
 *  not contain `slug`: the term `entertainment-celebrity-news` lives at
 *  /category/celebrity/news/. It is the only reliable path -> term mapping.
 *  `count` counts posts assigned directly to the term, not to its descendants. */
export interface WpTerm {
  id: number;
  parent: number;
  name: string;
  slug: string;
  count: number;
  link: string;
}

/** An ad from the `advertise` endpoint. */
export interface WpAd {
  id: string;
  ads_title: string;
  ads_location: string; // "Home Page" | "Page Detail" | …
  ads_position: string;
  image: string;
}

export interface WpAdsEnvelope {
  status: string;
  message: string;
  data: WpAd[];
  current_page: number;
  per_page: number;
  total_items: string;
}
