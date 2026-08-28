"use client";

// Data orchestration for the Users screen (TanStack Query over the
// /api/admin/users BFF — list_users-gated, shared past the gate). URL stays
// the source of truth for search/role/page.

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import UsersView from "./UsersView";
import { useUsersList, useScreenRefresh, adminKeys, type UserListFilters } from "@/lib/admin/queries";

const PER_PAGE = 20; // mirrors the BFF's fixed page size

export default function UsersScreen({ canCreate }: { canCreate: boolean }) {
  const sp = useSearchParams();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = (sp.get("q") ?? "").trim();
  const role = sp.get("role") ?? "";
  const filters = useMemo<UserListFilters>(() => ({ page, q, role }), [page, q, role]);

  const users = useUsersList(filters);
  const queryClient = useQueryClient();
  const { refreshing, refresh } = useScreenRefresh("users", [adminKeys.usersRoot]);

  return (
    <UsersView
      result={users.data ?? { items: [], total: 0, totalPages: 1, page }}
      loading={users.isPending}
      fetching={users.isFetching}
      error={users.isError}
      fetchedAt={users.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
      onCreated={() => queryClient.invalidateQueries({ queryKey: adminKeys.usersRoot })}
      query={{ search: q, role, page }}
      perPage={PER_PAGE}
      canCreate={canCreate}
    />
  );
}
