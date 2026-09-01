// Low-level HTTP client for the AMS Education WordPress REST API.
// All calls are server-side (Server Components / Route Handlers), so the base
// URL stays a server-only env var and the browser never sees it.

const BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public path: string,
  ) {
    super(`AMS API ${statusCode} for ${path}`);
    this.name = "ApiError";
  }
}

export interface CacheOpts {
  /** Seconds before ISR revalidation, or false to cache until a tag is invalidated. */
  revalidate: number | false;
  /** Cache tags for on-demand invalidation via /api/revalidate. */
  tags?: string[];
}

/**
 * WHEN A GETTER MAY SWALLOW ITS ERROR — the rule the whole public read layer
 * follows, because `catch -> []` was once the answer everywhere.
 *
 * Every public read is ISR-cached, so a failed fetch is not a momentary blip:
 * whatever it renders is WRITTEN INTO A STATIC PAGE and served for the full
 * revalidate window — an hour on most routes, or indefinitely on Program,
 * unless the publish webhook busts the tag.
 * That makes `catch -> []` a decision about what to PUBLISH, and it is right for
 * only one of the three kinds of read this site makes:
 *
 *  1. DECORATION — a block the page stands without: the header menu, a sidebar
 *     widget, the ក្រុមការងារ strip, the article page's related columns.
 *     `catch -> []` is correct. One dead block beats a dead page.
 *
 *  2. THE PAGE'S SUBJECT — the list a listing page exists to show. Swallowing
 *     writes "មិនទាន់មានអត្ថបទក្នុងប្រភេទនេះទេ" onto a category that holds 7,000
 *     articles, and the page then reads as authoritatively empty rather than
 *     broken. Nothing retries, because nothing failed. These must THROW.
 *
 *  3. EXISTENCE — anything a route turns into `notFound()`: the term list behind
 *     resolveCategory, the author list behind getAuthorBySlug, the registry
 *     behind routedProgram, the episode list behind getEpisodePage. Swallowing
 *     here bakes a 404 onto a URL that exists — worse than either case above,
 *     because a 404 is cacheable, indexable, and acted on by search engines.
 *     These must THROW.
 *
 * Throwing is the documented ISR contract, not a crash. Next 16: "If an error is
 * thrown while attempting to revalidate data, the last successfully generated
 * data will continue to be served from the cache. On the next subsequent
 * request, Next.js will retry revalidating the data." So a live page keeps
 * serving its last good copy and retries, instead of overwriting itself with an
 * empty one — and a page with no cached copy yet answers 500, which (unlike a
 * 404) is not cached and not indexed.
 *
 * The cost lands at BUILD time, where an uncaught error fails the deploy. That
 * is the intended trade: a failed deploy leaves the previous one live, where a
 * successful one would ship the empty pages. It is also why `generateStaticParams`
 * deliberately stays on the SWALLOWING variants — prebuilding nothing degrades to
 * on-demand rendering, which is still correct, so a blip during a build can't
 * fail the deploy over pages that would have worked anyway.
 *
 * Naming, where a read serves both kinds of caller: `fetchX` throws (the raw
 * read), `getX` degrades (the view a decoration surface wants).
 */

/**
 * A cache tag guaranteed to fit Next's 256-char limit.
 *
 * A percent-encoded Khmer slug alone can blow past that limit — the build
 * warned on `article:%e1%9e%97…`, built those pages without the tag, and left
 * them impossible to invalidate on demand. Short tags pass through untouched
 * (so `article:some-latin-slug` stays readable); long ones keep their prefix
 * and hash the rest. /api/revalidate normalizes incoming tags through this
 * same function, so callers can keep sending the raw slug.
 */
export function safeTag(tag: string): string {
  if (tag.length <= 200) return tag;
  // djb2 over the whole tag, plus its length — cheap, stable, and unique
  // enough for a tag namespace this size.
  let h = 5381;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) + h + tag.charCodeAt(i)) >>> 0;
  const prefix = tag.slice(0, tag.indexOf(":") + 1);
  return `${prefix}h-${h.toString(36)}-${tag.length}`;
}

/** Normalize every fetch tag at the cache boundary. Keeping this here means a
 * caller cannot accidentally create an over-long tag that /api/revalidate
 * later hashes to a different value. */
export function safeTags(tags?: string[]): string[] | undefined {
  return tags?.map(safeTag);
}

/**
 * Typed fetch against the API. Returns the parsed JSON body.
 *
 * IMPORTANT (Next 16): `fetch` is NOT cached by default, so we ALWAYS pass
 * `next.revalidate`. Omitting it would make the calling route dynamic and
 * silently defeat ISR.
 */
export async function apiFetch<T>(path: string, { revalidate, tags }: CacheOpts): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate, tags: safeTags(tags) },
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}
