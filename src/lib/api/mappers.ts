// Pure functions: raw WordPress shapes -> our domain types. The firewall between
// the API's field names and the rest of the app.
import type { ArticleRef, Article, CategoryLink } from "@/lib/articles";
import type { HomeCard } from "@/lib/home-data";
import type { WpArticleListItem, WpArticleDetail, WpCategory, WpImage, WpProgram } from "./wp-types";

/** Raw categories -> CategoryLink[]. `hrefs` maps a term id to its listing URL
 *  (src/lib/categories.ts) — keyed by id because the article-detail endpoint
 *  returns categories without a `slug`, so the id is the only join key that
 *  works on every endpoint. An unresolvable id yields a null href, and the
 *  label renders as plain text rather than a link that goes nowhere. */
const toCategoryLinks = (cats: WpCategory[] | undefined, hrefs: Map<number, string>): CategoryLink[] =>
  (cats ?? []).map(c => ({ id: c.id, name: c.name, href: hrefs.get(c.id) ?? null }));

// WordPress core endpoints (unlike the custom `web/*` ones) return HTML-escaped,
// tag-wrapped strings. Numeric refs cover almost everything the CMS emits —
// `&#8230;` is the only one currently live — but named refs are cheap to accept.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** `"<p>one</p>\n<p>two</p>"` -> `["one", "two"]`. Yields [] for the programs
 *  WordPress has no excerpt for (learn-the-world, jroung-phnom-penh). */
export function htmlToParagraphs(html: string): string[] {
  return html
    .split(/<\/p>/i)
    .map(chunk => decodeEntities(chunk.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** "2026-07-08 10:14:12" -> "08/07/2026". Falls back to the raw string. */
function formatDate(dt?: string): string {
  const parts = dt?.slice(0, 10).split("-");
  return parts && parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : (dt ?? "");
}

/** "2026-07-14 16:23:52" -> "2026-07-14T16:23:52+07:00".
 *
 *  WordPress hands these back as wall-clock time in Asia/Phnom_Penh with no zone
 *  on them. `article:published_time` has to be unambiguous, so stamp the offset
 *  rather than letting a parser read it as UTC — which would publish every
 *  article seven hours early. Cambodia has no DST, so +07:00 is a constant. */
function toIsoDate(dt?: string): string {
  return dt ? `${dt.trim().replace(" ", "T")}+07:00` : "";
}

/** The date a card shows: "23/07/2026", the same format the article page prints.
 *
 *  The list endpoints send TWO date fields. `publish_date` is a real timestamp;
 *  `post_date` is a relative phrase WordPress rendered when we fetched
 *  ("2ម៉ោងមុន"), which then freezes in our cache — an ISR page held for an hour
 *  keeps insisting it is two hours old. So the timestamp wins whenever it is
 *  there, and the phrase is only a fallback for a plugin too old to send one.
 *
 *  `realDate`, when present, wins over both: education.ams.com.kh's AMS3E-API
 *  never sends `publish_date` on ANY list route (measured 2026-08-27, both
 *  `get-articles` and `get-article-by-category-slug`), so every card there
 *  fell back to the frozen relative phrase. `realDatesById` in articles.ts
 *  backfills it with a real timestamp from core `/wp/v2/posts`. */
function cardDate(a: WpArticleListItem, realDate?: string): string {
  if (realDate) return formatDate(realDate);
  return a.publish_date ? formatDate(a.publish_date) : a.post_date;
}

/** List item -> ArticleRef (the card/row/feature model). */
export function mapArticleRef(a: WpArticleListItem, categoryHrefs: Map<number, string>, realDate?: string): ArticleRef {
  return {
    slug: a.slug,
    title: a.title,
    image: a.thumbnail,
    date: cardDate(a, realDate),
    categories: toCategoryLinks(a.categories, categoryHrefs),
    description: a.description,
  };
}

/** List item -> HomeCard (the homepage grid model). */
export function mapHomeCard(a: WpArticleListItem, categoryHrefs: Map<number, string>): HomeCard {
  return {
    slug: a.slug,
    src: a.thumbnail,
    title: a.title,
    tags: toCategoryLinks(a.categories, categoryHrefs).slice(0, 3),
    date: cardDate(a),
  };
}

const NO_IMAGE: WpImage = { url: "", width: 0, height: 0 };

/** The release YEAR, in Phnom Penh time.
 *
 *  `release_date` is Unix seconds at midnight Asia/Phnom_Penh (UTC+7). Read in UTC
 *  it lands at 17:00 the previous day — the bug the live Vodi theme has — and for
 *  anything released on 1 January that means printing the WRONG YEAR, which is the
 *  only part of the date we show. */
function releaseYear(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Phnom_Penh", year: "numeric" }).format(
    new Date(unixSeconds * 1000),
  );
}

/** `movie`/`tv_show` post -> the program page's model. `fallback` supplies the
 *  title if WordPress ever returns a blank one; every other field may legitimately
 *  be absent, and the UI drops whatever is missing.
 *
 *  The featured-image slot is NOT reliably a poster. vanna-yeatra's tv_show has
 *  2560x398 landscape key art in it, and forcing that into a 2:3 poster frame
 *  squashes it. So classify by SHAPE: anything wider than it is tall is a
 *  backdrop that was filed in the wrong slot, and is used as one. */
export function mapProgram(
  d: WpProgram,
  fallback: { slug: string; title: string },
) {
  const poster = d.poster ?? NO_IMAGE;
  const backdrop = d.backdrop ?? NO_IMAGE;
  const featuredIsLandscape = poster.width > 0 && poster.width > poster.height;

  return {
    slug: fallback.slug,
    title: decodeEntities(d.title ?? "").trim() || fallback.title,
    description: htmlToParagraphs(d.description ?? ""),
    poster: featuredIsLandscape ? "" : poster.url,
    // Vodi's own backdrop field wins; a mis-filed landscape featured image is the
    // next best thing, and is better than nothing behind the hero.
    backdrop: backdrop.url || (featuredIsLandscape ? poster.url : ""),
    year: releaseYear(d.release_date ?? 0),
    schedule: (d.schedule ?? "").trim(),
  };
}

/** Detail object -> Article (the full detail-page model).
 *
 *  `depths` maps a category id to its depth in the taxonomy (see
 *  getCategoryDepths). It is what makes the breadcrumb correct: the endpoint
 *  returns an article's categories UNORDERED — a `culture` post arrives as
 *  [section, root, topic] — so the trail is built by sorting on depth and
 *  dropping the content-type root, never by array position. */
export function mapArticle(
  d: WpArticleDetail,
  slug: string,
  categoryHrefs: Map<number, string>,
  depths: Map<number, number>,
): Article {
  const cats = toCategoryLinks(d.categories, categoryHrefs);

  // Section (depth 1) then topic (depth 2). Depth 0 is the content-type root
  // (ព្រឹត្តិការណ៍ / បទយកការណ៍), which the live breadcrumb doesn't show either.
  const trail = cats
    .filter(c => (depths.get(c.id) ?? 0) > 0)
    .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0));

  const title = decodeEntities(d.title ?? "");

  return {
    id: d.id,
    slug,
    title,
    breadcrumb: [
      { label: "ទំព័រដើម", href: "/" },
      ...trail.map(c => ({ label: c.name, href: c.href })),
      // The article itself: the last crumb is where you already are, so it has
      // no destination and renders as text.
      { label: title, href: null },
    ],
    categories: cats,
    date: formatDate(d.publish_date),
    publishedAt: toIsoDate(d.publish_date),
    modifiedAt: toIsoDate(d.last_updated || d.publish_date),
    // Yoast's meta description when the editor wrote one, else the excerpt.
    description: decodeEntities(d.seo?.description || d.description || ""),
    // Placeholder: the detail endpoint carries no comment count (measured —
    // its keys are id/title/thumbnail/categories/dates/description/
    // post_content/author/seo). The real number comes from getCommentCount().
    commentCount: 0,
    featured: { src: d.thumbnail, badge: "AMS Economy" },
    bodyHtml: d.post_content ?? "",
    author: {
      name: d.author?.author_name ?? "AMS Economy",
      avatar: d.author?.profile ?? "",
      bio: d.author?.description ?? "",
    },
  };
}
