// One place that knows how to fetch a page of the article feed, either way.
//
// Three public endpoints return the SAME envelope shape and are called from a
// dozen places (homepage blocks, category pages, article sidebars, landing
// sections). Rather than teach each call site about the fast path, they all
// come through here: the fast endpoint first, the exact WP REST URL each
// filter used before as the fallback.
//
// The two REST endpoints differ in a way that is easy to get wrong, so it is
// encoded here once (see articles.ts's own note on categoryRefsByIds):
//   - by SLUG aggregates the term's DESCENDANTS
//   - by ID matches DIRECT assignments only, and takes a CSV union
// entertainment-news is 7,660 posts by id and 7,737 by slug. fast.php
// reproduces both semantics; this picks which one to ask for.

import { apiFetch, type CacheOpts } from "./client";
import { fastPublicFetch, withPublicRestFallback } from "./fast-public";
import type { WpArticleListItem, WpListEnvelope } from "./wp-types";

export interface ArticleListQuery {
  /** Rows per page. */
  pageSize: number;
  /** 1-based. */
  page?: number;
  /** A single category slug — aggregates descendants. */
  categorySlug?: string;
  /** CSV of term ids — union, direct assignments only. */
  categoryIds?: string;
}

type Envelope = WpListEnvelope<WpArticleListItem>;

function restPath(q: ArticleListQuery): string {
  const page = q.page ?? 1;
  if (q.categorySlug !== undefined) {
    return `/wp/v2/web/get-article-by-category-slug?slug=${encodeURIComponent(q.categorySlug)}&page_no=${page}&page_size=${q.pageSize}`;
  }
  const ids = q.categoryIds ? `&category_id=${encodeURIComponent(q.categoryIds)}` : "";
  return `/wp/v2/web/get-articles?page_no=${page}&page_size=${q.pageSize}${ids}`;
}

/**
 * A page of articles, from the fast path when it is available and WP REST
 * otherwise. Throws on failure exactly as apiFetch does, so every caller's
 * existing `catch -> []` degradation is unchanged.
 */
export function fetchArticleList(q: ArticleListQuery, cache: CacheOpts): Promise<Envelope> {
  const label = q.categorySlug !== undefined ? `articles:${q.categorySlug}` : `articles:${q.categoryIds ?? "all"}`;

  return withPublicRestFallback<Envelope>(
    label,
    () =>
      fastPublicFetch<Envelope>(
        "pub-articles",
        {
          page: q.page ?? 1,
          per_page: q.pageSize,
          category_slug: q.categorySlug,
          category_id: q.categoryIds,
        },
        cache,
      ),
    () => apiFetch<Envelope>(restPath(q), cache),
  );
}
