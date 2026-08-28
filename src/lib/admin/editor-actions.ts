"use server";

// Server Actions backing the article/program editors' pickers: tag typeahead
// search and media browsing for the picker dialog. (Media UPLOAD is not an
// action — the action layer's FormData/File encoding proved unreliable, so it
// goes through the /api/admin/upload Route Handler; see lib/admin/upload.ts.)

// ⚠ "use server" files may export ONLY async functions. Even a type-only
// re-export (`export type { X }`) crashes the whole module at runtime in dev:
// Turbopack's server-actions loader emits it as a real export, and every
// action in the file then 500s with "ReferenceError: X is not defined".
// Import shared types from their defining module instead.

import { redirect } from "next/navigation";
import { adminFetch, AdminAuthError } from "./client";
import { readMedia, type MediaListResult } from "./media";
import { decodeEntities } from "@/lib/api/mappers";

export interface TagOption {
  id: number;
  name: string;
}

/** Typeahead over the ~5.5k post tags: name search, most-used first. */
export async function searchTags(query: string): Promise<TagOption[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const { data } = await adminFetch<{ id: number; name: string }[]>("/wp/v2/tags", {
      query: { search: q, per_page: 20, orderby: "count", order: "desc", _fields: "id,name" },
    });
    return (data ?? []).map((t) => ({ id: t.id, name: decodeEntities(t.name).trim() }));
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return []; // typeahead degrades to no suggestions
  }
}

/** Media grid for the picker dialog — images only, paginated, searchable. */
export async function browseMedia(params: { page?: number; search?: string; mediaType?: string }): Promise<MediaListResult | null> {
  try {
    // readMedia, NOT listMedia: the picker was the one media surface still on
    // the ~4s WP REST path while the Media screen already read the fast one.
    // Same shape, same fallback, ~20x.
    return await readMedia({
      page: params.page,
      perPage: 24,
      search: params.search,
      mediaType: params.mediaType ?? "image",
    });
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return null;
  }
}
