"use client";

// Data orchestration for the Categories manager (TanStack Query over the
// /api/admin/categories BFF — the same query the Articles filter dropdown
// uses, so the two screens share one client cache entry).

import { useQueryClient } from "@tanstack/react-query";
import CategoryManager from "./CategoryManager";
import { useCategories, useScreenRefresh, adminKeys } from "@/lib/admin/queries";

export default function CategoriesScreen() {
  const categories = useCategories();
  const queryClient = useQueryClient();
  const { refreshing, refresh } = useScreenRefresh("categories", [adminKeys.categories]);

  return (
    <CategoryManager
      categories={categories.data?.items ?? []}
      loading={categories.isPending}
      error={categories.isError}
      fetchedAt={categories.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
      onMutated={() => queryClient.invalidateQueries({ queryKey: adminKeys.categories })}
    />
  );
}
