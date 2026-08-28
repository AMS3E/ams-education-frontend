"use client";

// Data orchestration for the Menus manager: TanStack Query over the
// /api/admin/menus BFF, keyed by the selected menu slug so switching menus
// keeps each one's items cached.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import MenuManager from "./MenuManager";
// Type-only from the server module (erased at build); the constant comes from
// the client-safe module, so no server code follows it into the bundle.
import type { MenuItem, MenuSummary } from "@/lib/admin/menus";
import { PROGRAM_ICON_MENU } from "@/lib/admin/constants";
import { useScreenRefresh, adminKeys } from "@/lib/admin/queries";

// STABLE empty reference. `?? []` would mint a new array on every render, and
// MenuManager re-seeds its local order whenever the items prop changes
// IDENTITY — with a fresh array each time that check never settles, so it
// re-rendered in a loop and hydration reported a text mismatch.
const NO_ITEMS: MenuItem[] = [];

interface MenusPayload {
  menus: MenuSummary[];
  menu: MenuSummary | null;
  items: MenuItem[];
  fetchedAt: number;
}

export default function MenusScreen() {
  // The screen is pinned to the program-icon menu — the only one this page
  // manages. The menu picker was removed by owner decision (2026-08-17).
  const slug = PROGRAM_ICON_MENU;
  const queryClient = useQueryClient();
  const { refreshing, refresh } = useScreenRefresh("menus", [adminKeys.menus(slug)]);

  const query = useQuery({
    queryKey: adminKeys.menus(slug),
    queryFn: async (): Promise<MenusPayload> => {
      const res = await fetch(`/api/admin/menus?menu=${encodeURIComponent(slug)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.assign("/login");
        throw new Error("Session expired");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      return (await res.json()) as MenusPayload;
    },
    staleTime: 30_000,
  });

  return (
    <MenuManager
      // Remount on each new payload so MenuManager re-seeds its local ordering
      // from the server's. `fetchedAt` changes on every refetch, including one
      // that returns identical items — which is exactly when the local copy
      // should be dropped, because a write just landed.
      key={query.data?.fetchedAt ?? "loading"}
      menu={query.data?.menu ?? null}
      items={query.data?.items ?? NO_ITEMS}
      loading={query.isPending}
      error={query.isError}
      fetchedAt={query.data?.fetchedAt}
      refreshing={refreshing}
      onRefresh={refresh}
      onMutated={() => queryClient.invalidateQueries({ queryKey: adminKeys.menus(slug) })}
    />
  );
}
