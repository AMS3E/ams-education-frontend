// The plain WordPress pages the footer links to.
//
// Seven URLs — /advertising, /contact, /question, /jobs, /privacy-policy,
// /terms-conditions, /cookies — all 200 on the live site and all 404 on ours
// until this existed. They are ordinary WP pages with nothing but a title and a
// body, so one route reading `content.rendered` serves the lot.

import { apiFetch } from "./api/client";
import { decodeEntities } from "./api/mappers";

/**
 * The pages we serve, by the URL path they live at.
 *
 * A whitelist rather than "any page WordPress has": the CMS holds ~55 pages, and
 * most of them are ad mock-ups, catalogue drafts and duplicate home pages
 * (`ads-test`, `home-page2`, `krs-amdvertisemen-v-1`). Resolving pages
 * generically would publish all of that. These seven are the ones the site
 * actually links to.
 */
const STATIC_PAGES = [
  "advertising",
  "contact",
  "question",
  "jobs",
  "privacy-policy",
  "terms-conditions",
  "cookies",
] as const;

interface WpPageSummary {
  id: number;
  slug: string;
  link: string;
}

interface WpPageDetail {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
}

export interface StaticPage {
  path: string;
  title: string;
  /** Gutenberg HTML, same shape as an article body. */
  html: string;
}

/** "https://education.ams.com.kh/terms-conditions/" -> "terms-conditions" */
function toPath(link: string): string {
  return link.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+|\/+$/g, "");
}

/**
 * URL path -> page id, for every page in the CMS.
 *
 * Keyed on the page's PERMALINK, not its slug, because for one of the seven they
 * disagree: `/terms-conditions/` is served by a page whose slug is the
 * percent-encoded Khmer ដំណឹងតាមច្បាប់, so `?slug=terms-conditions` returns []
 * and looks for all the world like the page doesn't exist. The permalink is the
 * only field that reliably says where a page actually lives — the same reason
 * getCategoryTerms() reads a term's `link` rather than trusting its slug.
 *
 * THROWS. An empty index answers "no such page" for all seven, and the root
 * catch-all turns that into a 404 — case 3 in the error-handling note in
 * api/client.ts.
 */
async function fetchPageIndex(): Promise<Map<string, number>> {
  const raw = await apiFetch<WpPageSummary[]>("/wp/v2/pages?per_page=100&_fields=id,slug,link", {
    revalidate: 3600,
    tags: ["pages"],
  });
  return new Map(raw.map((p) => [toPath(p.link), p.id]));
}

/** A whitelisted page by its URL path, or null for anything else (which the
 *  route turns into a 404).
 *
 *  The whitelist test comes FIRST and answers without a request, which is what
 *  keeps this safe to throw from: the root catch-all calls it for every unclaimed
 *  URL on the site, and only these seven paths ever reach WordPress. So a null is
 *  always "not one of our pages" and never "the CMS was unreachable" — the
 *  second case throws, and /contact keeps serving its last good copy instead of
 *  turning into a 404. */
export async function getStaticPage(path: string): Promise<StaticPage | null> {
  if (!(STATIC_PAGES as readonly string[]).includes(path)) return null;

  const id = (await fetchPageIndex()).get(path);
  if (!id) return null;

  const page = await apiFetch<WpPageDetail>(`/wp/v2/pages/${id}?_fields=id,title,content`, {
    revalidate: 3600,
    tags: ["pages", `page:${path}`],
  });
  return {
    path,
    title: decodeEntities(page.title?.rendered ?? "").trim(),
    html: page.content?.rendered ?? "",
  };
}

/** The seven paths, split into segments for generateStaticParams. */
export const getStaticPagePaths = (): string[][] => STATIC_PAGES.map((p) => [p]);
