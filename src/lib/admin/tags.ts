// Tag read layer. 5.5k tags → search-first, paginated, most-used first.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";

interface RawTag {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface TagItem {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface TagListResult {
  items: TagItem[];
  total: number;
  totalPages: number;
  page: number;
}

/** `token` = explicit session token from the BFF route; omitted, the cookie
 *  is read here. */
export async function listTags(params: { page?: number; perPage?: number; search?: string } = {}, token?: string): Promise<TagListResult> {
  const page = Math.max(1, params.page ?? 1);
  // Search matches by relevance; otherwise show the most-used tags first.
  const search = params.search?.trim();
  const { data, total, totalPages } = await adminFetch<RawTag[]>("/wp/v2/tags", {
    token,
    query: {
      page,
      per_page: params.perPage ?? 20,
      search,
      orderby: search ? "count" : "count",
      order: "desc",
      _fields: "id,name,slug,count",
    },
  });
  return {
    items: (data ?? []).map((t) => ({ id: t.id, name: decodeEntities(t.name).trim(), slug: t.slug, count: t.count })),
    total,
    totalPages,
    page,
  };
}

type TagListParams = { page?: number; perPage?: number; search?: string };

/** The same page of tags from the fast path — same row shape, same mapping. */
export async function listTagsFast(params: TagListParams = {}, token?: string): Promise<TagListResult> {
  const body = await fastFetch<{ items: RawTag[]; total: number; totalPages: number; page: number }>(
    "tags",
    {
      page: Math.max(1, params.page ?? 1),
      per_page: params.perPage ?? 20,
      q: params.search?.trim(),
    },
    { token },
  );
  const data = body.data;
  return {
    items: (data.items ?? []).map((t) => ({ id: t.id, name: decodeEntities(t.name).trim(), slug: t.slug, count: t.count })),
    total: data.total,
    totalPages: data.totalPages,
    page: data.page,
  };
}

/** The read the BFF should call: fast path first, WP REST if unavailable. */
export function readTags(params: TagListParams = {}, token?: string): Promise<TagListResult> {
  return withRestFallback(
    "tags",
    () => listTagsFast(params, token),
    () => listTags(params, token),
  );
}
