// Data for the AMS Education homepage.
//
// This is a faithful port of the `renderVals()` logic from the original design
// mock. Everything here is deterministic (no randomness), so it can be computed
// once and rendered on the server.
//
// The article grids (daily/latest/lifestyle), the episode rails and the featured
// program banner are all fetched live now. See getHomeFeed below.

import { fetchArticleList, type ArticleListQuery } from "./api/article-list";
import { mapHomeCard } from "./api/mappers";
import { getCategoryHrefs, getCategoryTerms, NAV_SECTIONS } from "./categories";
import { fetchEpisodeCards } from "./episodes";
import { getFeaturedProgram } from "./featured-program";
import { categoryRefs, categoryRefsByIds, type CategoryLink, type PopularItem } from "./articles";

// MasVideos tv_show IDs (episodes link to a show via `_tv_show_id`), each paired
// with our program slug so its cards can link to /program/<slug>/<episode>.
const TV_SHOW_HEALTH = { slug: "1-minute-for-health", id: 14570 }; // ១នាទីដើម្បីសុខភាព
const TV_SHOW_OBSOK = { slug: "obsok", id: 14512 }; // អផ្សុក

/** ព្រឹត្តិការណ៍ [all-news], the news root — what the ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ tabs are
 *  scoped to.
 *
 *  It does NOT aggregate the tree beneath it: `category_id` (web/*) and
 *  `categories` (core) both match DIRECT assignments only, so this id reaches
 *  only articles directly tagged with it, not the whole subtree. Every RECENT
 *  article carries the root tag, which is all a three-day window ever sees —
 *  but that is why the id can't be traded for `slug=all-news` (which does
 *  aggregate the full subtree) without changing what the tabs return. */
const ALL_NEWS_ID = 533;

/** Cards per page of ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ: the lead card plus its 2×2 cluster. */
const NEWS_PAGE_SIZE = 5;

/** Pages served per upstream request.
 *
 *  Every call to this WordPress costs ~3.7s no matter what it returns — 25
 *  articles measured 0.1s slower than 5, and core's `wp/v2/posts` asked for three
 *  fields is just as slow, so it is site-wide overhead rather than a slow query.
 *  Fetching a page at a time therefore made EVERY pager click a fresh ~4s wait,
 *  because each page is a distinct URL nothing has warmed.
 *
 *  So one request fetches five pages' worth and the page is sliced out of it.
 *  Pages 2-5 of a block reuse that same cached fetch (~0.4s); only crossing into
 *  a new block pays the round trip again. Five is chosen to cover realistic
 *  paging depth — a larger block would spend the same 3.7s to cover pages almost
 *  nobody reaches, and discard more of what it fetched.
 *
 *  (A8: these feeds now go through fetchArticleList, so a cold block is ~0.3s on
 *  the fast path and ~3.7s only on REST fallback. The block is kept either way —
 *  one ISR cache entry per five pages is the point, not just the round trip.) */
const NEWS_BLOCK_PAGES = 5;
const NEWS_BLOCK_SIZE = NEWS_PAGE_SIZE * NEWS_BLOCK_PAGES;



/**
 * A homepage feed card. One shape for every home grid — the optional fields
 * cover the small differences between sections:
 *  - `tags` / `date`  → daily, latest, lifestyle cards
 *  - `ep`             → health-episode cards ("S1:E12")
 * (Replaces the old ArticleCard / HealthCard / SimpleCard triple.)
 */
export interface HomeCard {
  /** Article slug — the card links to /article/[slug]. */
  slug: string;
  /** Explicit href, used by episode cards (/program/<program>/<episode>).
   *  When set it wins over `slug`, which otherwise implies /article/<slug>. */
  href?: string;
  src: string;
  title: string;
  /** The article's categories (first three), each linking to its listing. */
  tags?: CategoryLink[];
  date?: string;
  ep?: string;
}


/** Fetch + map a page of home cards. Returns [] on error, and the section that
 *  asked for it is then DROPPED by its component rather than filled — see the
 *  note on getHomeFeed. Exported so landing pages can reuse the same fetch for
 *  a section this component shares with the homepage — see
 *  ChildrenEducationSection.tsx. */
export async function fetchHomeCards(q: ArticleListQuery): Promise<HomeCard[]> {
  try {
    const [env, hrefs] = await Promise.all([
      // 1h floor (ISR-writes budget): freshness is pushed by the publish
      // webhook's "home"/"articles" busts, not this polling window.
      fetchArticleList(q, { revalidate: 3600, tags: ["articles", "home"] }),
      getCategoryHrefs(),
    ]);
    return (env.data ?? []).map((a) => mapHomeCard(a, hrefs));
  } catch {
    return [];
  }
}

/** One page of a ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ pager: the five cards, which page they are,
 *  and how many pages the feed has. `totalPages` is 0 for an empty feed; a FAILED
 *  read no longer lands here at all — fetchCardBlock throws (see below). */
export interface CardPage {
  cards: HomeCard[];
  page: number;
  totalPages: number;
}

/** How the caller addresses its feed: which slice of the article feed it walks,
 *  plus its own caching. The homepage pages the news root by category id; a
 *  landing section pages its own term by slug (which aggregates descendants —
 *  see fetchArticleList). Page/size are chosen per BLOCK by fetchCardPage. */
interface PagedFeed {
  filter: Pick<ArticleListQuery, "categorySlug" | "categoryIds">;
  revalidate: number;
  tags: string[];
}

/** One BLOCK of a feed, plus the count the pager needs.
 *
 *  `totalPages` is derived from `total` (the article count) and NOT from the
 *  envelope's `total_page`: that field counts pages at the size we ASKED for, so
 *  with a 25-article block it answers 33 where the pager numbers 161 pages of
 *  five. `total` comes back as a string on these endpoints, hence Number().
 *
 *  THROWS. This block is the ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ pager's content, and on the
 *  HOMEPAGE that pager is the page's subject — so a failed read must not be
 *  published as a homepage without it. Callers that treat the strip as a tail
 *  block (the program and episode pages, the landing sections) catch it
 *  themselves. See the error-handling note in api/client.ts. */
async function fetchCardBlock(blockNo: number, feed: PagedFeed): Promise<{ cards: HomeCard[]; totalPages: number }> {
  const [env, hrefs] = await Promise.all([
    fetchArticleList(
      { ...feed.filter, page: blockNo, pageSize: NEWS_BLOCK_SIZE },
      { revalidate: feed.revalidate, tags: feed.tags },
    ),
    getCategoryHrefs(),
  ]);
  return {
    cards: (env.data ?? []).map((a) => mapHomeCard(a, hrefs)),
    totalPages: Math.ceil((Number(env.total) || 0) / NEWS_PAGE_SIZE),
  };
}

/** One page of a paged feed, newest first — shared by every ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ
 *  pager on the site (the homepage's and the landing sections').
 *
 *  Fetches the BLOCK the page falls in (see NEWS_BLOCK_PAGES) and slices the five
 *  cards out of it, so consecutive pages share one cached upstream request.
 *
 *  Out of range falls back to page 1, which covers every way a page can come back
 *  empty: a block past the end (the REST endpoints answer 404, the fast path an
 *  empty list — both land here as zero cards), and a page inside the LAST block
 *  that still sits past the final article (page 162 slices at offset 5 of a
 *  2-article block). Neither can be clamped before asking — the article count
 *  only arrives with a successful response — so it costs a second request, and
 *  only on a URL somebody hand-edited. */
export async function fetchCardPage(page: number, feed: PagedFeed): Promise<CardPage> {
  const blockOf = (p: number) => Math.floor((p - 1) / NEWS_BLOCK_PAGES) + 1;
  const pageOf = (block: HomeCard[], p: number) => {
    const offset = ((p - 1) % NEWS_BLOCK_PAGES) * NEWS_PAGE_SIZE;
    return block.slice(offset, offset + NEWS_PAGE_SIZE);
  };

  const asked = await fetchCardBlock(blockOf(page), feed);
  const cards = pageOf(asked.cards, page);
  if (cards.length > 0 || page === 1) return { cards, page, totalPages: asked.totalPages };

  const first = await fetchCardBlock(1, feed);
  return { cards: pageOf(first.cards, 1), page: 1, totalPages: first.totalPages };
}

/** A feed that could not be read, for the callers that treat the strip as a tail
 *  block. `totalPages: 0` suppresses the pager, so no links are minted for pages
 *  we cannot confirm exist. */
const EMPTY_PAGE: CardPage = { cards: [], page: 1, totalPages: 0 };

/** The HOMEPAGE's pager: the news root, by category id. */
const fetchNewsPage = (page: number) =>
  fetchCardPage(page, {
    filter: { categoryIds: String(ALL_NEWS_ID) },
    revalidate: 3600,
    tags: ["articles", "home"],
  });

/** មាតិការសនិយម — one tab per NAV_SECTIONS term (economic/finance/real-estate/
 *  business/pr/start-up-innovation), four articles each, switching in place.
 *  Reuses NAV_SECTIONS (categories.ts) rather than re-pinning the same six
 *  slugs here — see its header comment for why they can't be derived. */
async function getMatikaTabs() {
  const [terms, ...tabItems] = await Promise.all([
    getCategoryTerms(),
    ...NAV_SECTIONS.map((s) => categoryRefs(s.news, 4)),
  ]);
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  return {
    heading: "អត្ថបទថ្មីៗដែលលោកអ្នកគួរយល់ដឹង",
    tabs: NAV_SECTIONS.map((s, i) => ({
      label: bySlug.get(s.news)?.name ?? s.news,
      href: s.href,
      items: tabItems[i],
    })),
  };
}

/**
 * All homepage feed content in one call.
 *  - daily comes from the general article feed (`get-articles`)
 *  - every other grid (childrenEducation, latestNews, recentArticles, youth,
 *    scholarshipNews, scholarships, awards, nationalNews, matika, skills)
 *    comes from its own category, by id — see docs/wordpress/education-categories.md
 *  - health / obsok come from their TV shows' episodes (`tv-show-episodes`)
 *  - featured is the video banner, set in WP admin (`featured-program`)
 *
 * NOTHING HERE IS FAKED. Every grid used to fall back to curated mock cards —
 * Unsplash stock photos under invented Khmer headlines — so a page that could not
 * reach WordPress published fabricated articles a reader could not tell from real
 * ones. Each grid now returns EMPTY on failure and its section drops out of the
 * page entirely (the components return null), which is what `featured` has always
 * done. Fewer real blocks, never invented ones.
 *
 * `dailyIsSubject` — the HOMEPAGE passes true, because ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ is
 * the reason that page exists; a failed read throws and ISR keeps serving the last
 * good homepage instead of publishing one with its main feed missing. The program
 * and episode pages leave it false: there the same strip is a tail block, and
 * losing it must not take down a page about something else.
 */
export async function getHomeFeed(newsPage = 1, dailyIsSubject = false) {
  const [
    daily, childrenEducation, health, healthFromStart, obsok, featured,
    latestNews, recentArticles, youth, scholarshipNews, scholarships, awards, talent, nationalNews, matika, skills,
  ] = await Promise.all([
    // ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ — one page of the news root, newest first. This was
    // three day tabs until the date filter was dropped for a pager; the day
    // windows (and wp-core's fetchDayCards) now serve only the landing pages.
    dailyIsSubject ? fetchNewsPage(newsPage) : fetchNewsPage(newsPage).catch(() => EMPTY_PAGE),
    // អប់រំសម្រាប់កុមារ — category 639 (`report-children-education`), the real
    // section on the live homepage (REST- and HTML-verified, 2026-08-27), a
    // 4-card row directly beneath ពានរង្វាន់. The old `life-style-news` slug
    // this replaced doesn't exist in Education's taxonomy, so that feed was
    // silently empty on the live site.
    fetchHomeCards({ pageSize: 4, categoryIds: "639" }),
    // Health twice, in both directions — the HOMEPAGE shelf reads as a series to
    // start from E1, while the same section on the program/episode pages stays a
    // what's-new strip. Two calls, one round trip: both go through the same
    // cached fetchShowEpisodes, exactly as fetchSeasonCards does.
    fetchEpisodeCards(TV_SHOW_HEALTH.slug, TV_SHOW_HEALTH.id, 12),
    fetchEpisodeCards(TV_SHOW_HEALTH.slug, TV_SHOW_HEALTH.id, 12, "oldest"),
    fetchEpisodeCards(TV_SHOW_OBSOK.slug, TV_SHOW_OBSOK.id, 12),
    getFeaturedProgram(),
    // របាយការណ៍ថ្មីៗ — five articles from category 535 (`all-report`,
    // Education's reports root — REST-verified, 2026-08-26). 565 was a
    // leftover Economy category id with no counterpart in Education's
    // taxonomy, so this feed was silently empty on the live site.
    categoryRefsByIds("535", 5),
    // ព័ត៌មានពេញនិយម — five articles from category 533 (`all-news`, Education's
    // news root). Was WPP's most-viewed-in-30-days ranking (popularArticleRefs);
    // switched to a plain category feed per owner instruction, 2026-08-26.
    categoryRefsByIds("533", 9),
    // យុវជនឆ្នើម — category 249 (`news-outstdanding-youth`), lead card + 3 rows.
    // Every id in this block was read off the live homepage's rendered HTML
    // (section heading -> its "see all" category link), not guessed from the
    // taxonomy — see docs/wordpress/education-categories.md.
    categoryRefsByIds("249", 4),
    // ព័ត៌មានអាហារូបករណ៍ — category 259 (`news-scholarships-news`), the live
    // page's numbered 8-item list.
    categoryRefsByIds("259", 8),
    // អាហារូបករណ៍ / ពានរង្វាន់ / ទេពកោសល្យ — categories 251
    // (`news-youth-scholarship`), 253 (`news-award`) and 255 (`news-talent`),
    // all three children of 249 — three-up card rows. ទេពកោសល្យ added below
    // ពានរង្វាន់ at the owner's request, 2026-08-27.
    categoryRefsByIds("251", 3),
    categoryRefsByIds("253", 3),
    categoryRefsByIds("255", 3),
    // ព្រឹត្តិការណ៍ព័ត៌មានជាតិ — category 723 (`news-national-education`),
    // beside them as a thumbnail list.
    categoryRefsByIds("723", 5),
    // អត្ថបទថ្មីៗដែលលោកអ្នកគួរយល់ដឹង — all six NAV_SECTIONS terms as switching
    // tabs. Unchanged: NAV_SECTIONS already pins Education's real six terms.
    getMatikaTabs(),
    // ជំនាញ — category 247 (`news-skill-project`). Replaces the old `top-news`
    // fallback, which stood in for an Economy-only "entertainment" concept
    // that doesn't exist in Education's taxonomy.
    categoryRefsByIds("247", 3),
  ]);

  return {
    // One page of ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ. `totalPages` 0 suppresses the pager,
    // which is what an empty or unavailable feed should do — handing out links
    // to pages that don't exist was the one thing the old mock path got right.
    daily,
    childrenEducation,
    // Newest-first, for the HealthSection on the program and episode pages.
    healthGrid: health,
    // Oldest-first (E1 …), for the homepage's HealthSection only.
    healthFromStart,
    obsokGrid: obsok,
    featured,
    latestNews,
    recentArticles,
    youth,
    scholarshipNews: scholarshipNews.map((r): PopularItem => ({ slug: r.slug, title: r.title })),
    scholarships,
    awards,
    talent,
    nationalNews,
    matika,
    skills,
  };
}

export interface FooterLink {
  label: string;
  href: string;
  /** Another AMS property, so it opens off-site. */
  external?: boolean;
}

/**
 * The footer's three link columns — transcribed from education.ams.com.kh's
 * live footer (`#colophon` widgets), 2026-08-27. This was still the Economy
 * site's footer (column 1 headed "AMS ECONOMY", linking celebrity/movie-and-
 * music/life-style — none of which exist in Education's taxonomy) up to that
 * point.
 *
 * Column 1 points at the topic LANDING pages (the same destination the
 * header's topic links use — see NAV_SECTIONS in categories.ts, whose hrefs
 * these match one-for-one) rather than the raw /category/ URLs the live site
 * itself links, so the footer and header stay on one convention for the same
 * six sections. "ក្រុមការងារ" points at this app's own team route (`/author`,
 * per HomeView's ក្រុមការងារ section) rather than the live site's `/persons/`,
 * which this app doesn't serve under that path.
 *
 * "គណនីរបស់ខ្ញុំ" and column 2's "AMS Radio" are BOTH "#" here, matching the
 * live footer exactly — they're "#" there too (no account page or AMS Radio
 * site anywhere yet). Dropping either (this file's first pass did, for both)
 * looks like the safer call, but SiteFooter splits each column into two even
 * halves by count, so removing one of eight items unbalances the split into
 * 4-and-3 instead of the live site's clean 4-and-4 — a real, visible layout
 * bug traded for avoiding one dead link. Keeping the "#" wins in both cases.
 *
 * Column 2 also had its two self-referencing entries backwards: on the
 * Economy site "/" IS AMS Economy, but here "/" is AMS Education — so "AMS
 * Economy" needs the external economy.ams.com.kh link Education's own footer
 * gives it, and "AMS Education" is the plain "/" home link, not a redundant
 * external round-trip to its own domain.
 *
 * Column 3's links were guessed at some point rather than read off the site:
 * "សំណួរទូទៅ"/"/question" is real content, but at "/frequently-asked-
 * questions" — "/question" 404s on this backend.
 */
export const footerCols: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "AMS EDUCATION",
    links: [
      { label: "គណនីរបស់ខ្ញុំ", href: "#" },
      { label: "ព្រឹត្តិការណ៍ព័ត៌មាន", href: "/national-and-international-education-update" },
      { label: "ចំណេះជីវិត", href: "/life-education" },
      { label: "ជំនាញ", href: "/skills-project" },
      { label: "យុវជនឆ្នើម", href: "/outstanding-youth" },
      { label: "អប់រំកុមារតូច", href: "/children-education" },
      { label: "ព័ត៌មានអាហារូបករណ៍", href: "/schoolaship-news" },
      { label: "ក្រុមការងារ", href: "/author" },
    ],
  },
  {
    heading: "បណ្តាញព័ត៌មានផ្សេងៗទៀតពី AMS GROUP",
    links: [
      { label: "AMS Economy", href: "https://economy.ams.com.kh", external: true },
      { label: "AMS Education", href: "/" },
      { label: "AMS Infotainment", href: "https://infotainment.ams.com.kh", external: true },
      { label: "AMS Khmer Civilization", href: "https://ams.com.kh/khmercivilization", external: true },
      { label: "AMS Central", href: "https://ams.com.kh/central", external: true },
      { label: "AMS Sport", href: "https://ams.com.kh/sports", external: true },
      { label: "AMS TV11", href: "https://ams.com.kh/tv11", external: true },
      // Same call as "គណនីរបស់ខ្ញុំ" above: "#" on the live footer too (no
      // AMS Radio site yet), but dropping it unbalances this column's split
      // into 4-and-3 instead of the live site's 4-and-4.
      { label: "AMS Radio", href: "#" },
    ],
  },
  {
    heading: "ស្វែងយល់បន្ថែម",
    // Order chosen so SiteFooter's column-major split (first half → left
    // sub-column, rest → right) lands as row pairs ទំនាក់ទំនង/សំនួរនិងចម្លើយ
    // then ផ្សព្វផ្សាយពាណិជ្ជកម្ម/ជ្រើសរើសបុគ្គលិក — owner's requested pairing
    // for this column specifically, not the live site's own list order.
    links: [
      { label: "ទំនាក់ទំនង", href: "/contact" },
      { label: "ផ្សព្វផ្សាយពាណិជ្ជកម្ម", href: "/advertising" },
      { label: "សំនួរនិងចម្លើយ", href: "/frequently-asked-questions" },
      { label: "ជ្រើសរើសបុគ្គលិក", href: "/jobs" },
    ],
  },
];

/** The legal links in the black bar at the very bottom — a deliberate choice
 *  in this app, not a live-site match (the real site overrides
 *  `.footer-bottom-bar`'s own black default to white; this app keeps it
 *  black regardless — see SiteFooter.tsx). */
export const footerLegal: FooterLink[] = [
  { label: "គោលការណ៍ភាពឯកជន", href: "/privacy-policy" },
  { label: "ដំណឹងតាមច្បាប់", href: "/terms-conditions" },
  { label: "COOKIE (ខូខី)", href: "/cookies" },
];
