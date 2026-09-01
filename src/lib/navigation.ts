// Header navigation + program data.
//
// This is REAL data pulled from the live WordPress site (labels, links, and
// CDN image URLs), shaped like a future CMS/API response. The pills stay
// curated because their colors are design assets; the icon strip comes from
// WordPress's public navigation-menu API; the poster list is curated but
// auto-appends new published programs on the all-programs surfaces — see
// getFeaturedPrograms.
//
// NO top-level import of the data layer here: MobileNav (a Client Component)
// value-imports PROGRAM_ICON_LABEL from this module, so a static import of
// programs.ts would drag the whole fetch layer into the client bundle. The
// registry is loaded lazily inside the one server-only function that needs it.

// ─── Colored pill menu (top-right of the header bar) ──────────────────────────

/** `slug` keys into the program registry — see src/lib/programs.ts, which owns
 *  the WordPress ids and the canonical URLs.
 *
 *  `background` is a full CSS background value. It is applied inline in
 *  SiteHeader — Panda compiles its styles at build time, so a value coming
 *  from data cannot go through `css()`. */
export interface NavPill {
  label: string;
  background: string;
  /** Text color at rest — always white today, but per-pill data since hover
   *  (SiteHeader's pillLink / MobileNav's pill) overrides it via the same
   *  --pill-color custom property. */
  color: string;
  slug: string;
  /** /program/<slug> — inlined here rather than computed via programHref()
   *  so this stays a plain data array: importing programs.ts at module scope
   *  would drag its server fetch layer into MobileNav's client bundle (see
   *  this file's header comment). */
  href: string;
}

// Transcribed from education.ams.com.kh's live `#menu-ams-economy-secondary`
// (2026-08-26, third pill added 2026-08-28 — the live menu grew a member
// between those two dates) — the WordPress menu is still named/id'd "AMS
// ECONOMY SECONDARY" (a leftover slot name from the Economy theme this site
// forked from), but its actual items are this site's own programs, not
// Economy's: អនាគត/ពន្លកបៃតង, each a real `movie` post on this backend (ids
// 19929/2930); កម្ពុជា 360° (menu-item-22509) is a plain WP `program` page,
// no matching postId/tvShowId pinned elsewhere the way the other two have.
// Colors read straight from the live customizer CSS
// (`#menu-ams-economy-secondary .menu-item:nth-child(N) a{background-color:…}`);
// #6068d7 for អនាគត also matches the homepage's own
// `[cover-digital-program tvshow-id="21613" bg-color="#6068d7"]` shortcode.
// Text is white on all three, matching the row's base rule.
const NAV_PILLS: NavPill[] = [
  { label: "អនាគត", background: "#6068d7", color: "#fff", slug: "anakot", href: "/program/anakot" },
  { label: "ពន្លកបៃតង", background: "#669230", color: "#fff", slug: "green-leaf", href: "/program/green-leaf" },
  { label: "កម្ពុជា 360°", background: "#c70003", color: "#fff", slug: "cambodia-360", href: "/program/cambodia-360" },
];

export async function getNavPills(): Promise<NavPill[]> {
  return NAV_PILLS;
}

// ─── Digital-content icon strip (row below the main nav) ──────────────────────

export interface ProgramIcon {
  title: string;
  image: string;
  slug: string;
  /** Destination configured on the WordPress menu item. */
  href: string;
}

/** Label that introduces the icon strip ("Digital content:"). */
export const PROGRAM_ICON_LABEL = "មាតិកាឌីជីថល:";

/** The WordPress menu that renders as `#menu-secondary-nav-v3-menu` on the
 * live Economy homepage. Its rows own the order, labels, destinations and logo
 * attachments, so adding or editing a menu item no longer requires a frontend
 * deploy. Core menu REST is private; fast.php's allow-listed `pub-menu`
 * resource exposes only this already-public navigation data. */
export async function getProgramIcons(): Promise<ProgramIcon[]> {
  const [{ fastPublicFetch }, { PROGRAM_ICON_MENU }, { fetchRenderedProgramIcons }, { CURATED_PROGRAMS }, { getProgramSlugs }] =
    await Promise.all([
      import("./api/fast-public"),
      import("./admin/constants"),
      import("./api/program-menu"),
      import("./program-curation"),
      import("./programs"),
    ]);

  // WordPress's own menu can (and does — see the digital-literacy 2026-08-28
  // incident) keep pointing at a program post someone has since deleted. Drop
  // any icon that resolves to a /program/<slug> we can't actually route,
  // rather than shipping visitors a dead link straight off the header.
  const routable = new Set(await getProgramSlugs());
  const isLive = (icon: ProgramIcon) => {
    const slug = /^\/program\/([^/?#]+)/.exec(icon.href)?.[1];
    return !slug || routable.has(decodeURIComponent(slug));
  };

  try {
    // Lazy because MobileNav is a Client Component that value-imports the
    // label and types from this module. A top-level server fetch import would
    // pull the API layer into that client bundle.
    const env = await fastPublicFetch<{ data?: { items?: FastMenuItem[] } }>(
      "pub-menu",
      { menu: PROGRAM_ICON_MENU },
      { revalidate: 3600, tags: ["menu"] },
    );

    return (env.data?.items ?? [])
      .map((item) => toProgramIcon(item, CURATED_PROGRAMS))
      .filter((icon): icon is ProgramIcon => icon !== null)
      .filter(isLive);
  } catch {
    // The live plugin may not have the Economy menu in its allow-list yet.
    // Read the same menu from the public WordPress markup during that rollout
    // gap; if WordPress itself is unavailable, keep this decoration optional.
    return fetchRenderedProgramIcons()
      .then((icons) => icons.map((icon) => ({ ...icon, href: localMenuHref(icon.href, CURATED_PROGRAMS) })).filter(isLive))
      .catch(() => []);
  }
}

interface FastMenuImage {
  source_url?: string;
  sizes?: Record<string, { source_url?: string }>;
}

interface FastMenuItem {
  id: number;
  title: string;
  url: string;
  meta?: Record<string, string>;
  images?: Record<string, FastMenuImage>;
}

/** A row without an attached icon is intentionally absent from the visual
 * strip. This matches WordPress's menu-image output and the admin's existing
 * “clear icon” behavior. */
interface CuratedMenuProgram {
  slug: string;
  wpHref: string;
}

function toProgramIcon(item: FastMenuItem, curated: CuratedMenuProgram[]): ProgramIcon | null {
  const image = menuImageUrl(item.images, item.meta?.["_menu_item_image_size"]);
  if (!image) return null;

  return {
    title: item.title,
    image,
    slug: `menu-${item.id}`,
    href: localMenuHref(item.url, curated),
  };
}

/** Route WordPress program URLs through this frontend's `/program/<slug>`
 * namespace. The curated table wins because several WordPress paths cannot be
 * derived reliably; a new, ordinary `/movie/<slug>` falls back to that slug.
 * Non-program WordPress pages (such as Read News) remain absolute because this
 * frontend has no matching route and localizing them would create another 404. */
function localMenuHref(href: string, curated: CuratedMenuProgram[]): string {
  try {
    const url = new URL(href);
    if (url.hostname !== "education.ams.com.kh") return href;

    const pathKey = (value: string) => value.replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "");
    const curatedMatch = curated.find((program) => pathKey(program.wpHref) === pathKey(url.pathname));
    if (curatedMatch) return `/program/${curatedMatch.slug}`;

    const ordinaryMovie = /^\/(?:movie|tv-show)\/([^/]+)\/?$/i.exec(url.pathname);
    if (ordinaryMovie) {
      try {
        return `/program/${decodeURIComponent(ordinaryMovie[1])}`;
      } catch {
        return `/program/${ordinaryMovie[1]}`;
      }
    }

    if (url.pathname.startsWith("/program/")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return href;
  } catch {
    return href;
  }
}

/** Use the rendition selected on the WordPress menu item. Falling back to the
 * attachment's source URL also covers SVGs and items configured as `full`. */
function menuImageUrl(images: FastMenuItem["images"], sizeName?: string): string {
  for (const image of Object.values(images ?? {})) {
    const sized = sizeName ? image.sizes?.[sizeName]?.source_url : undefined;
    if (sized) return sized;
    if (image.source_url) return image.source_url;
  }
  return "";
}

// ─── Program posters ─────────────────────────────────────────────────────────

/** `slug` must exist in the program registry (src/lib/programs.ts) — these
 *  posters link to /program/<slug>. */
export interface FeaturedProgram {
  slug: string;
  title: string;
  year: string;
  image: string;
  href?: string;
}

/**
 * Every AMS program that has poster art, in the order WordPress lists them.
 *
 * ONE list, because live drives every poster slot on the site from one ordered
 * set and simply cuts it at a different length per slot — the counts nest
 * exactly: 8 ⊂ 9 ⊂ 15 ⊂ 18 ⊂ 20. So each surface takes a PREFIX of this array
 * (see POSTER_COUNT) rather than owning its own list.
 *
 * This used to hold nine, which is why the poster carousel showed half the
 * programs it should and why the two ranked lists below it were identical to
 * each other where live's differ. The nine were, by coincidence, exactly live's
 * ranked list — the longer slots were never modelled at all.
 *
 * The posters are the CMS's `-300x450` rendition (a 2x of the base -150x225
 * crop): correctly framed, and sharp at the 224px the carousel renders them at.
 * The full-size originals are a taller aspect and mis-crop.
 */
const PROGRAM_POSTERS: FeaturedProgram[] = [
  { slug: "learn-the-world", title: "Learn The World", year: "2025", image: "https://s3.ams.com.kh/infotainment/2025/11/01_LNTW_PWPF-300x450.jpg" },
  { slug: "jroung-phnom-penh", title: "ជ្រុងមួយនៃភ្នំពេញ", year: "2025", image: "https://s3.ams.com.kh/infotainment/2025/08/Program-Web-Profile-3-300x450.jpg" },
  { slug: "klib-sne", title: "ក្លឹបស្នេហ៍", year: "2025", image: "https://s3.ams.com.kh/infotainment/2025/02/01_CSNS01_PWPF-300x450.jpg" },
  { slug: "me-noam-rueng", title: "មេនាំរឿង", year: "2025", image: "https://s3.ams.com.kh/infotainment/2025/02/01_MOTS01_PWPF-3-300x450.jpg" },
  { slug: "athkombang-krom-mekh", title: "អាថ៌កំបាំងក្រោមមេឃ", year: "2023", image: "https://s3.ams.com.kh/infotainment/2025/02/01_MYSSO2_PWPF-300x450.jpg" },
  { slug: "oun-khlach", title: "អូនខ្លាច", year: "2024", image: "https://s3.ams.com.kh/infotainment/2024/10/01_FECUS01_PWPF-300x450.jpg" },
  { slug: "daily-feed", title: "កម្សាន្តខ្លីៗ", year: "2022", image: "https://s3.ams.com.kh/infotainment/2023/01/01_DAFS02_PWPRO-300x450.jpg" },
  { slug: "the-fact", title: "រឿងពិត", year: "2022", image: "https://s3.ams.com.kh/infotainment/2023/01/01_EPW2-300x450.jpg" },
  { slug: "tamchet-momo", title: "តាមចិត្ត MoMo", year: "2022", image: "https://s3.ams.com.kh/infotainment/2022/05/02_TAM_CHETMOMO_WEB-PROFILE-300x450.jpg" },
  // ── everything below here was missing entirely ──
  { slug: "cicada-agent", title: "ភាពយន្តកំប្លែង Cicada Agent", year: "2022", image: "https://s3.ams.com.kh/infotainment/2022/04/01_CICADA-AGENT_WEB-PROFILE-300x450.jpg" },
  { slug: "ladyfrog", title: "ព្រះនាងកង្កែប", year: "2023", image: "https://s3.ams.com.kh/infotainment/2022/03/04_PRINCE-LADY-FROG-WEB-PROFILE-300x450.jpg" },
  // The poster comes from vanna-yeatra's MOVIE post (20275). The registry points
  // /program/vanna-yeatra at its TV_SHOW post (14450) — the only program on the
  // site that has both, and the two carry different art.
  { slug: "vanna-yeatra", title: "វនយាត្រា", year: "2023", image: "https://s3.ams.com.kh/infotainment/2021/10/04_Vanayatra-profile-300x450.jpg" },
  { slug: "kalai-mode", title: "កាឡៃម៉ូដ", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/10/Kalai-mod-V2.2-300x450.jpg" },
  { slug: "reaction", title: "ចង់ដឹងរឿងគេ", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/05_REACTION_WEB-PROFILE-300x450.jpg" },
  { slug: "green-box", title: "ប្រអប់បៃតង", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/Green-Box-V2..1jpg-300x450.jpg" },
  { slug: "1-minute-for-health", title: "១នាទីដើម្បីសុខភាព និងសម្រស់", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/02_1MN_FOR_HEALTH_PROFILE-Color-version_SEP-22-300x450.jpg" },
  { slug: "studio-11", title: "Studio 11", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/STUDIO-11-V2-1-300x450.jpg" },
  { slug: "obsok", title: "អផ្សុក", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/OBSOK_Profile_3D_01-300x450.jpeg" },
  { slug: "fact-check", title: "ពិតអត់", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/Fact-check-V2.1-300x450.jpg" },
  { slug: "unlock-the-life", title: "បើកសោជីវិត", year: "2021", image: "https://s3.ams.com.kh/infotainment/2021/09/02_UNLOCK-THE-LIFE_Profile-300x450.jpg" },
];

/**
 * How many posters each surface shows. Every count is a prefix length into
 * PROGRAM_POSTERS — these are the lengths the live site cuts that list at, read
 * off its markup, not numbers we chose.
 */
export const POSTER_COUNT = {
  /** កម្មវិធីពិសេសរបស់ AMS INFOTAINMENT — the grid in the dark home band. */
  special: 8,
  /** ភាពយន្តពេញនិយម — the ranked list beside it. */
  popular: 9,
  /** សម្រាប់លោកអ្នក — the landing pages' band. */
  landingBand: 15,
  /** ជ្រើសរើសកម្មវិធីដែលលោកអ្នកចូលចិត្ត — home / program / episode carousel. */
  carousel: 18,
  /** The strip below an article — the only slot that shows every program. */
  articleStrip: 20,
} as const;

/** The first `limit` posters — plus, on the "all programs" surfaces (carousel
 *  length and up), any published program the curated list doesn't know yet.
 *
 *  That's the "new programs default to the carousel" rule: a program created
 *  in the dashboard appears in the poster carousel and the article strip
 *  automatically (once it has PORTRAIT featured-image art — the same 2:3 the
 *  Create form asks for), while the two ranked lists (special 8 / popular 9)
 *  and the nav pills / icon strip stay curated here in code. */
export async function getFeaturedPrograms(limit: number = PROGRAM_POSTERS.length): Promise<FeaturedProgram[]> {
  const base = PROGRAM_POSTERS.slice(0, limit);
  if (limit < POSTER_COUNT.carousel) return base;

  const { getProgramRegistry } = await import("./programs");
  const curated = new Set(PROGRAM_POSTERS.map(p => p.slug));
  const extras = (await getProgramRegistry())
    .filter(r => !curated.has(r.slug) && r.poster)
    .map(r => ({ slug: r.slug, title: r.title, year: r.year, image: r.poster }));
  return [...base, ...extras];
}
