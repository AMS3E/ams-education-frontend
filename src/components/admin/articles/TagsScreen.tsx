"use client";

// Data orchestration for the Tags manager (TanStack Query over the
// /api/admin/tags BFF). URL stays the source of truth for search/page.

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import TagManager from "./TagManager";
import { useTagsList, useScreenRefresh, adminKeys, type TagListFilters } from "@/lib/admin/queries";

const PER_PAGE = 20; // mirrors the BFF's fixed page size

export default function TagsScreen() {
  const sp = useSearchParams();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = (sp.get("q") ?? "").trim();
  const filters = useMemo<TagListFilters>(() => ({ page, q }), [page, q]);

  const tags = useTagsList(filters);
  const queryClient = useQueryClient();
  const { refreshing, refresh } = useScreenRefresh("tags", [adminKeys.tagsRoot]);

  return (
    <TagManager
      result={tags.data ?? { items: [], total: 0, totalPages: 1, page }}
      loading={tags.isPending}
      fetching={tags.isFetching}
      error={tags.isError}
      fetchedAt={tags.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
      onMutated={() => queryClient.invalidateQueries({ queryKey: adminKeys.tagsRoot })}
      query={{ search: q, page }}
      perPage={PER_PAGE}
    />
  );
}
