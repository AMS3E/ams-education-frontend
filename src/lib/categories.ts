// The article category system, mirrored from WordPress.
//
// WordPress nests the taxonomy as  contentType -> section -> topic:
//
//   ព្រឹត្តិការណ៍ [all-news]              បទយកការណ៍ [reports]
//     ├─ entertainment-news                 ├─ entertainment-reports
//     │    ├─ entertainment-celebrity-news  │    ├─ entertainment-celebrity-reports
//     │    └─ …3 more topics                │    └─ …3 more topics
//     └─ life-style-news                    └─ life-style-reports
//          ├─ life-style-travel-news             ├─ life-style-travel-reports
//          └─ …4 more topics                     └─ …4 more topics
//
// The site's navigation presents the same three axes TRANSPOSED —
// section -> topic -> contentType. That is why every topic in the menu appears
// to have the same two children: they are not children, they are the topic's two
// terms, one in each tree. getNavMenu() performs that transposition.
//
// It is a clean cross-product: 2 roots + (2 x 2) sections + (2 x 9) topics, plus
// the strays `hot-news` and `uncategories` = the 26 terms the API returns.

import { apiFetch } from "./api/client";
import { fastPublicFetch, withPublicRestFallback } from "./api/fast-public";
import type { WpTerm } from "./api/wp-types";

export interface CategoryTerm {
  id: number;
  parent: number;
  name: string;
  slug: string;
  count: number;
  /** Path beneath /category/, no surrounding slashes: "life-style/travel/news". */
  path: string;
}

/** The section level is the one place WordPress breaks its own convention: the
 *  news term sits at `entertainment-news/news` but its reports counterpart at
 *  `entertainment/reports`, so the pair cannot be derived. Topics below this
 *  level all pair cleanly on their path prefix — see topicKey().
 *
 *  This is Infotainment's legacy tree. Economy's flat landing-page pairs are
 *  declared separately in NAV_SECTIONS and merged by landingsOf(). */
const SECTION_PAIRS = [
  { news: "entertainment-news", reports: "entertainment-reports" },
  { news: "life-style-news", reports: "life-style-reports" },
];

/**
 * The header nav's 6 sections, transcribed from education.ams.com.kh's live
 * `#menu-ams-education` (the "AMS EDUCATION" menu, assigned to the Primary
 * Menu location per the site's Customizer, 2026-08-26).
 *
 * Most of Education's taxonomy is only ONE level deep below its two roots
 * (`all-news`, `all-report`) — e.g. `news-life-education`'s own `link` is
 * `.../category/all-news/news-life-education/`, with NO further sub-topic
 * beneath it — so this array itself stays a flat list of leaf pairs, unlike
 * Infotainment's SECTION_PAIRS above (section -> topic -> {news,reports}).
 * TWO of the six sections are the exception: `news-national-and-international-
 * education-update` and `news-outstdanding-youth` each have real children in
 * the term tree (REST-verified and confirmed against the live flyout,
 * 2026-08-26). getNavMenu() below discovers that tier from the terms
 * themselves rather than pinning it here too — see NavSection.topics.
 *
 * `href` is a real WordPress PAGE (`menu-item-object-page` in the live
 * markup) — NOT derived from the category path. Infotainment's landingHref()
 * recovers a landing URL from a term's path via topicKey() (stripping a
 * trailing `/news` or `/reports`), which only works because Infotainment's
 * paths end in a bare "news"/"reports" segment. Education's don't: the path is
 * "all-news/news-life-education", and "news-life-education" is not "news", so
 * the same regex can't recover "/life-education" from it. There is no rule to
 * derive these pages from the taxonomy — pin them, same reasoning as
 * program-curation.ts. `schoolaship-news` (missing the first "l") is the
 * live page's real slug, not a typo to fix here.
 *
 * `label` overrides the category term's own name — WordPress menu items can
 * carry a custom title independent of the object they link to, and this menu
 * uses that: the term itself is named "ព័ត៌មានជាតិ និងអន្តរជាតិ" (National
 * and International News — REST-verified, id 243), but the live "AMS
 * EDUCATION" menu's top-level item reads "ព្រឹត្តិការណ៍ព័ត៌មាន" instead
 * (Customizer screenshot, 2026-08-26). Only this section has a divergent
 * label; the other five menu items match their term names verbatim.
 */
export const NAV_SECTIONS = [
  { news: "news-national-and-international-education-update", reports: "report-national-and-international-education-update", href: "/national-and-international-education-update", label: "ព្រឹត្តិការណ៍ព័ត៌មាន" },
  { news: "news-life-education", reports: "report-life-education", href: "/life-education" },
  { news: "news-skill-project", reports: "report-skill-project", href: "/skills-project" },
  { news: "news-outstdanding-youth", reports: "report-outstdanding-youth", href: "/outstanding-youth" },
  { news: "news-children-education", reports: "report-children-education", href: "/children-education" },
  { news: "news-scholarships-news", reports: "report-scholarships-news", href: "/schoolaship-news" },
];

/** The flyout's two entries are custom links in WordPress's menu with no term
 *  behind them, so their labels live here. Everything else is named by the API —
 *  including two Khmer spellings the CMS has wrong, which we deliberately do not
 *  patch here (fixing them in the frontend would fork the taxonomy). */
const CONTENT_TYPE_LABELS = { news: "ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ", reports: "បទយកការណ៍" };

const CATEGORY_PREFIX = "/category/";

/** "https://…/category/celebrity/news/" -> "celebrity/news" */
function toPath(link: string, slug: string): string {
  const i = link.indexOf(CATEGORY_PREFIX);
  return i === -1 ? slug : link.slice(i + CATEGORY_PREFIX.length).replace(/\/+$/, "");
}

/** Strip the trailing content-type segment: "celebrity/news" -> "celebrity". */
const topicKey = (path: string) => path.replace(/\/(news|reports)$/, "");

export const categoryHref = (path: string) => `${CATEGORY_PREFIX}${path}`;

/** A section's or topic's LANDING page — the term's path minus its trailing
 *  content-type segment. WordPress mints two URLs for every one of these terms
 *  and they mean different things:
 *
 *    /celebrity            the landing page  (magazine layout, this helper)
 *    /category/celebrity/news   the listing  (feed + sidebar + pagination)
 *
 *  That split is the whole reason both can exist. The header's section and topic
 *  links go to the landing; the flyout's news/reports leaves and every category
 *  chip on an article card go to the listing. Without it they would collide on
 *  one URL that has to render two different pages. */
export const landingHref = (path: string) => `/${topicKey(path)}`;

/** All 26 terms, with their real URL paths. THROWS.
 *
 *  This is the site's identity table for categories: resolveCategory and
 *  resolveLanding both turn "not in this list" into `notFound()`, so an empty
 *  answer is a 404 baked onto every real listing and landing page for an hour.
 *  See the error-handling note in api/client.ts — this is case 3.
 *
 *  Fast path first (pub-categories — same fields, including `link`, which on
 *  this site is mostly hand-entered Custom Permalinks read from the
 *  custom_permalink_table option), the exact WP REST call as fallback. This
 *  is the one call on EVERY page's critical path, and the first serial one on
 *  category/landing/static routes. */
export async function fetchCategoryTerms(): Promise<CategoryTerm[]> {
  const cache = { revalidate: 3600, tags: ["categories"] };
  const raw = await withPublicRestFallback<WpTerm[]>(
    "categories",
    () =>
      fastPublicFetch<{ data: WpTerm[] }>("pub-categories", {}, cache).then((env) => env.data ?? []),
    () => apiFetch<WpTerm[]>("/wp/v2/categories?per_page=100&_fields=id,parent,name,slug,count,link", cache),
  );
  return raw.map(t => ({
    id: t.id,
    parent: t.parent,
    name: t.name,
    slug: t.slug,
    count: t.count,
    path: toPath(t.link, t.slug),
  }));
}

/** The same list, degraded to [] — for the DECORATION surfaces, which are most
 *  of them: the header menu (on every page, so throwing here would take the
 *  whole site down to empty one strip), the id -> href maps behind card chips (a
 *  null href already renders as plain text by design), and the
 *  generateStaticParams that prebuild listings (prebuilding nothing still
 *  renders on demand, so a blip must not fail the build). */
export async function getCategoryTerms(): Promise<CategoryTerm[]> {
  return fetchCategoryTerms().catch(() => []);
}

/** Category id -> its listing URL.
 *
 *  Keyed by id, not slug, because the article-DETAIL endpoint returns categories
 *  as `{ id, name }` with no slug — only the list endpoints include one. The id
 *  is on both, so it is the only join key that works everywhere. */
export async function getCategoryHrefs(): Promise<Map<number, string>> {
  const terms = await getCategoryTerms();
  return new Map(terms.map(t => [t.id, categoryHref(t.path)]));
}

/** Category id -> its depth in the taxonomy: 0 = content-type root (all-news,
 *  reports), 1 = section, 2 = topic.
 *
 *  A breadcrumb needs this because an article's `categories` array arrives in NO
 *  useful order — a `culture` post comes back [section, root, topic], so reading
 *  the first two positionally yields "section › root" and silently drops the
 *  topic. Sorting by depth and dropping the root is the only way to recover the
 *  section › topic chain that the article's own permalink (/culture/news/<slug>)
 *  is built from. */
export async function getCategoryDepths(): Promise<Map<number, number>> {
  const terms = await getCategoryTerms();
  const byId = new Map(terms.map(t => [t.id, t]));

  const depthOf = (term: CategoryTerm): number => {
    let depth = 0;
    for (let cur = term; cur.parent; depth++) {
      const parent = byId.get(cur.parent);
      if (!parent) break;
      cur = parent;
    }
    return depth;
  };

  return new Map(terms.map(t => [t.id, depthOf(t)]));
}

/** Resolve a /category/ URL to its term. Matches WordPress's rewritten path
 *  first, then falls back to a bare term slug so older single-segment URLs
 *  (/category/entertainment-news) keep working. Null means 404 — which is why
 *  it reads the THROWING term list: a swallowed failure here would answer null
 *  for every category on the site and bake the 404s. */
export async function resolveCategory(segments: string[]): Promise<CategoryTerm | null> {
  const terms = await fetchCategoryTerms();
  const path = segments.join("/");

  const byPath = terms.find(t => t.path === path);
  if (byPath) return byPath;

  if (segments.length === 1) return terms.find(t => t.slug === segments[0]) ?? null;
  return null;
}

/**
 * The highest `/page/N` a category listing could possibly have — an UPPER BOUND,
 * never the exact figure, and deliberately so.
 *
 * It exists to let the 404 gate reject pages past the end of a real category
 * without fetching the listing. The listing is the slow request the skeleton
 * exists to cover, and a layout renders before that skeleton can flush, so
 * asking for it here would trade a soft 404 on an unlinked URL for a blank
 * ~4s wait on every uncached category page. The term list, by contrast, is
 * already cached and already on this request's critical path.
 *
 * WHY A SUM, AND WHY IT OVER-COUNTS. A listing addressed by SLUG aggregates the
 * term AND all its descendants (7,660 vs 7,737 for entertainment-news), so the
 * bound has to walk the subtree. Summing `count` double-counts any article filed
 * under both a parent and its child, so the bound comes out HIGH — measured
 * live, 3,041 pages against an actual 1,036 for all-news.
 *
 * That error direction is the whole point. Too high merely lets a soft 404
 * through, exactly as today; too low would 404 a page that really exists, which
 * is the failure this codebase spent a session removing. So: never tighten this
 * into an estimate.
 *
 * Consequently it is EXACT for the 20 leaf terms (nothing to double-count) and
 * loose for the 6 parents, where the page-level `articles.length === 0` check
 * still catches the rest.
 *
 * Reads the THROWING term list: this decides whether a URL exists, so a
 * swallowed failure would bound every category at page 1 and 404 the site's
 * listings wholesale (case 3 in the error-handling note in api/client.ts).
 */
export async function categoryMaxPages(term: CategoryTerm, pageSize: number): Promise<number> {
  const terms = await fetchCategoryTerms();

  const childrenOfId = new Map<number, CategoryTerm[]>();
  for (const t of terms) {
    const siblings = childrenOfId.get(t.parent);
    if (siblings) siblings.push(t);
    else childrenOfId.set(t.parent, [t]);
  }

  // `seen` guards the walk rather than the data: WordPress coerces hierarchy
  // loops away (wp_check_term_hierarchy_for_loops), so this should be dead
  // weight — but a cycle here would hang the render rather than misreport, and
  // that is not a failure worth risking to save a Set.
  const seen = new Set<number>();
  let articles = 0;
  const walk = (t: CategoryTerm) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    articles += t.count;
    for (const child of childrenOfId.get(t.id) ?? []) walk(child);
  };
  walk(term);

  // Page 1 always exists, even for the two report categories that hold nothing:
  // they answer 200 with the "no articles yet" message, which is a real page.
  return Math.max(1, Math.ceil(articles / pageSize));
}

export type LandingLevel = "section" | "topic";

export interface Landing {
  term: CategoryTerm;
  level: LandingLevel;
  /** The section this landing sits under. A section is its own section. */
  section: CategoryTerm;
  /** Public page path without surrounding slashes. */
  path: string;
}

/** The terms that have a landing page, all from the NEWS tree.
 *
 *  The reports tree is deliberately excluded. topicKey() maps `celebrity/news`
 *  and `celebrity/reports` onto the same key — that is precisely what it is FOR
 *  (it pairs a topic's two listings), so only one of the pair can own
 *  /celebrity. WordPress gives it to the news term, and so do we. */
function landingsOf(terms: CategoryTerm[]): Landing[] {
  const bySlug = new Map(terms.map(t => [t.slug, t]));

  const legacy = SECTION_PAIRS.flatMap(pair => {
    const section = bySlug.get(pair.news);
    if (!section) return [];
    const topics = terms.filter(t => t.parent === section.id);
    return [
      { term: section, level: "section" as const, section, path: topicKey(section.path) },
      ...topics.map(t => ({ term: t, level: "topic" as const, section, path: topicKey(t.path) })),
    ];
  });

  // Economy's primary sections are already leaf terms beneath `all-news`.
  // Their public page URLs are WordPress pages and cannot be derived from the
  // category paths, so use the same explicit mapping as the header navigation.
  const economy = NAV_SECTIONS.flatMap(entry => {
    const section = bySlug.get(entry.news);
    return section
      ? [{
          term: section,
          level: "section" as const,
          section,
          path: entry.href.replace(/^\/+|\/+$/g, ""),
        }]
      : [];
  });

  return [...legacy, ...economy];
}

/** Resolve a bare (non-/category/) path to its landing page, or null for 404.
 *
 *  The landing route is the site's ROOT catch-all, so every URL that isn't one
 *  of the static segments (/article, /category, /program) arrives here. Anything
 *  that is not one of the configured landing paths must be rejected.
 *
 *  THROWING term list, same reason as resolveCategory: null is a 404 here, and
 *  all eleven landings would take it at once. */
export async function resolveLanding(segments: string[]): Promise<Landing | null> {
  const path = segments.join("/");
  return landingsOf(await fetchCategoryTerms()).find(l => l.path === path) ?? null;
}

/** Landing paths, split into segments for generateStaticParams —
 *  hence the degrading list: prebuilding nothing is recoverable at request time,
 *  a failed build is not. */
export async function getLandingPaths(): Promise<string[][]> {
  return landingsOf(await getCategoryTerms()).map(l => l.path.split("/"));
}

export interface NavLeaf {
  label: string;
  href: string;
  count: number;
}
/** A topic beneath a section that has an extra tier — see NavSection.topics. */
export interface NavTopic {
  label: string;
  href: string;
  leaves: NavLeaf[];
}
export interface NavSection {
  label: string;
  href: string;
  /** The section's two listings — its news feed and its reports feed. Used
   *  directly by sections with no topic tier; still populated (as the
   *  section-wide aggregate) even when `topics` is present. */
  leaves: NavLeaf[];
  /** Sub-topics for the two sections that nest an extra tier between the
   *  section and its news/reports pair: national/international under
   *  "ព្រឹត្តិការណ៍ព័ត៌មាន", and talent/award/scholarship under "យុវជនឆ្នើម"
   *  — REST-verified and confirmed against the live flyout, 2026-08-26. When
   *  present, the UI should render these instead of `leaves`. */
  topics?: NavTopic[];
}

/**
 * The header menu: section -> {news, reports}, with two sections (see
 * NavSection.topics above) nesting a further topic tier. NAV_SECTIONS pins
 * the six sections; any category term whose parent is a section's news term
 * becomes one of that section's topics, so the extra tier is discovered from
 * the live taxonomy rather than pinned a second time.
 *
 * `section.href` is NAV_SECTIONS' pinned WordPress page; the leaves/topics
 * link to LISTINGS via the ordinary categoryHref().
 */
export async function getNavMenu(): Promise<NavSection[]> {
  const terms = await getCategoryTerms();
  if (terms.length === 0) return [];

  const bySlug = new Map(terms.map(t => [t.slug, t]));

  const leavesFor = (news: CategoryTerm, reports: CategoryTerm | undefined): NavLeaf[] => {
    const leaves: NavLeaf[] = [
      { label: CONTENT_TYPE_LABELS.news, href: categoryHref(news.path), count: news.count },
    ];
    if (reports) {
      leaves.push({ label: CONTENT_TYPE_LABELS.reports, href: categoryHref(reports.path), count: reports.count });
    }
    return leaves;
  };

  return NAV_SECTIONS.flatMap(s => {
    const news = bySlug.get(s.news);
    if (!news) return [];
    const reports = bySlug.get(s.reports);

    // Every topic term's reports counterpart follows the same "news-" ->
    // "report-" slug swap the six pinned pairs above already use.
    const topics: NavTopic[] | undefined = terms.some(t => t.parent === news.id)
      ? terms
          .filter(t => t.parent === news.id)
          .map(topic => ({
            label: topic.name,
            href: categoryHref(topic.path),
            leaves: leavesFor(topic, bySlug.get(topic.slug.replace(/^news-/, "report-"))),
          }))
      : undefined;

    return [{ label: s.label ?? news.name, href: s.href, leaves: leavesFor(news, reports), topics }];
  });
}
