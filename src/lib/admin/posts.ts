// Admin posts read layer: the article list, backed by CORE wp/v2/posts as the
// logged-in user (via adminFetch). Core — not the public web/get-articles — is
// what surfaces drafts/pending, honours search + author/category/status, and
// returns the X-WP-Total pagination headers the list footer needs.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";
import { DEFAULT_STATUSES } from "./constants";

/** A raw core post with the embeds this list requests. Only the fields we read. */
interface RawPost {
  id: number;
  date: string; // "2026-07-30T10:42:02" — site-local (Asia/Phnom_Penh), no zone
  slug: string;
  status: string;
  /** Absent unless the caller asks for it in `_fields`; defaults to "post". */
  type?: string;
  /** "2026-08-05T14:02:11" — site-local, like `date`. */
  modified?: string;
  title: { rendered: string };
  author: number;
  categories: number[];
  tags: number[];
  featured_media: number;
  _embedded?: {
    author?: { name?: string }[];
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { sizes?: { thumbnail?: { source_url?: string } } };
    }[];
    "wp:term"?: { taxonomy: string; name: string; slug: string }[][];
  };
}

export interface AdminPostRow {
  id: number;
  title: string;
  /** Raw WordPress status: "publish" | "draft" | "pending" | … */
  status: string;
  /** WordPress post type. Always "post" on the Articles list; the dashboard's
   *  activity feed unions programs in, so a row there can be movie/tv_show/
   *  episode and needs to route to a different editor. */
  type: string;
  /** Display date, "30/07/2026" (site-local, no timezone shift applied). */
  date: string;
  /** Raw ISO-8601 last-edited stamp, site-local, e.g. "2026-08-05T14:02:11".
   *  "" when the caller did not ask for it. The dashboard's activity feed is
   *  ordered by this, so it is also what that feed must label rows with. */
  modified: string;
  /** May be "" — drafts often have no slug yet. */
  slug: string;
  authorName: string;
  categoryNames: string[];
  /** Thumbnail URL, or "" when there's no featured image. */
  thumb: string;
}

export interface PostListResult {
  items: AdminPostRow[];
  total: number;
  totalPages: number;
  page: number;
  /** Which data path served this — set by readPosts(). */
  via?: "fast" | "rest";
  /** WordPress-side wall time in ms, when the fast path reported it. */
  wpMs?: number;
}

export interface ListPostsParams {
  page?: number;
  perPage?: number;
  search?: string;
  /** CSV of WordPress statuses. Defaults to the editable set. */
  status?: string;
  categoryId?: number;
  authorId?: number;
  /** ISO-8601; posts on or after this date. */
  after?: string;
  /** Sort field. Defaults to "date" (newest first). */
  orderby?: "date" | "modified";
}

/** "2026-07-30T10:42:02" -> "30/07/2026". Site-local already, no zone math. */
function displayDate(dt: string): string {
  const [d] = dt.split("T");
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dt;
}

function mapRow(p: RawPost): AdminPostRow {
  const media = p._embedded?.["wp:featuredmedia"]?.[0];
  const terms = (p._embedded?.["wp:term"] ?? []).flat();
  return {
    id: p.id,
    title: decodeEntities(p.title?.rendered ?? "").trim() || "(untitled)",
    status: p.status,
    type: p.type ?? "post",
    date: displayDate(p.date ?? ""),
    modified: p.modified ?? "",
    slug: p.slug ?? "",
    authorName: p._embedded?.author?.[0]?.name ?? "",
    categoryNames: terms.filter((t) => t.taxonomy === "category").map((t) => t.name),
    thumb:
      media?.media_details?.sizes?.thumbnail?.source_url ?? media?.source_url ?? "",
  };
}

/**
 * A page of posts for the admin list. Throws AdminAuthError (→ /login) on an
 * expired session and AdminApiError on other failures — the page decides how to
 * present each.
 *
 * `token` = explicit session token from the BFF route (which already read it
 * for its auth gate); omitted, the cookie is read here.
 */
export async function listPosts(params: ListPostsParams = {}, token?: string): Promise<PostListResult> {
  const page = Math.max(1, params.page ?? 1);
  const perPage = params.perPage ?? 10;

  const { data, total, totalPages } = await adminFetch<RawPost[]>("/wp/v2/posts", {
    token,
    query: {
      page,
      per_page: perPage,
      status: params.status ?? DEFAULT_STATUSES,
      search: params.search,
      categories: params.categoryId,
      author: params.authorId,
      after: params.after,
      orderby: params.orderby ?? "date",
      order: "desc",
      _fields: "id,date,modified,slug,status,type,title,author,categories,tags,featured_media,_links,_embedded",
      _embed: "author,wp:featuredmedia,wp:term",
    },
  });

  return { items: (data ?? []).map(mapRow), total, totalPages, page, via: "rest" };
}

/* -------------------------------------------------------------------------- *
 * The fast path — the same list, read straight from SQL.
 *
 * fast.php returns rows already flattened (author name, category names and the
 * thumbnail URL resolved server-side), because WordPress's `_embed` shape only
 * exists in REST. Everything AFTER that point is deliberately shared with the
 * REST path: mapFastRow calls the same decodeEntities and displayDate as
 * mapRow, so the two paths cannot drift on entity decoding or date formatting.
 * If a row differs between paths, the difference is in the DATA, not in the
 * mapping — which is what makes the Author leak test meaningful.
 * -------------------------------------------------------------------------- */

/** A row as fast.php emits it. Mirrors ams_fast_res_posts()'s item shape
 *  (also the dashboard's recent-activity rows — same hydration server-side). */
export interface FastPostRow {
  id: number;
  /** Raw post_title — REST would have run the `the_title` filters over it. */
  title: string;
  date: string;
  slug: string;
  status: string;
  /** Added in fast-api 1.6.0. Older deploys omit it — hence the "post" default
   *  in mapFastRow, which is what every row on the Articles list is anyway. */
  type?: string;
  /** Also 1.6.0, and only populated where the SELECT asks for it (the
   *  dashboard's activity feed). "" everywhere else. */
  modified?: string;
  author: number;
  authorName: string;
  categoryNames: string[];
  thumb: string;
}

export function mapFastRow(p: FastPostRow): AdminPostRow {
  return {
    id: p.id,
    title: decodeEntities(p.title ?? "").trim() || "(untitled)",
    status: p.status,
    type: p.type ?? "post",
    date: displayDate(p.date ?? ""),
    modified: p.modified ?? "",
    slug: p.slug ?? "",
    authorName: p.authorName ?? "",
    categoryNames: p.categoryNames ?? [],
    thumb: p.thumb ?? "",
  };
}

export async function listPostsFast(params: ListPostsParams = {}, token?: string): Promise<PostListResult> {
  const body = await fastFetch<{
    items: FastPostRow[];
    total: number;
    totalPages: number;
    page: number;
  }>(
    "posts",
    {
      page: Math.max(1, params.page ?? 1),
      per_page: params.perPage ?? 10,
      status: params.status ?? DEFAULT_STATUSES,
      q: params.search,
      category: params.categoryId,
      author: params.authorId,
      after: params.after,
      orderby: params.orderby ?? "date",
    },
    { token },
  );

  const data = body.data;
  return {
    items: (data.items ?? []).map(mapFastRow),
    total: data.total,
    totalPages: data.totalPages,
    page: data.page,
    via: "fast",
    wpMs: body.ms?.total,
  };
}

/**
 * The read the admin should call: fast path first, WP REST if it is unavailable.
 * Both return the identical PostListResult shape, so callers never branch.
 */
export function readPosts(params: ListPostsParams = {}, token?: string): Promise<PostListResult> {
  return withRestFallback(
    "posts",
    () => listPostsFast(params, token),
    () => listPosts(params, token),
  );
}

/**
 * Just the total number of posts matching a filter, via the X-WP-Total header —
 * a server-side COUNT, so no rows transfer (per_page=1, _fields=id keeps the one
 * returned row tiny). Used by the dashboard stat tiles.
 */
export async function countPosts(
  query: {
    author?: number;
    status?: string;
    search?: string;
    /** Published on or after — ISO-8601, site-local. */
    after?: string;
    /** Published strictly before. Pair with `after` for a bounded window. */
    before?: string;
    /** Last edited before — how the dashboard's fallback finds stale drafts. */
    modifiedBefore?: string;
  },
  token?: string,
): Promise<number> {
  const { total } = await adminFetch<unknown[]>("/wp/v2/posts", {
    token,
    query: {
      per_page: 1,
      _fields: "id",
      author: query.author,
      status: query.status,
      search: query.search,
      after: query.after,
      before: query.before,
      modified_before: query.modifiedBefore,
    },
  });
  return total;
}
