"use client";

// Data orchestration for the Media grid (TanStack Query over the
// /api/admin/media BFF). URL stays the source of truth for search/type/page;
// upload, alt-save and delete invalidate the client cache, and the next
// fetch reads fresh data (the BFF is uncached since A6).

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import MediaView from "./MediaView";
import { useMediaList, useScreenRefresh, adminKeys, type MediaListFilters } from "@/lib/admin/queries";

const PER_PAGE = 48; // mirrors the BFF's fixed page size

export default function MediaScreen() {
  const sp = useSearchParams();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = (sp.get("q") ?? "").trim();
  const type = sp.get("type") ?? "";
  const filters = useMemo<MediaListFilters>(() => ({ page, q, type }), [page, q, type]);

  const media = useMediaList(filters);
  const queryClient = useQueryClient();
  const { refreshing, refresh } = useScreenRefresh("media", [adminKeys.mediaRoot]);

  return (
    <MediaView
      result={media.data ?? { items: [], total: 0, totalPages: 1, page }}
      loading={media.isPending}
      fetching={media.isFetching}
      error={media.isError}
      fetchedAt={media.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
      onMutated={() => queryClient.invalidateQueries({ queryKey: adminKeys.mediaRoot })}
      query={{ search: q, type, page }}
      perPage={PER_PAGE}
    />
  );
}
