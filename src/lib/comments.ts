// Article comments, from WordPress core's `wp/v2/comments`.
//
// READING is plain core REST — only approved comments come back, threaded via
// `parent`. WRITING is in comment-action.ts ("use server" files can't export
// plain data getters).
//
// The COUNT is the one part on the fast path (see getCommentCount). The thread
// itself deliberately is NOT: `content.rendered` is `comment_text` filter
// output (wpautop, make_clickable, wptexturize), no filters run under
// SHORTINIT, and with zero comments on the site there is nothing to measure a
// SQL reimplementation against. A count has no such surface — it is one
// integer, and the row filter it needs is verifiable.

import { decodeEntities } from "./api/mappers";
import { ApiError } from "./api/client";
import { fastPublicFetch, withPublicRestFallback } from "./api/fast-public";

const BASE = process.env.API_BASE_URL ?? "https://economy.ams.com.kh/wp-json";

/** 1h floor (ISR-writes budget). This fetch's window CAPS the whole article
 *  route's ISR window — the shortest fetch on a page wins — so 300 here
 *  silently made every article page regenerate at 5 minutes. Posting busts
 *  `comments:<post>` on the spot, and a new comment waits on WP approval
 *  anyway, so hourly polling loses nothing. */
const cacheFor = (postId: number) => ({ revalidate: 3600, tags: ["comments", `comments:${postId}`] });

export interface Comment {
  id: number;
  parent: number;
  author: string;
  avatar: string;
  /** "13.04.2022" — same format the episode pages use for "Added". */
  date: string;
  /** Plain text. WordPress escapes commenter HTML, but the frontend renders
   *  text nodes anyway — a comment is user content, not our CMS's. */
  text: string;
}

interface WpComment {
  id: number;
  parent: number;
  author_name: string;
  author_avatar_urls?: Record<string, string>;
  date: string; // site-local "2026-07-13T14:46:50"
  content: { rendered: string };
}

function commentDate(dt: string): string {
  const parts = dt.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : dt;
}

/**
 * How many approved comments a post has — the number the article meta line
 * renders, and the ONLY thing the page reads today (the thread is behind a
 * commented-out CommentsSection).
 *
 * Worth its own getter rather than `(await getComments(id)).length`: that asked
 * WordPress for up to 100 full comment bodies, over REST, on the article
 * route's critical path — ~3.9s per ISR regeneration of any of ~10,500
 * articles, to render an integer that is currently 0 site-wide.
 *
 * Degrades to 0, which is what the page shows when it has no better answer.
 */
export async function getCommentCount(postId: number): Promise<number> {
  const cache = cacheFor(postId);
  try {
    return await withPublicRestFallback(
      `comments:${postId}`,
      async () => {
        const body = await fastPublicFetch<{ counts?: Record<string, number> }>(
          "pub-comment-counts",
          { post_id: postId },
          cache,
        );
        const n = body.counts?.[String(postId)];
        // The resource answers for every id it was asked about, so a missing
        // key means the shape changed — fall back rather than render NaN.
        if (typeof n !== "number") throw new ApiError(200, "fast:pub-comment-counts:no-such-id");
        return n;
      },
      async () => {
        // The count lives in the X-WP-Total HEADER, which apiFetch's json-only
        // contract throws away — so, as in wp-core.ts, this calls fetch itself.
        // per_page=1 because the rows are not wanted at all.
        const res = await fetch(`${BASE}/wp/v2/comments?post=${postId}&per_page=1&_fields=id`, {
          next: cache,
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new ApiError(res.status, `comments:${postId}`);
        return Number(res.headers.get("x-wp-total") ?? "0") || 0;
      },
    );
  } catch {
    return 0;
  }
}

/** A post's approved comments, oldest first (how live's thread reads). Returns
 *  [] on error — the thread degrades to just the form.
 *
 *  Still on WP REST, deliberately (see the file header), and not called while
 *  CommentsSection is commented out — the article page reads getCommentCount
 *  instead. */
export async function getComments(postId: number): Promise<Comment[]> {
  try {
    const res = await fetch(
      `${BASE}/wp/v2/comments?post=${postId}&per_page=100&orderby=date&order=asc&_fields=id,parent,author_name,author_avatar_urls,date,content`,
      { next: cacheFor(postId), headers: { accept: "application/json" } },
    );
    if (!res.ok) return [];
    const raw = (await res.json()) as WpComment[];
    return raw.map(c => ({
      id: c.id,
      parent: c.parent,
      author: c.author_name,
      avatar: c.author_avatar_urls?.["48"] ?? "",
      date: commentDate(c.date ?? ""),
      text: decodeEntities((c.content?.rendered ?? "").replace(/<[^>]+>/g, "")).trim(),
    }));
  } catch {
    return [];
  }
}
