// Roles read layer — the plugin's web/roles endpoint (≥1.7.5): every role
// with its display name, granted capability list, and user count. Gated
// WP-side on list_users; the Role Management screen is a read-only viewer.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";

interface RawRole {
  slug: string;
  name: string;
  user_count: number;
  caps: string[];
}

export interface RoleInfo {
  slug: string;
  name: string;
  userCount: number;
  /** Granted capabilities, sorted. Stored role caps only — the plugin's
   *  runtime user_has_cap grant for program caps is not reflected here. */
  caps: string[];
}

/** `token` = explicit session token from the BFF route; omitted, the cookie
 *  is read here. */
export async function listRoles(token?: string): Promise<RoleInfo[]> {
  const { data } = await adminFetch<{ status: string; data?: RawRole[] }>("/wp/v2/web/roles", { token });
  return (data.data ?? []).map((r) => ({
    slug: r.slug,
    name: r.name,
    userCount: r.user_count ?? 0,
    caps: r.caps ?? [],
  }));
}

/** The same list from the fast path (list_users re-checked server-side). */
export async function listRolesFast(token?: string): Promise<RoleInfo[]> {
  const body = await fastFetch<{ items: RawRole[] }>("roles", {}, { token });
  return (body.data.items ?? []).map((r) => ({
    slug: r.slug,
    name: r.name,
    userCount: r.user_count ?? 0,
    caps: r.caps ?? [],
  }));
}

/** The read the BFF should call: fast path first, WP REST if unavailable. */
export function readRoles(token?: string): Promise<RoleInfo[]> {
  return withRestFallback(
    "roles",
    () => listRolesFast(token),
    () => listRoles(token),
  );
}
