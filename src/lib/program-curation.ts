// The CURATED program table — the hand-verified slug/id/URL pinning for the
// programs that existed when /program/<slug> routing was built. Split out of
// programs.ts when the registry went dynamic (live-fetched from WordPress) so
// that:
//
//   1. Existing public URLs never change: a curated entry's `slug` is OURS,
//      not WordPress's (the WP slugs are inconsistent — two aren't even under
//      /program/, and live's `/program/learn/theworld` would reduce to the
//      meaningless "theworld"). The registry pins these by postId.
//   2. HeroEmbed (a Client Component) can keep mapping the WP slider's link
//      targets onto our routes without shipping any server code — this module
//      is plain data, importable from anywhere.
//   3. The public site degrades to exactly the old hardcoded behaviour if the
//      registry fetch ever fails.
//
// A program CREATED from the dashboard doesn't need an entry here — the
// registry routes it by its WordPress slug. Add a row only to OVERRIDE what
// WordPress says (typically: pin a nicer slug).
//
// WordPress models a program as a MasVideos `movie` post (or, for vanna-yeatra
// alone, a `tv_show` post). Crucially the post carries a SEPARATE tv_show id
// which is the only handle on its episode list: `postId` and `showId` are
// different numbers and are NOT interchangeable. Both are inlined on the live
// program page — `postid-…` in the <body> class, and `khiWatch.showId` in a
// <script> — which is where the table below came from.

export type ProgramPostType = "movie" | "tv_show";

export interface CuratedProgram {
  /** Our route slug: /program/<slug>. Overrides the WordPress post slug. */
  slug: string;
  /** Canonical WordPress title. Used as an API-failure fallback. */
  title: string;
  postType: ProgramPostType;
  /** Addresses the program's own post (title, description, poster). */
  postId: number;
  /** Addresses its episode list. Different number from postId. */
  showId: number;
  /** The live WordPress page this mirrors — what HeroEmbed matches slider
   *  links against. Kept for provenance. */
  wpHref: string;
}

const WP = "https://education.ams.com.kh";

export const CURATED_PROGRAMS: CuratedProgram[] = [
  // Colored nav pills (top-right of the header bar).
  // These two Program movie records do not expose `_khi_tv_show_id` through
  // public REST, so pin their episode-container relationships here. Their
  // titles, excerpts and featured images still come from the Program records.
  { slug: "khmer-insider", title: "Khmer Insider", postType: "movie", postId: 2930, showId: 21395, wpHref: `${WP}/program/khmer-insider` },
  { slug: "financial-street", title: "វិថីហិរញ្ញវត្ថុ", postType: "movie", postId: 88073, showId: 88448, wpHref: `${WP}/program/financial-street` },
  { slug: "financial-talk", title: "គន្លឹះហិរញ្ញវត្ថុ", postType: "movie", postId: 165716, showId: 165714, wpHref: `${WP}/program/financial-talk` },
  // Education's menu keeps the older friendly paths below, while the current
  // movie rows use unrelated REST slugs. Pin by post id so those public menu
  // links resolve to stable local routes instead of being dropped by the
  // routability guard. `/movie/digital-literacy` is itself stale/404 on the
  // WordPress theme, but its replacement movie + episode container are both
  // published and are the program the menu still labels អក្ខរកម្មឌីជីថល.
  { slug: "digital-literacy", title: "អក្ខរកម្មឌីជីថល", postType: "movie", postId: 103367, showId: 103362, wpHref: `${WP}/movie/digital-literacy` },
  { slug: "industry4.0", title: "ឧស្សាហកម្ម ៤.០", postType: "movie", postId: 100350, showId: 100358, wpHref: `${WP}/movie/industry4.0` },
  { slug: "financial-literacy", title: "ចំណេះដឹងហិរញ្ញវត្ថុ", postType: "movie", postId: 134265, showId: 134267, wpHref: `${WP}/movie/financial-literacy` },
  { slug: "our-reources", title: "ធនធានស្រុកយើង", postType: "movie", postId: 134075, showId: 134048, wpHref: `${WP}/program/our-reources` },
  { slug: "hot-topic", title: "Hot Topic", postType: "movie", postId: 76188, showId: 76126, wpHref: `${WP}/program/hot-topic` },
  { slug: "unlock-the-life", title: "បើកសោជីវិត", postType: "movie", postId: 14428, showId: 14288, wpHref: `${WP}/program/unlock-the-life` },
  { slug: "reaction", title: "ចង់ដឹងរឿងគេ", postType: "movie", postId: 16508, showId: 16518, wpHref: `${WP}/program/reaction` },
  { slug: "vanna-yeatra", title: "វនយាត្រា", postType: "tv_show", postId: 14450, showId: 14450, wpHref: `${WP}/program/vanna-yeatra` },
  { slug: "cicada-agent", title: "ភាពយន្តកំប្លែង Cicada Agent", postType: "movie", postId: 54388, showId: 54290, wpHref: `${WP}/program/cicada-agent` },
  { slug: "ladyfrog", title: "ព្រះនាងកង្កែប", postType: "movie", postId: 47162, showId: 86836, wpHref: `${WP}/program/ladyfrog` },

  // មាតិកាឌីជីថល icon strip (row below the main nav).
  { slug: "learn-the-world", title: "Learn The World", postType: "movie", postId: 204700, showId: 204703, wpHref: `${WP}/program/learn/theworld` },
  { slug: "jroung-phnom-penh", title: "ជ្រុងមួយនៃភ្នំពេញ", postType: "movie", postId: 196773, showId: 196771, wpHref: `${WP}/program/connerof/pp` },
  { slug: "athkombang-krom-mekh", title: "អាថ៌កំបាំងក្រោមមេឃ", postType: "movie", postId: 181362, showId: 181312, wpHref: `${WP}/program/digital/mysteries-in-the-world/` },
  { slug: "oun-khlach", title: "អូនខ្លាច", postType: "movie", postId: 166586, showId: 166587, wpHref: `${WP}/movie/program-digital-oun-khlach/` },
  { slug: "me-noam-rueng", title: "មេនាំរឿង", postType: "movie", postId: 181412, showId: 181395, wpHref: `${WP}/movie-program-digital-movie-trend/` },
  { slug: "daily-feed", title: "កម្សាន្តខ្លីៗ", postType: "movie", postId: 84595, showId: 84591, wpHref: `${WP}/program/digital/daily-feed` },
  { slug: "the-fact", title: "រឿងពិត", postType: "movie", postId: 84593, showId: 84589, wpHref: `${WP}/program/digital/the-fact` },
  { slug: "1-minute-for-health", title: "១នាទីដើម្បីសុខភាព និងសម្រស់", postType: "movie", postId: 14610, showId: 14570, wpHref: `${WP}/program/digital/1-minute-for-health/` },
  { slug: "obsok", title: "អផ្សុក", postType: "movie", postId: 14562, showId: 14512, wpHref: `${WP}/program/digital/obsok/` },
  { slug: "green-box", title: "ប្រអប់បៃតង", postType: "movie", postId: 14644, showId: 14616, wpHref: `${WP}/program/digital/green-box/` },
  { slug: "fact-check", title: "ពិតអត់", postType: "movie", postId: 14516, showId: 19363, wpHref: `${WP}/program/digital/fact-check/` },
  { slug: "studio-11", title: "Studio 11", postType: "movie", postId: 14608, showId: 14564, wpHref: `${WP}/program/digital/studio-11/` },
  { slug: "tamchet-momo", title: "តាមចិត្ត MoMo", postType: "movie", postId: 59974, showId: 69616, wpHref: `${WP}/program/digital/tamchet-momo` },

  // In the poster carousel but neither a nav pill nor an icon. Both of these
  // shows' tv_shows currently return no episodes, so their pages render without
  // a carousel — which is what live does with them too.
  { slug: "klib-sne", title: "ក្លឹបស្នេហ៍", postType: "movie", postId: 181454, showId: 181460, wpHref: `${WP}/program/club-snes/` },
  { slug: "kalai-mode", title: "កាឡៃម៉ូដ", postType: "movie", postId: 19503, showId: 14514, wpHref: `${WP}/program/digital/kalai-mode` },

  // Added 2026-08-06, when the icon strip went live-driven and this program
  // appeared in it for the first time. It needs a row for THREE separate
  // reasons, each measured:
  //
  //  1. Its post_name is percent-encoded Khmer, so the derived route would be
  //     /program/ស្ថាបត្យកម្មសកល — while the menu links /tv-show/global_architecture/,
  //     whose last segment ("global_architecture") is in the registry under no
  //     slug at all. Pinning wpHref lets wp-url-map resolve the menu URL to
  //     this row instead of guessing from the path.
  //  2. It is modelled as BOTH a movie (221836) and a tv_show (221840), like
  //     vanna-yeatra. The tv_show is the one carrying episodes.
  //  3. The movie's `_khi_tv_show_id` is 196771 — ជ្រុងមួយនៃភ្នំពេញ's show, not
  //     its own (measured: 196771 returns 13 Phnom Penh episodes, 221840
  //     returns this program's 2). Pinning showId here overrides that bad meta.
  //     The underlying value is still wrong IN WORDPRESS and is worth fixing
  //     there; until then the movie row also collides with jroung's showId.
  { slug: "global-architecture", title: "ស្ថាបត្យកម្មសកល", postType: "tv_show", postId: 221840, showId: 221840, wpHref: `${WP}/tv-show/global_architecture/` },
];
