// Users read layer + creation. context=edit returns email + roles, so the list
// calls require the list_users capability (the page gates on it before calling).

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";
import { roleLabel } from "./role-label";

interface RawUser {
  id: number;
  name: string;
  email?: string;
  slug: string;
  roles?: string[];
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  slug: string;
  roles: string[];
  roleLabel: string;
}

export interface UserListResult {
  items: AdminUser[];
  total: number;
  totalPages: number;
  page: number;
}

function map(u: RawUser): AdminUser {
  return {
    id: u.id,
    name: decodeEntities(u.name ?? "").trim(),
    email: u.email ?? "",
    slug: u.slug ?? "",
    roles: u.roles ?? [],
    roleLabel: roleLabel(u.roles ?? []),
  };
}

export interface AuthorOption {
  id: number;
  name: string;
}

/**
 * Post authors for the Articles list's author filter. Uses the default (view)
 * context — which returns only users who have published posts, id/name only —
 * so it needs NO list_users capability and works for every signed-in user.
 *
 * THROWS on failure so the BFF can report it; screens that prefer to degrade
 * to an empty filter use `listAuthors` below.
 */
export async function fetchAuthorOptions(token?: string): Promise<AuthorOption[]> {
  const { data } = await adminFetch<{ id: number; name: string }[]>("/wp/v2/users", {
    token,
    query: { per_page: 100, orderby: "name", order: "asc", _fields: "id,name" },
  });
  return (data ?? []).map((u) => ({ id: u.id, name: decodeEntities(u.name ?? "").trim() }));
}

/** The same author-filter options from the fast path. One deliberate
 *  divergence, in the deterministic direction: the fast endpoint always
 *  answers "users with a published post" — on REST that was only the
 *  answer for callers WITHOUT list_users, so the shared BFF cache entry's
 *  content depended on who happened to warm it. */
export async function fetchAuthorOptionsFast(token?: string): Promise<AuthorOption[]> {
  const body = await fastFetch<{ items: { id: number; name: string }[] }>("authors", {}, { token });
  return (body.data.items ?? []).map((u) => ({ id: u.id, name: decodeEntities(u.name ?? "").trim() }));
}

/** The read the BFF should call: fast path first, WP REST if unavailable. */
export function readAuthorOptions(token?: string): Promise<AuthorOption[]> {
  return withRestFallback(
    "authors",
    () => fetchAuthorOptionsFast(token),
    () => fetchAuthorOptions(token),
  );
}

/** `fetchAuthorOptions`, degraded: any failure is an empty list. */
export async function listAuthors(token?: string): Promise<AuthorOption[]> {
  try {
    return await fetchAuthorOptions(token);
  } catch {
    return [];
  }
}

/** What the New-user dialog collects. `role` is a single WP role slug. */
export interface NewUser {
  username: string;
  email: string;
  password: string;
  name: string;
  role: string;
}

/** Create a WordPress user. Requires the create_users capability — WordPress
 *  enforces it; a 403 here means the logged-in role lacks it (admins have it
 *  natively; anyone else would need a plugin caps grant). */
export async function createUser(fields: NewUser): Promise<{ id: number }> {
  const { data } = await adminFetch<{ id: number }>("/wp/v2/users", {
    method: "POST",
    body: {
      username: fields.username,
      email: fields.email,
      password: fields.password,
      name: fields.name || undefined,
      roles: [fields.role],
    },
  });
  return data;
}

/** `token` = explicit session token from the BFF route (which already read it
 *  for its auth gate); omitted, the cookie is read here. */
export async function listUsers(params: { page?: number; perPage?: number; search?: string; roles?: string } = {}, token?: string): Promise<UserListResult> {
  const page = Math.max(1, params.page ?? 1);
  const { data, total, totalPages } = await adminFetch<RawUser[]>("/wp/v2/users", {
    token,
    query: {
      context: "edit",
      page,
      per_page: params.perPage ?? 20,
      search: params.search,
      roles: params.roles,
      orderby: "name",
      order: "asc",
      _fields: "id,name,email,slug,roles",
    },
  });
  return { items: (data ?? []).map(map), total, totalPages, page };
}

type UserListParams = { page?: number; perPage?: number; search?: string; roles?: string };

/** The same page of users from the fast path. The endpoint re-checks
 *  list_users server-side against the verified token — the BFF's gate is not
 *  the only one, exactly as WordPress enforces it on the REST call. */
export async function listUsersFast(params: UserListParams = {}, token?: string): Promise<UserListResult> {
  const body = await fastFetch<{ items: RawUser[]; total: number; totalPages: number; page: number }>(
    "users",
    {
      page: Math.max(1, params.page ?? 1),
      per_page: params.perPage ?? 20,
      q: params.search?.trim(),
      roles: params.roles,
    },
    { token },
  );
  const data = body.data;
  return {
    items: (data.items ?? []).map(map),
    total: data.total,
    totalPages: data.totalPages,
    page: data.page,
  };
}

/** The read the BFF should call: fast path first, WP REST if unavailable. */
export function readUsers(params: UserListParams = {}, token?: string): Promise<UserListResult> {
  return withRestFallback(
    "users",
    () => listUsersFast(params, token),
    () => listUsers(params, token),
  );
}
