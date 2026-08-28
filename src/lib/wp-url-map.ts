// Mapping a WordPress URL onto one of OUR routes.
//
// Every link inside an embedded slider is an absolute WordPress permalink, and
// following one inside the iframe walks the visitor off the frontend entirely
// (AUDIT.md Tier 2 §14). The embed pages therefore forward clicks to the parent
// as postMessage instead, and the parent decides where they land — which is what
// this function answers.
//
// It lives here rather than in HeroEmbed because the article-slider frames need
// exactly the same answer, and two copies of "which WP paths are ours" is the
// kind of duplication that rots the moment a route moves.

// The CURATED table, not the live registry: this is consumed by Client
// Components, and slider link targets only ever point at the long-established
// programs whose WP URLs are pinned there.
import { CURATED_PROGRAMS } from "@/lib/program-curation";
import { programHref } from "@/lib/programs";

/**
 * WordPress origin that serves the embeds and owns these permalinks.
 *
 * Trailing slash stripped defensively: this is compared against `MessageEvent.origin`
 * (which is never slash-terminated) in HeroEmbed/SrEmbed's postMessage listeners, and a
 * stray trailing slash on NEXT_PUBLIC_WP_ORIGIN silently breaks that comparison forever —
 * no error, the hero just never receives its height and collapses after the 10s timeout.
 */
export const WP_ORIGIN = (process.env.NEXT_PUBLIC_WP_ORIGIN ?? "https://economy.ams.com.kh").replace(/\/+$/, "");

const stripSlash = (p: string) => p.replace(/\/+$/, "") || "/";

/**
 * A clicked slide's WordPress URL, mapped onto OUR route — or null when there
 * is no equivalent and the link should open on WordPress (in a new tab, so the
 * app stays put).
 *
 * Programs go through the registry: their WP permalinks are irregular
 * (/program/digital/obsok, /movie/program-digital-oun-khlach/) and the registry
 * already records each one as `wpHref`. Category and landing paths are shared
 * with WordPress verbatim, so they pass straight through. Article permalinks do
 * NOT match our /article/<slug> scheme and fall to the new-tab path.
 */
export function mapWpUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== WP_ORIGIN) return null;

  const path = stripSlash(url.pathname);
  if (path === "/") return "/";

  const program = CURATED_PROGRAMS.find((p) => stripSlash(new URL(p.wpHref).pathname) === path);
  if (program) return programHref(program.slug);

  if (path.startsWith("/category/") || path.startsWith("/author/")) return path;
  return null;
}
