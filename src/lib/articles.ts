// Article data, backed by the AMS Economy WordPress REST API.
//
// Components import the getters below (getArticle / getCategoryPage /
// getArticleExtras); the getters call the API and map raw WP shapes into the
// domain types here. See src/lib/api/ for the client + mappers.

import { notFound } from "next/navigation";
import { ApiError, apiFetch, safeTag } from "./api/client";
import { fetchArticleList } from "./api/article-list";
import { categoryHref, getCategoryDepths, getCategoryHrefs, getCategoryTerms } from "./categories";
import { decodeEntities, mapArticle, mapArticleRef } from "./api/mappers";
import type { WpArticleDetail } from "./api/wp-types";
import { getFeaturedPrograms, type FeaturedProgram } from "./navigation";

export interface Author {
  name: string;
  avatar: string;
  bio: string;
}

/** A category as shown on an article, with a link to its listing. `href` is null
 *  when the category can't be resolved to a term — the label then renders as
 *  plain text rather than a link that goes nowhere. */
export interface CategoryLink {
  id: number;
  name: string;
  href: string | null;
}

export interface Article {
  /** The WordPress post id — what a comment POST targets. */
  id: number;
  slug: string;
  title: string;
  /** ទំព័រដើម › section › topic › title. The last crumb is the article itself and
   *  carries a null href — as does any category whose term didn't resolve. */
  breadcrumb: { label: string; href: string | null }[];
  categories: CategoryLink[];
  /** Display date, "08/07/2026". */
  date: string;
  /** ISO-8601 with an explicit +07:00 offset, for `article:published_time` and
   *  JSON-LD. Empty when WordPress has no date. */
  publishedAt: string;
  modifiedAt: string;
  /** Meta description — Yoast's if the editor set one, else the excerpt. */
  description: string;
  commentCount: number;
  featured: { src: string; badge?: string };
  /** Rendered article body — Gutenberg HTML from WordPress `post_content`. */
  bodyHtml: string;
  author: Author;
}

export interface ArticleRef {
  slug: string;
  title: string;
  image: string;
  date?: string;
  /** The article's categories, each linking to its listing when the term
   *  resolves — shown in the meta line of list cards. */
  categories?: CategoryLink[];
  /** Comment count — renders "Leave a comment" (0) or "N comments" in the meta. */
  commentCount?: number;
  /** Short excerpt — shown by the "featured" card variant (FeaturedArticleCard). */
  description?: string;
}

export interface NamedList {
  heading: string;
  items: ArticleRef[];
  /** The listing this widget's "see all" points at. Absent on the widgets that
   *  have no destination (the anonymous windows into the recent feed). */
  href?: string;
}

export interface PopularItem {
  slug: string;
  title: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Real per-post dates, in ONE core `/wp/v2/posts` call keyed by id.
 *
 *  education.ams.com.kh's AMS3E-API list routes never send `publish_date`
 *  (measured 2026-08-27), so a card fed by them can only show `post_date`'s
 *  frozen relative phrase ("2ឆ្នាំមុន") — never an absolute date, unlike the
 *  live theme, which reads `wp_posts` directly. Core REST always carries a
 *  real timestamp, so this backfills it — one extra request per block, not
 *  per article, and behind the same ISR window as the list itself.
 *
 *  Swallows failure to an empty map: a missing real date just leaves the
 *  existing relative-phrase fallback in place, same as before this existed. */
async function realDatesById(ids: number[], tags: string[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  try {
    const posts = await apiFetch<{ id: number; date: string }[]>(
      `/wp/v2/posts?include=${ids.join(",")}&per_page=${ids.length}&_fields=id,date`,
      { revalidate: 3600, tags },
    );
    return new Map(posts.map((p) => [p.id, p.date]));
  } catch {
    return new Map();
  }
}

/** Fetch a page of the general feed and map to ArticleRef. Returns [] on error
 *  so a failing sub-section degrades gracefully instead of taking down the page. */
async function recentRefs(pageSize: number, tags: string[]): Promise<ArticleRef[]> {
  try {
    const [env, hrefs] = await Promise.all([
      fetchArticleList({ pageSize }, { revalidate: 3600, tags }),
      getCategoryHrefs(),
    ]);
    const items = env.data ?? [];
    const dates = await realDatesById(items.map((a) => a.id), tags);
    return items.map((a) => mapArticleRef(a, hrefs, dates.get(a.id)));
  } catch {
    return [];
  }
}

/** A category's most recent articles as ArticleRefs. Returns [] on error so a
 *  news column degrades to empty instead of taking the page down. */
export async function categoryRefs(category: string, pageSize: number): Promise<ArticleRef[]> {
  try {
    const tags = ["articles", `category:${category}`];
    const [env, hrefs] = await Promise.all([
      fetchArticleList({ pageSize, categorySlug: category }, { revalidate: 3600, tags }),
      getCategoryHrefs(),
    ]);
    const items = env.data ?? [];
    const dates = await realDatesById(items.map((a) => a.id), tags);
    return items.map((a) => mapArticleRef(a, hrefs, dates.get(a.id)));
  } catch {
    return [];
  }
}

/** A category's most recent articles, addressed by term ID rather than slug.
 *
 *  Two differences from categoryRefs that decide which one a block wants:
 *   - `category_id` takes a COMMA-SEPARATED list and returns the UNION of those
 *     terms; the slug endpoint takes exactly one.
 *   - it matches DIRECT assignments only, where the slug endpoint aggregates the
 *     term's descendants. Identical for a leaf term, very different for a parent
 *     (entertainment-news is 7,660 by id and 7,737 by slug).
 *
 *  Returns [] on error, like categoryRefs — one dead block, not a dead page. */
export async function categoryRefsByIds(ids: string, pageSize: number): Promise<ArticleRef[]> {
  try {
    const tags = ["articles", `category-ids:${ids}`];
    const [env, hrefs] = await Promise.all([
      fetchArticleList({ pageSize, categoryIds: ids }, { revalidate: 3600, tags }),
      getCategoryHrefs(),
    ]);
    const items = env.data ?? [];
    const dates = await realDatesById(items.map((a) => a.id), tags);
    return items.map((a) => mapArticleRef(a, hrefs, dates.get(a.id)));
  } catch {
    return [];
  }
}

interface WpPopularPost {
  id: number;
  slug: string;
  date?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  categories?: number[];
  pageviews?: string;
  yoast_head_json?: {
    og_image?: { url?: string }[];
    twitter_image?: string;
  };
}

/** The most-viewed published posts over the last 30 days, in WPP's ranking
 * order. This is the real popularity signal; category feeds are date-ordered.
 * Returns [] on failure because the homepage block is decorative. */
export async function popularArticleRefs(pageSize = 9): Promise<ArticleRef[]> {
  try {
    const fields = "id,slug,date,title,excerpt,categories,pageviews,yoast_head_json";
    const [posts, terms] = await Promise.all([
      apiFetch<WpPopularPost[]>(
        `/wordpress-popular-posts/v1/popular-posts?limit=${pageSize}&range=last30days&_fields=${fields}`,
        { revalidate: 3600, tags: ["articles", "popular-articles"] },
      ),
      getCategoryTerms(),
    ]);
    const byId = new Map(terms.map((term) => [term.id, term]));

    return (posts ?? []).map((post) => ({
      slug: post.slug,
      title: decodeEntities(post.title?.rendered ?? "").trim(),
      image: post.yoast_head_json?.og_image?.[0]?.url ?? post.yoast_head_json?.twitter_image ?? "",
      date: post.date ? post.date.slice(0, 10).split("-").reverse().join("/") : "",
      categories: (post.categories ?? []).flatMap((id) => {
        const term = byId.get(id);
        return term ? [{ id, name: term.name, href: categoryHref(term.path) }] : [];
      }),
      description: decodeEntities(post.excerpt?.rendered?.replace(/<[^>]+>/g, "") ?? "").trim(),
    }));
  } catch {
    return [];
  }
}

/** Slugs of the most recent articles — used by generateStaticParams to prebuild
 *  the hot article pages. */
export async function getRecentArticleSlugs(limit = 12): Promise<string[]> {
  const refs = await recentRefs(limit, ["articles"]);
  return refs.map((r) => r.slug);
}

// ─── Article detail ──────────────────────────────────────────────────────────

/** Full article by slug (get-article-by-slug). 404s if the slug isn't found.
 *
 *  ONLY a 404 becomes a 404. This used to `.catch(() => null)` everything, which
 *  fed the notFound() below — so a 500, a timeout or a dead upstream turned a
 *  real article into a 404 that ISR then served for an hour, across the biggest
 *  URL surface on the site (10k+ articles). The endpoint answers a clean 404 for
 *  an unknown slug (verified: status 404, with this host's replaced HTML body),
 *  so the status code is the honest signal and everything else rethrows.
 *  See the error-handling note in api/client.ts. */
export async function getArticle(slug: string): Promise<Article> {
  const [raw, categoryHrefs, depths] = await Promise.all([
    apiFetch<WpArticleDetail>(`/wp/v2/web/get-article-by-slug?slug=${encodeURIComponent(slug)}`, {
      revalidate: 3600,
      // safeTag: a percent-encoded Khmer slug can exceed the 256-char tag
      // limit, and an over-long tag is silently dropped at build time.
      tags: ["article", safeTag(`article:${slug}`)],
    }).catch((e: unknown) => {
      if (e instanceof ApiError && e.statusCode === 404) return null;
      throw e;
    }),
    getCategoryHrefs(),
    getCategoryDepths(),
  ]);

  if (!raw?.id) notFound();
  return mapArticle(raw, slug, categoryHrefs, depths);
}

export interface ArticleExtras {
  // sidebar (right column)
  sidebarLists: NamedList[];
  /** ព័ត៌មានជាតិ / ព័ត៌មានអន្តរជាតិ tabbed widget — see NATIONAL_INTERNATIONAL. */
  nationalInternational: { national: NamedList; international: NamedList };
  // below the article body
  recentReports: NamedList;
  generalNews: NamedList;
  programs: FeaturedProgram[];
  videos: NamedList;
  prevPost: { slug: string; title: string; meta: string };
  nextPost: { slug: string; title: string; meta: string };
  otherNews: NamedList;
}

const metaLine = (r?: ArticleRef) => (r ? [r.categories?.map((c) => c.name).join(", "), r.date].filter(Boolean).join(" · ") : "");

/**
 * The category widgets in the article sidebar.
 *
 * Their headings are editorial labels, so each entry explicitly names the
 * category feed it belongs to instead of being sliced from a general feed.
 *
 * These five (of NAV_SECTIONS' six real education categories — see
 * categories.ts) and their hrefs are education's own, REST-verified terms
 * (docs/wordpress/education-categories.md). This replaces a set of Economy's
 * category slugs (news-economic, news-finance, …) that were still here from
 * a copy-paste and resolved to nothing on education.ams.com.kh, leaving
 * every one of these widgets empty in production.
 */
const SIDEBAR_WIDGETS = [
  { heading: "អ្នកជំនាញចិត្តសាស្ត្រ", slug: "news-national-and-international-education-update", href: "/national-and-international-education-update", size: 3 },
  { heading: "ជំនាញ", slug: "news-life-education", href: "/life-education", size: 5 },
  { heading: "អប់រំកុមារតូច", slug: "news-children-education", href: "/children-education", size: 4 },
  { heading: "ព័ត៌មានអាហារូបករណ៍", slug: "news-scholarships-news", href: "/schoolaship-news", size: 6 },
  { heading: "យុវជនឆ្នើម", slug: "news-outstdanding-youth", href: "/outstanding-youth", size: 3 },
] as const;

/** ព័ត៌មានជាតិ / ព័ត៌មានអន្តរជាតិ — the tabbed widget on the live WordPress
 *  article sidebar (education.ams.com.kh), reproduced from a real article's
 *  page. Both are topics under the ព័ត៌មានជាតិ និងអន្តរជាតិ section (id 243) —
 *  see education-categories.md ids 723 / 731. No "see all" link: the live
 *  widget has none. */
const NATIONAL_INTERNATIONAL = {
  national: { heading: "ព័ត៌មានជាតិ", slug: "news-national-education" },
  international: { heading: "ព័ត៌មានអន្តរជាតិ", slug: "news-international-education" },
} as const;

/** Sidebar widgets + below-article sections.
 *
 *  Every block that carries a category HEADING is fetched from that category —
 *  the sidebar widgets and the two RelatedColumns blocks. Only the blocks
 *  with no category in their name (ព័ត៌មានសង្ខេប, ព័ត៌មានផ្សេងៗទៀត and the
 *  prev/next pager) are windows into the general feed,
 *  and they take DISJOINT windows of it so no article shows up twice on the page.
 *
 *  The two main-column feeds use education's own root ids (education-categories.md):
 *  535 (all-report / បទយកការណ៍) for reports and 533 (all-news / ព្រឹត្តិការណ៍)
 *  for general news — replacing Economy's 565/515, which resolved to nothing here. */
export async function getArticleExtras(): Promise<ArticleExtras> {
  const [refs, programs, reports, generalNews, widgets, national, international] = await Promise.all([
    recentRefs(13, ["articles"]),
    getFeaturedPrograms(),
    categoryRefsByIds("535", 9),
    categoryRefsByIds("533", 8),
    Promise.all(SIDEBAR_WIDGETS.map((w) => categoryRefs(w.slug, w.size))),
    categoryRefs(NATIONAL_INTERNATIONAL.national.slug, 5),
    categoryRefs(NATIONAL_INTERNATIONAL.international.slug, 5),
  ]);

  const at = (start: number, n: number) => refs.slice(start, start + n);

  return {
    sidebarLists: SIDEBAR_WIDGETS.map((w, i) => ({
      heading: w.heading,
      items: widgets[i],
      href: w.href,
    })),
    nationalInternational: {
      national: { heading: NATIONAL_INTERNATIONAL.national.heading, items: national },
      international: { heading: NATIONAL_INTERNATIONAL.international.heading, items: international },
    },
    recentReports: { heading: "របាយការណ៍ថ្មីៗ", items: reports },
    // RelatedColumns renders the first item as a large featured card, the rest as rows.
    generalNews: { heading: "ព័ត៌មានទូទៅ", items: generalNews },
    programs,
    videos: { heading: "ព័ត៌មានសង្ខេប", items: at(0, 8) },
    otherNews: { heading: "ព័ត៌មានផ្សេងៗទៀត", items: at(8, 3) },
    prevPost: { slug: refs[11]?.slug ?? "#", title: refs[11]?.title ?? "", meta: metaLine(refs[11]) },
    nextPost: { slug: refs[12]?.slug ?? "#", title: refs[12]?.title ?? "", meta: metaLine(refs[12]) },
  };
}

// ─── Category listing page (/category/[category]) ────────────────────────────

/** Maps a URL slug to its Khmer display name. A last-resort fallback — the real
 *  name comes from the term (src/lib/categories.ts) or the API response. */
const CATEGORY_NAMES: Record<string, string> = {
  "all-news": "ព្រឹត្តិការណ៍",
  "entertainment-news": "ព័ត៌មានកម្សាន្ត",
  "entertainment-strange-news": "ព័ត៌មានកម្សាន្តប្លែកៗ",
  "life-style-news": "ព័ត៌មានរសនិយម",
  "life-style-life-tips-news": "បំណិនជីវិត",
};

export function categoryName(slug: string): string {
  return CATEGORY_NAMES[slug] ?? decodeURIComponent(slug);
}

export interface CategoryPage {
  slug: string;
  name: string;
  /** First item renders as a large featured card, the rest as horizontal rows. */
  articles: ArticleRef[];
  /** Right-column widgets (thumbnail-row lists). */
  sidebar: NamedList[];
  page: number;
  totalPages: number;
}

/** A category listing page's worth of articles.
 *
 *  Exported because the 404 gate in category/[...path]/layout.tsx divides the
 *  term's article count by it to decide which `/page/N` URLs can exist. If the
 *  two disagreed, the gate would 404 real pages. */
export const CATEGORY_PAGE_SIZE = 10;

/** Articles for a category (get-article-by-category-slug).
 *
 *  `page_size` is the whole page's worth: the route renders the first item as the
 *  featured card and the rest as rows, so 10 shows 1 + 9. Change it here rather
 *  than slicing in the route — the API derives `total_page` from this, so a slice
 *  would drop the trailing article off every page and out of the pagination.
 *
 *  THROWS when the LISTING fails — it is the page's whole subject (case 2 in the
 *  error-handling note in api/client.ts). It used to `.catch(() => null)`, which
 *  wrote "មិនទាន់មានអត្ថបទក្នុងប្រភេទនេះទេ" into a static page and served it for
 *  an hour, indistinguishable from the two report categories that really are
 *  empty. Those still render that message, because they answer 200 with zero
 *  rows — the distinction the throw restores. The three SIDEBAR widgets keep
 *  swallowing: they are decoration on someone else's page. */
export async function getCategoryPage(category: string, page = 1): Promise<CategoryPage> {
  const [env, hrefs, terms, own, reports, popular] = await Promise.all([
    fetchArticleList(
      { pageSize: CATEGORY_PAGE_SIZE, page, categorySlug: category },
      { revalidate: 3600, tags: ["articles", `category:${category}`] },
    ),
    getCategoryHrefs(),
    getCategoryTerms(),
    // Widget 1 is THIS category's latest — the one thing on the page that is
    // scoped to the term you're looking at. It used to render the same global
    // recents on every listing.
    categoryRefs(category, 3),
    // Widget 2 names បទយកការណ៍, so it comes from the reports tree. It used to be
    // fed from the news feed, which is how it ended up leaking news articles.
    // "all-report" is the real reports root (id 535) — "reports" isn't a term
    // at all, so both this fetch and its href below 404'd.
    categoryRefs("all-report", 3),
    // Widget 3 ("most read") has no view-count field anywhere in REST, so there
    // is nothing to order by: it stays the most recent articles site-wide until
    // WordPress exposes one. Honest recents beat a third slice pretending to be
    // a ranking.
    recentRefs(3, ["articles"]),
  ]);

  const raw = env.data ?? [];
  // Prefer the real category name from the response; fall back to the map.
  const matched = raw.flatMap((a) => a.categories).find((c) => c.slug === category);
  const term = terms.find((t) => t.slug === category);
  const dates = await realDatesById(raw.map((a) => a.id), ["articles", `category:${category}`]);

  return {
    slug: category,
    name: matched?.name ?? categoryName(category),
    articles: raw.map((a) => mapArticleRef(a, hrefs, dates.get(a.id))),
    sidebar: [
      { heading: "ប្រធានបទពេញនិយម", items: own, href: term ? categoryHref(term.path) : categoryHref(category) },
      { heading: "របាយការណ៍", items: reports, href: categoryHref("all-report") },
      { heading: "អត្ថបទពេញនិយម", items: popular, href: categoryHref("all-news") },
    ],
    page: env.page ?? page,
    totalPages: env.total_page ?? 1,
  };
}
