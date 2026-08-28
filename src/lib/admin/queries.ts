"use client";

// TanStack Query layer for the admin dashboard: query keys, fetchers against
// the /api/admin/* BFF routes, and the hooks the converted screens use. The
// only cache tier since A6 — the BFF serves fresh fast-path reads on every
// request, so this browser cache just dedupes and powers instant back/forward.
//
// Imports from the server data layer are TYPE-ONLY (erased at compile time),
// so nothing here drags next/headers into the client bundle.

import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { DEFAULT_STATUSES, type DashRangeSpec } from "./constants";
import type { PostListResult } from "./posts";
import type { DashboardData } from "./dashboard";
import type { CategoryNode } from "./categories";
import type { AuthorOption, UserListResult } from "./users";
import type { ProgramItem } from "./programs";
import type { MediaListResult } from "./media";
import type { TagListResult } from "./tags";
import type { RoleInfo } from "./roles";

/** The Articles list's filter state, normalized (status always set — the
 *  screen defaults it to DEFAULT_STATUSES) so one logical view maps to one
 *  cache entry. Mirrors what /api/admin/posts reads. */
export interface PostListFilters {
  page: number;
  q: string;
  status: string;
  category: string;
  author: string;
  date: string;
}

export interface UserListFilters {
  page: number;
  q: string;
  role: string;
}

export interface MediaListFilters {
  page: number;
  q: string;
  type: string;
}

export interface TagListFilters {
  page: number;
  q: string;
}

/** BFF payloads: the server result + when it was actually pulled from
 *  WordPress ("updated Xm ago" runs on fetchedAt, NOT dataUpdatedAt — a warm
 *  SERVER cache hit would otherwise read "just now" for data up to 30min old). */
export type PostsPayload = PostListResult & { fetchedAt: number };
export type DashboardPayload = DashboardData & { fetchedAt: number };
export type UsersPayload = UserListResult & { fetchedAt: number };
export type MediaPayload = MediaListResult & { fetchedAt: number };
export type TagsPayload = TagListResult & { fetchedAt: number };
export interface CategoriesPayload {
  items: CategoryNode[];
  fetchedAt: number;
}
export interface AuthorsPayload {
  items: AuthorOption[];
  fetchedAt: number;
}
export interface ProgramsPayload {
  items: ProgramItem[];
  fetchedAt: number;
}
export interface RolesPayload {
  items: RoleInfo[];
  fetchedAt: number;
}

export const adminKeys = {
  /** Prefixes matching every page/filter of a resource — invalidation targets. */
  postsRoot: ["admin", "posts"] as const,
  usersRoot: ["admin", "users"] as const,
  mediaRoot: ["admin", "media"] as const,
  tagsRoot: ["admin", "tags"] as const,

  posts: (f: PostListFilters) => ["admin", "posts", f] as const,
  users: (f: UserListFilters) => ["admin", "users", f] as const,
  media: (f: MediaListFilters) => ["admin", "media", f] as const,
  tags: (f: TagListFilters) => ["admin", "tags", f] as const,
  /** Every range of the dashboard — what Refresh invalidates. */
  dashboardRoot: ["admin", "dashboard"] as const,
  dashboard: (range: DashRangeSpec) =>
    ["admin", "dashboard", typeof range === "number" ? range : `${range.from}_${range.to}`] as const,
  categories: ["admin", "categories"] as const,
  authors: ["admin", "authors"] as const,
  programs: ["admin", "programs"] as const,
  roles: ["admin", "roles"] as const,
  /** Per-menu: switching menus keeps each one's items cached. */
  menus: (slug: string) => ["admin", "menus", slug] as const,
};

/** GET a BFF route. A 401 means the session died — leave the SPA for the
 *  login page (throwing too so the query settles instead of hanging). */
async function bffGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
  if (res.status === 401) {
    window.location.assign("/login");
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function qs(pairs: Record<string, string | number>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(pairs)) {
    if (v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* --- posts --- */

/** The Articles list's landing view (no filters, page 1) — what the URL-less
 *  /admin/articles visit resolves to, and what the login warm-up prefetches.
 *  Must stay in sync with ArticlesScreen's normalization or the prefetched
 *  entry misses. */
export function defaultPostFilters(): PostListFilters {
  return { page: 1, q: "", status: DEFAULT_STATUSES, category: "", author: "", date: "" };
}

/** Key + fetcher pair, shared by usePostsList and the next-page prefetch. */
export function postsQuery(f: PostListFilters) {
  return {
    queryKey: adminKeys.posts(f),
    queryFn: () =>
      bffGet<PostsPayload>(
        `/api/admin/posts${qs({ page: f.page, q: f.q, status: f.status, category: f.category, author: f.author, date: f.date })}`,
      ),
  };
}

export function usePostsList(f: PostListFilters) {
  // keepPreviousData: page/filter changes render the previous rows (dimmed by
  // the view) instead of unmounting the table into a skeleton.
  return useQuery({ ...postsQuery(f), placeholderData: keepPreviousData });
}

/* --- the rest (key + fetcher pairs exported for the login warm-up) --- */

export function dashboardQuery(range: DashRangeSpec = 30) {
  return {
    queryKey: adminKeys.dashboard(range),
    queryFn: () =>
      bffGet<DashboardPayload>(
        `/api/admin/dashboard${typeof range === "number" ? qs({ range }) : qs({ from: range.from, to: range.to })}`,
      ),
  };
}

export function categoriesQuery() {
  return {
    queryKey: adminKeys.categories,
    queryFn: () => bffGet<CategoriesPayload>("/api/admin/categories"),
  };
}

export function authorsQuery() {
  return {
    queryKey: adminKeys.authors,
    queryFn: () => bffGet<AuthorsPayload>("/api/admin/authors"),
  };
}

export function useDashboard(range: DashRangeSpec = 30) {
  // keepPreviousData: flipping the range control re-renders the existing chart
  // dimmed rather than dropping the whole screen back to skeletons.
  return useQuery({ ...dashboardQuery(range), placeholderData: keepPreviousData });
}

export function useCategories() {
  return useQuery(categoriesQuery());
}

export function useAuthors() {
  return useQuery(authorsQuery());
}

export function usePrograms() {
  return useQuery({
    queryKey: adminKeys.programs,
    queryFn: () => bffGet<ProgramsPayload>("/api/admin/programs"),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: adminKeys.roles,
    queryFn: () => bffGet<RolesPayload>("/api/admin/roles"),
  });
}

export function useUsersList(f: UserListFilters) {
  return useQuery({
    queryKey: adminKeys.users(f),
    queryFn: () => bffGet<UsersPayload>(`/api/admin/users${qs({ page: f.page, q: f.q, role: f.role })}`),
    placeholderData: keepPreviousData,
  });
}

export function useMediaList(f: MediaListFilters) {
  return useQuery({
    queryKey: adminKeys.media(f),
    queryFn: () => bffGet<MediaPayload>(`/api/admin/media${qs({ page: f.page, q: f.q, type: f.type })}`),
    placeholderData: keepPreviousData,
  });
}

export function useTagsList(f: TagListFilters) {
  return useQuery({
    queryKey: adminKeys.tags(f),
    queryFn: () => bffGet<TagsPayload>(`/api/admin/tags${qs({ page: f.page, q: f.q })}`),
    placeholderData: keepPreviousData,
  });
}

/* --- per-page refresh --- */

/** Names kept for the screens' call sites; the server tag-busting half died
 *  with the BFF caches (A6). Retained (not deleted) because the browser-side
 *  TanStack cache still exists — Refresh forces a refetch NOW instead of
 *  waiting out staleTime. The screen key no longer has a server meaning. */
export type ScreenKey =
  | "dashboard"
  | "articles"
  | "categories"
  | "tags"
  | "programs"
  | "users"
  | "media"
  | "roles"
  | "menus";

export function useScreenRefresh(_screen: ScreenKey, keys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    } finally {
      setRefreshing(false);
    }
  };
  return { refreshing, refresh };
}
