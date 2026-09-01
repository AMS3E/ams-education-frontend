// Data for the section and topic LANDING pages (/life-style, /celebrity).
//
// Not to be confused with the category LISTING pages (/category/life-style/news),
// which are a different layout backed by getCategoryPage(). See landingHref() in
// src/lib/categories.ts for why both exist.

import { apiFetch } from "./api/client";
import { mapProgram } from "./api/mappers";
import { categoryRefs, categoryRefsByIds, type ArticleRef, type PopularItem } from "./articles";
import { getTeam, type TeamMember } from "./authors";
import { categoryHref, getCategoryTerms, NAV_SECTIONS, type Landing } from "./categories";
import { fetchEpisodeCards, fetchEpisodeRail } from "./episodes";
import { type FeaturedProgram as TrailerProgram } from "./featured-program";
import { getFeaturedMovie, programBySlug, programHref, type FeaturedMovie } from "./programs";
import { fetchCardPage, type CardPage } from "./home-data";

/** A ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ widget with nothing in it — a topic page (which carries
 *  no such widget) or a section page whose feed could not be read. */
const EMPTY_CARD_PAGE: CardPage = { cards: [], page: 1, totalPages: 0 };
import type { HomeCard } from "./home-data";
import type { WpObjectEnvelope, WpProgram } from "./api/wp-types";

/** A block of article cards with a heading and a "see all" into its listing. */
export interface Block {
  heading: string;
  href: string;
  items: ArticleRef[];
}

/** A block rendered as a numbered, text-only list. */
export interface RankedBlock {
  heading: string;
  href: string;
  items: PopularItem[];
}

/**
 * The tail every landing page shares.
 *
 * The two section pages are identical below their own scoped head, and so are
 * the nine topic pages — each block is hardwired to the category its heading
 * names, not to the page's own term. That is why the entertainment section page
 * still carries the life-style topics: on the live site it genuinely does.
 *
 * The headings are editorial, written by hand in WordPress, and are NOT the term
 * names — គន្លឹះថែរក្សាសម្ផស្ស heads the `health-and-beauty` feed (whose term is
 * named សុខភាពនិងសម្រស់), and ភាពយន្ត heads `movie-and-music` (ភាពយន្តនិងតន្ត្រី).
 * They can't be read off the API, so they live here.
 *
 * `slug` is the term SLUG, not its URL path — `get-article-by-category-slug`
 * takes the slug and aggregates over the term's descendants.
 *
 * `ids`, when present, fetches by term ID instead (a comma-separated list, whose
 * UNION is returned — see categoryRefsByIds). `slug` still supplies the block's
 * "see all" link either way, so the two can disagree: that is exactly what live
 * does on បំណិនជីវិត, which links to life-tips but is filled with strange news.
 */
interface TailBlock {
  heading: string;
  /** Drives the "see all" href, and the fetch when `ids` is absent. */
  slug: string;
  size: number;
  /** Comma-separated term IDs. When set, these are fetched instead of `slug`. */
  ids?: string;
}

const TAIL = {
  /** Big cards, two to a row. A section page runs a 2x2 of them; a topic page,
   *  whose right column is shorter, shows only the first row. Fetched once at the
   *  longer size and sliced. */
  // Editorially curated from category 243; `slug` supplies the all-news link.
  interest: { heading: "ចំណាប់អារម្មណ៍របស់ប្រិយមិត្ត", slug: "all-news", ids: "243", size: 4 },
  /** Both pages carry this block, at different lengths: a topic page runs all 7
   *  in its head, beside its own feed; a section page shows the first 5, further
   *  down in the tail. Fetched once at the longer size and sliced. */
  // Also life-tips on live (the newest five, which is what a section page shows
  // of this block) — so live runs the same 956 feed in this block AND in
  // `interest` above, four of the five articles being the same ones.
  // id 533 per the owner (2026-08-27) — was 243.
  popular: { heading: "ប្រធានបទពេញនិយម", slug: "all-news", ids: "533", size: 7 },
  /** Section pages only. The heading still links to all news, while its article
   *  feed is curated through category 515. */
  // Renamed from "អត្ថបទថ្មីៗ" and repointed to id 533 (was slug-aggregated
  // "all-news") per the owner, 2026-08-27.
  topNews: { heading: "ព័ត៌មានពេញនិយម", slug: "all-news", ids: "533", size: 10 },
  // `slug` was "reports" — not a real term, so the "see all" 404'd. The real
  // reports root is `all-report` (id 535). Heading renamed from
  // "ព័ត៌មានថ្មីបំផុត" per the owner, 2026-08-27 — id 243 unchanged.
  reports: { heading: "របាយការណ៍ថ្មី", slug: "all-report", ids: "243", size: 4 },
} satisfies Record<string, TailBlock>;

/** A tail block's articles, by ID when the entry names them and by slug otherwise. */
function tailRefs(entry: TailBlock): Promise<ArticleRef[]> {
  return entry.ids ? categoryRefsByIds(entry.ids, entry.size) : categoryRefs(entry.slug, entry.size);
}

/** The heading of the topic-page column that runs beside the topic's own feed.
 *
 *  Unlike everything in TAIL this block has NO fixed slug: it is scoped to the
 *  page's own term. It used to read `all-news`, the same feed the ranked
 *  ប្រធានបទពេញនិយម list beside it uses — so on all nine topic pages the two
 *  columns sat side by side showing the same articles in the same order. */
const RECENT = { heading: "អត្ថបទថ្មីៗ", size: 10 } as const;

/** The bare four-card strip at the top of a topic page (TagStrip). */
const LEAD = { heading: "ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ", size: 4 } as const;

/** ព័ត៌មានសង្ខេប — a four-up carousel below the matika tabs, section pages
 *  only. Live runs this as VIDEO posts; we have no video endpoint (same
 *  limitation the article page's own ព័ត៌មានសង្ខេប carries — see AUDIT.md
 *  TIER 3), so it's a recent-articles stand-in until one exists. */
const SUMMARY = { heading: "ព័ត៌មានសង្ខេប", seeAllText: "ប្រភេទវីដេអូ (VIDEO)", slug: "all-news", size: 8 } as const;

/**
 * Each topic's បទយកការណ៍ term, keyed by the ព្រឹត្តិការណ៍ term its landing page
 * resolves to. Every topic in the nav carries both; the lead strip runs the
 * REPORTS one while the feed beside it stays on the news one.
 *
 * Term IDs, not slugs derived from the news slug, because two of the nine break
 * the `<topic>-news` → `<topic>-reports` pattern by dropping their prefix:
 * `entertainment-strange-news` pairs with `strange-reports`, and
 * `entertainment-movie-and-music-news` with `movie-and-music-reports`. String
 * surgery would query two slugs that do not exist and quietly render nothing.
 *
 * Two of these terms are EMPTY — entertainment-culture-reports (6914) and
 * life-style-architecture-reports (6916) hold no articles at all — so /culture
 * and /life-style/architecture get no strip. TopicHead drops it rather than
 * backfilling with news: a strip that silently changes what it contains is the
 * thing this file's TAIL comments keep warning about.
 */
const TOPIC_REPORTS: Record<string, number> = {
  "entertainment-celebrity-news": 980, // entertainment-celebrity-reports
  "entertainment-culture-news": 6914, // entertainment-culture-reports (empty)
  "entertainment-movie-and-music-news": 981, // movie-and-music-reports
  "entertainment-strange-news": 984, // strange-reports
  "life-style-architecture-news": 6916, // life-style-architecture-reports (empty)
  "life-style-health-and-beauty-news": 989, // life-style-health-and-beauty-reports
  "life-style-life-tips-news": 991, // life-style-life-tips-reports
  "life-style-love-and-relation-news": 987, // life-style-love-and-relation-reports
  "life-style-travel-news": 986, // life-style-travel-reports
};

/** Economy's latest-articles tab rail. The same six categories drive the main
 * navigation and the homepage version of this component. Labels still come
 * from WordPress; their public landing URLs are the pinned NAV_SECTIONS hrefs. */
const MATIKA = {
  heading: "អត្ថបទថ្មីៗដែលលោកអ្នកគួរយល់ដឹង",
  size: 4,
} as const;

/** Sections that follow Economy's section-head layout while sourcing
 * `section.updates` from an explicitly curated reports-pair category id —
 * `updatesTerm`'s fallback (`economySection.reports`) only covers Education's
 * own six NAV_SECTIONS entries, not Economy's legacy ones below.
 *
 * Used to also carry `latestId`, feeding both New Reports and Popular News —
 * removed 2026-08-28 once live verification (all 6 Education landing pages)
 * showed New Reports is simply the page's own term everywhere
 * (`categoryRefs(term.slug, …)`, see its call site), and Popular News is
 * never page-specific at all. `latestId` had only ever been added for two of
 * those six pages (`news-life-education`, `news-skill-project`), which is why
 * the other four still pulled the wrong content until this fix. */
const CURATED_SECTION_HEADS: Record<string, { updatesId: number }> = {
  "news-finance": { updatesId: 577 },
  "news-realestate": { updatesId: 579 },
  "news-business": { updatesId: 571 },
  "news-pr": { updatesId: 581 },
  "news-startup-and-innovation": { updatesId: 583 },
  "news-life-education": { updatesId: 597 },
  "news-skill-project": { updatesId: 605 },
};

/** One panel of the latest-articles widget: a section and its four articles. */
export interface MatikaTab {
  label: string;
  /** The topic's landing page — where "see all" for this tab goes. */
  href: string;
  items: ArticleRef[];
}

export interface LandingFeed {
  matika: { heading: string; tabs: MatikaTab[] };
  /** Rendered below the matika strip on every landing page — see
   *  getAnakotFeature's comment. */
  anakot: AnakotFeature;
  /** Rendered below `anakot` on every landing page — see
   *  getGreenLeafFeature's comment. */
  greenLeaf: GreenLeafFeature;
  /** Section-page head; null on a topic page. `daily` feeds the daily-events
   *  widget — the SAME paged section the homepage runs, walking this section's
   *  own articles instead of the news root. It used to be three day tabs; see
   *  home/sections/DailyEventsSection for why the days went. */
  section: {
    daily: CardPage;
    updates: Block | null;
    /** Four-up "categories · date" strip above `reports` — added at the
     *  owner's request, 2026-08-27, in the space the hidden `updates` block
     *  left. Reuses the same category-243 feed as the tail's own interest
     *  block, at its full 4 items rather than that block's 2-item slice. */
    topStrip: Block;
    topNews: Block;
    reports: Block;
    popular: RankedBlock;
    summary: ArticleRef[];
  } | null;
  /** Topic-page head; null on a section page. `lead` is the four-card strip at the
   *  top of the page — topic pages do NOT carry the ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ
   *  daily-events widget the home and section pages do. `latest` is the next
   *  window of the topic's own feed. */
  topic: { lead: Block; latest: Block; recent: Block; popular: RankedBlock } | null;
  tail: {
    /** ចង់ដឹងរឿងគេ and បើកសោជីវិត — each a banner plus its episode rail. */
    features: ProgramFeature[];
    team: TeamMember[];
    /** Section pages only — on a topic page this block lives in the head. */
    popular: RankedBlock | null;
    interest: Block;
  };
}

/**
 * The two programs every landing page features: a wide video banner, each
 * followed by that show's episode rail.
 *
 * NOT getFeaturedProgram(). That reads WordPress's single global "Featured
 * Program" setting — វនយាត្រា today — which the homepage and the program pages
 * share, so it can't be repointed for the landing pages alone.
 *
 * WordPress builds each banner as a Vodi `section-featured-movie` block, in which
 * the movie and the background art are chosen INDEPENDENTLY of each other: the
 * live pages put Obsok-branded art behind ចង់ដឹងរឿងគេ (the celebrity page is the
 * lone exception, using the show's own cover). That pairing isn't derivable —
 * `/web/program` returns the show's OWN backdrop, a different image — and no
 * endpoint exposes it, so the art is pinned here.
 *
 * `heading` is likewise editorial: the rail below ចង់ដឹងរឿងគេ is headed
 * "កម្មវិធីចង់ដឹងរឿងគេ", not the bare show name.
 */
const FEATURES = [
  {
    slug: "reaction",
    heading: "កម្មវិធីចង់ដឹងរឿងគេ",
    cover: "https://s3.ams.com.kh/infotainment/2021/09/Obsok-V2.1-scaled.jpg",
  },
  {
    slug: "unlock-the-life",
    heading: "បើកសោជីវិត",
    cover: "https://s3.ams.com.kh/infotainment/2021/09/UnlockV2.1-scaled.jpg",
  },
] as const;

/** A banner and the episode rail beneath it. */
export interface ProgramFeature {
  banner: TrailerProgram;
  heading: string;
  href: string;
  episodes: HomeCard[];
}

/** អនាគត, added below the មាតិការសនិយម strip at the owner's request
 *  (2026-08-27) — the SAME pins the homepage uses (HomeView.tsx), not the
 *  registry-based FEATURES above: "anakot" isn't in CURATED_PROGRAMS, and the
 *  live homepage's own block for this show is a bespoke promo card
 *  (AnakotFeatureBanner) plus a season-tabbed rail (SeasonEpisodeCarousel),
 *  not the plain banner+carousel FEATURES renders.
 *
 *  postId 19929 / tvShowId 21613, both REST-verified 2026-08-27 — see
 *  HomeView.tsx's ANAKOT_FEATURED_MOVIE / ANAKOT_RAIL comments for the
 *  verification detail. Not re-verified here; same backend, same show. */
const ANAKOT_FEATURED_MOVIE_ID = 19929;
const ANAKOT_RAIL = { programSlug: "anakot", tvShowId: 21613 };

/** The Anakot banner + episode rail, mapped to the shapes AnakotFeatureBanner
 *  and SeasonEpisodeCarousel expect — same episode mapping HomeView.tsx does
 *  inline, lifted here so SectionHead/TopicHead stay plain prop consumers. */
export interface AnakotFeature {
  movie: FeaturedMovie | null;
  episodes: HomeCard[];
  href: string;
}

async function getAnakotFeature(): Promise<AnakotFeature> {
  const [movie, rail] = await Promise.all([
    getFeaturedMovie(ANAKOT_FEATURED_MOVIE_ID),
    fetchEpisodeRail(ANAKOT_RAIL.tvShowId),
  ]);
  return {
    movie,
    episodes: rail.episodes.map((e) => ({ slug: `episode-${e.id}`, href: e.href, src: e.thumbnail, title: e.title, ep: e.label })),
    href: programHref(ANAKOT_RAIL.programSlug),
  };
}

/** ពន្លកបៃតង, added below the អនាគត feature at the owner's request
 *  (2026-08-27) — same homepage pins (HomeView.tsx's GREENLEAF_FEATURED_MOVIE
 *  / GREENLEAF_RAIL). Unlike អនាគត, the live block for THIS show is the
 *  standard Vodi full-bleed hero (FeaturedMovieHero, not a bespoke banner)
 *  over a plain flat episode rail (EpisodeCarousel, not season-tabbed) — see
 *  HomeView.tsx's own comments for the verification detail.
 *
 *  postId 2930 / tvShowId 2534, both REST-verified 2026-08-27. `bgImage` is
 *  the live block's own pinned background, not the movie post's poster. */
const GREENLEAF_FEATURED_MOVIE_ID = 2930;
export const GREENLEAF_BG_IMAGE = "https://s3.ams.com.kh/education/2023/02/03_GREEN-LEAF_HOME-PAGE.png";
const GREENLEAF_RAIL = { programSlug: "green-leaf", tvShowId: 2534 };

export interface GreenLeafFeature {
  movie: FeaturedMovie | null;
  episodes: HomeCard[];
  href: string;
}

async function getGreenLeafFeature(): Promise<GreenLeafFeature> {
  const [movie, rail] = await Promise.all([
    getFeaturedMovie(GREENLEAF_FEATURED_MOVIE_ID),
    fetchEpisodeRail(GREENLEAF_RAIL.tvShowId),
  ]);
  return {
    movie,
    episodes: rail.episodes.map((e) => ({ slug: `episode-${e.id}`, href: e.href, src: e.thumbnail, title: e.title, ep: e.label })),
    href: programHref(GREENLEAF_RAIL.programSlug),
  };
}

/** `/web/program` carries no `video` field, so a banner has no trailer behind
 *  its ▶. Live's answer (and ours): the ▶ NAVIGATES to the show's newest
 *  episode instead — `watchHref` below — where the player already works. */
async function getFeature(f: (typeof FEATURES)[number]): Promise<ProgramFeature | null> {
  const ref = await programBySlug(f.slug);
  if (!ref) return null;

  const href = programHref(ref.slug);
  const base = { cover: f.cover, href, video: null };

  const [meta, episodes] = await Promise.all([
    apiFetch<WpObjectEnvelope<WpProgram>>(`/wp/v2/web/program?id=${ref.postId}`, {
      revalidate: 3600,
      tags: ["program", `program:${ref.slug}`],
    })
      .then((env) => mapProgram(env.data, ref))
      // The registry's title is enough to render the band; the year is decoration.
      .catch(() => ({ title: ref.title, description: [] as string[], year: "" })),
    // The whole show, as live does — its rails run every episode (44 and 43).
    fetchEpisodeCards(ref.slug, ref.showId),
  ]);

  return {
    // Episode cards come newest first, so [0] is the episode live's ▶ plays.
    banner: { ...base, title: meta.title, description: meta.description, year: meta.year, watchHref: episodes[0]?.href },
    heading: f.heading,
    href,
    episodes,
  };
}

const ranked = (items: ArticleRef[]): PopularItem[] => items.map((r) => ({ slug: r.slug, title: r.title }));

/** Everything on a landing page: the head scoped to this term, and the fixed
 *  tail shared by all eleven. `newsPage` drives the section head's
 *  ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ pager and is ignored on a topic page, which has no
 *  such widget. */
export async function getLandingFeed(landing: Landing, newsPage = 1): Promise<LandingFeed> {
  const { term, level } = landing;
  const isSection = level === "section";

  // Term slug -> its listing URL, for every "see all" on the page.
  const terms = await getCategoryTerms();
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const byId = new Map(terms.map((t) => [t.id, t]));
  const listing = (slug: string) => {
    const t = bySlug.get(slug);
    return t ? categoryHref(t.path) : categoryHref(slug);
  };
  const block = (key: keyof typeof TAIL, items: ArticleRef[]): Block => ({
    heading: TAIL[key].heading,
    href: listing(TAIL[key].slug),
    items,
  });
  const rank = (key: keyof typeof TAIL, items: ArticleRef[]): RankedBlock => ({
    heading: TAIL[key].heading,
    href: listing(TAIL[key].slug),
    items: ranked(items),
  });
  const economySection = NAV_SECTIONS.find((entry) => entry.news === term.slug);
  const curatedHead = CURATED_SECTION_HEADS[term.slug];
  const updatesTerm = curatedHead
    ? byId.get(curatedHead.updatesId) ?? (economySection ? bySlug.get(economySection.reports) : undefined)
    : economySection
      ? bySlug.get(economySection.reports)
      : undefined;
  const [
    daily, updates, own, leadReports, matika, topNews, reports, recent, popular, summary,
    features, team,
    interest,
    anakot, greenLeaf,
  ] = await Promise.all([
    // The blocks scoped to the term you're on. A section leads with a large card
    // plus a 2x2 cluster (5). A topic leads with a strip of four and then runs
    // its feed again as a lead card + four rows (5), so it takes NINE and shows
    // two successive windows rather than the same articles twice.
    // ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ — SECTION pages only (topic pages don't carry the
    // widget). One page of this section's own feed, through the same block-paged
    // fetch the homepage uses; `slug` aggregates the term's whole subtree, which
    // is what the section's lead grid has always shown.
    // The `.catch` is deliberate: fetchCardPage throws now (on the homepage this
    // feed IS the page), but a landing page is a stack of many blocks, so here it
    // degrades and SectionHead's DailyEventsSection drops itself.
    isSection
      ? fetchCardPage(newsPage, {
          filter: { categorySlug: term.slug },
          revalidate: 3600,
          tags: ["articles", `category:${term.slug}`],
        }).catch(() => EMPTY_CARD_PAGE)
      : Promise.resolve<CardPage>(EMPTY_CARD_PAGE),
    // Mirrors updatesTerm's own precedence above — curatedHead's id first,
    // else the section's reports term (589 for this page). The old
    // `term.slug === "news-economic"` gate was Economy-only and never true
    // for any Education slug, so this fetch always resolved to [].
    curatedHead
      ? categoryRefsByIds(String(curatedHead.updatesId), 4)
      : economySection
        ? categoryRefs(economySection.reports, 4)
        : Promise.resolve<ArticleRef[]>([]),
    // The topic's own feed, for ព័ត៌មានថ្មីបំផុត. Was fetched at 9 and split with
    // the lead strip above it; the strip now runs a different term, so this is
    // just its own five.
    isSection ? Promise.resolve([]) : categoryRefs(term.slug, 5),
    // The lead strip: the topic's បទយកការណ៍, not its ព្រឹត្តិការណ៍. [] for a topic
    // whose reports term is empty, and for section pages, which have no strip.
    !isSection && TOPIC_REPORTS[term.slug]
      ? categoryRefsByIds(String(TOPIC_REPORTS[term.slug]), LEAD.size)
      : Promise.resolve<ArticleRef[]>([]),
    // All six Economy navigation sections, four recent articles per tab.
    Promise.all(NAV_SECTIONS.map((entry) => categoryRefs(entry.news, MATIKA.size))),
    // Popular News (ព័ត៌មានពេញនិយម) is ALWAYS the generic TAIL feed, even on a
    // curated page (measured against live /life-education and
    // /skills-project, 2026-08-28): only New Reports below specializes to the
    // curated term there — Popular News' articles AND its "see all" link stay
    // exactly as generic as on every other landing page.
    isSection ? tailRefs(TAIL.topNews) : [],
    // New Reports (របាយការណ៍ថ្មី) is the page's OWN term, aggregating
    // descendants — confirmed against all 6 live landing pages, 2026-08-28:
    // /children-education (257, leaf) shows 257; /outstanding-youth (249, has
    // children) shows 249 AND its children 251/253/255; /life-education (245)
    // and /skills-project (247), both leaves, show themselves. The hardcoded
    // `TAIL.reports.ids = "243"` this replaced only ever looked right on
    // /national-and-international-education-update, because that page's own
    // term IS 243 — everywhere else it showed the wrong section's news. The
    // "see all" link stays the generic TAIL.reports.slug either way (see
    // `block()` below) — only the articles are ever page-specific on live.
    isSection ? categoryRefs(term.slug, TAIL.reports.size) : [],
    // The topic's OWN recents — the block that used to duplicate the ranked list.
    isSection ? [] : categoryRefs(term.slug, RECENT.size),
    tailRefs(TAIL.popular),
    isSection ? categoryRefs(SUMMARY.slug, SUMMARY.size) : Promise.resolve<ArticleRef[]>([]),
    Promise.all(FEATURES.map(getFeature)).then((f) => f.filter((x) => x !== null)),
    getTeam(),
    tailRefs(TAIL.interest),
    getAnakotFeature(),
    getGreenLeafFeature(),
  ]);

  // A topic page runs all 7; a section page shows the first 5. See TAIL.popular.
  const popularBlock = rank("popular", popular);
  const popularShort = { ...popularBlock, items: popularBlock.items.slice(0, 7) };

  // A section page runs a 2x2; a topic page, one row. See TAIL.interest.
  const interestBlock = block("interest", interest);
  const interestRow = { ...interestBlock, items: interestBlock.items.slice(0, 2) };

  const ownHref = categoryHref(term.path);

  return {
    matika: {
      heading: MATIKA.heading,
      tabs: NAV_SECTIONS.map((entry, i) => {
        const t = bySlug.get(entry.news);
        return {
          label: t?.name ?? entry.news,
          href: entry.href,
          items: matika[i],
        };
      }),
    },
    anakot,
    greenLeaf,
    section: isSection
      ? {
          daily,
          updates: updatesTerm
            ? {
                heading: "របាយការណ៍ និងបច្ចុប្បន្នភាព",
                href: categoryHref(updatesTerm.path),
                items: updates,
              }
            : null,
          topStrip: interestBlock,
          // Neither block's "see all" ever specializes on live, even when the
          // articles behind it do (reports, below) — both link genuinely to
          // the generic TAIL slug (all-news/all-report) on every landing page,
          // curated or not. Measured against live, 2026-08-28.
          topNews: block("topNews", topNews),
          reports: block("reports", reports),
          popular: popularShort,
          summary,
        }
      : null,
    topic: isSection
      ? null
      : {
          // The strip is the topic's REPORTS (empty for culture/architecture, whose
          // reports terms hold nothing — TopicHead then drops it). TagStrip renders
          // items only, so the heading and href here go unused by it.
          lead: { heading: LEAD.heading, href: ownHref, items: leadReports },
          latest: { heading: "ព័ត៌មានថ្មីបំផុត", href: ownHref, items: own },
          recent: { heading: RECENT.heading, href: ownHref, items: recent },
          popular: popularBlock,
        },
    tail: {
      features,
      team,
      popular: null,
      interest: isSection ? interestBlock : interestRow,
    },
  };
}
