"use client";

// Data orchestration for the Articles list — the TanStack Query template
// screen (docs/session-log.md "DECIDED 2026-08-03"). The URL
// stays the source of truth for the filter state (back/forward and shared
// links land on the same view, and revisits hit the client cache); this
// component turns the search params into queries against the /api/admin/*
// BFF and hands ArticlesView plain data + callbacks.

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import ArticlesView from "./ArticlesView";
import {
  usePostsList,
  useCategories,
  useAuthors,
  useScreenRefresh,
  postsQuery,
  adminKeys,
  type PostListFilters,
} from "@/lib/admin/queries";
import { DEFAULT_STATUSES } from "@/lib/admin/constants";

const PER_PAGE = 20; // mirrors the BFF's fixed page size — keep the two in step

export default function ArticlesScreen() {
  const sp = useSearchParams();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") || DEFAULT_STATUSES;
  const category = sp.get("category") ?? "";
  const author = sp.get("author") ?? "";
  const date = sp.get("date") ?? "";
  const filters = useMemo<PostListFilters>(
    () => ({ page, q, status, category, author, date }),
    [page, q, status, category, author, date],
  );

  const queryClient = useQueryClient();
  const posts = usePostsList(filters);
  const categories = useCategories();
  const authors = useAuthors();

  // Warm the next page as soon as the current one has settled — paging
  // forward then becomes an instant cache hit. prefetchQuery no-ops when the
  // page is already cached and fresh, and the async callback keeps this
  // effect free of synchronous setState.
  const totalPages = posts.data?.totalPages ?? 0;
  const settled = posts.data !== undefined && !posts.isPlaceholderData;
  useEffect(() => {
    if (!settled || filters.page >= totalPages) return;
    void queryClient.prefetchQuery(postsQuery({ ...filters, page: filters.page + 1 }));
  }, [settled, totalPages, filters, queryClient]);

  const { refreshing, refresh } = useScreenRefresh("articles", [
    adminKeys.postsRoot,
    adminKeys.categories,
    adminKeys.authors,
  ]);

  return (
    <ArticlesView
      result={posts.data ?? null}
      error={posts.isError}
      loading={posts.isPending}
      fetching={posts.isFetching}
      fetchedAt={posts.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
      onTrashed={() => queryClient.invalidateQueries({ queryKey: adminKeys.postsRoot })}
      query={{ search: q, status, category, author, date, page }}
      perPage={PER_PAGE}
      categories={categories.data?.items ?? []}
      authors={authors.data?.items ?? []}
    />
  );
}
