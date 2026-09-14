// Which Slider Revolution slider each landing page shows.
//
// Read off the live pages' own markup (`data-alias` on the slider wrapper) —
// several pages share one slider, which is the CMS's arrangement, not a typo.
// The homepage alias is exported separately because HomeView has no landing
// path. /sr-embed validates every value here against Slider Revolution's own
// module table before rendering it.

// Read off the live homepage's own `data-alias` (education.ams.com.kh, 2026-09-14)
// — "cover-apr202021-11" was stale: still a real slider (/sr-embed answers 200 for
// it), just not the one the CMS currently has on the front page.
export const HOME_HERO_ALIAS = "-Modern-Library";

const HERO_ALIASES: Record<string, string> = {
  "entertainment-news": "cover-animation-14-12",
  "life-style": "cover-animation-11",
  celebrity: "entainment-home-page-1",
  "movie-and-music": "entainment-home-page-1-1",
  culture: "entainment-home-page-1-1",
  strange: "entainment-home-page-1-1-1",
  "life-style/travel": "life-style-home-page-1",
  "life-style/architecture": "life-style-home-page-1",
  "life-style/love-and-relation": "life-style-home-page-1-1",
  "life-style/health-and-beauty": "life-style-home-page-1-1-1",
  "life-style/life-tips": "celebrity-new-1",
};

/** The slider alias for a landing path ("life-style/travel"), or undefined for
 * the homepage slider. */
export const heroAlias = (path: string): string | undefined => HERO_ALIASES[path];
