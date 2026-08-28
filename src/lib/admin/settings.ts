// Site settings + own-profile read/write, via core wp/v2/settings (manage_options)
// and wp/v2/users/me (any logged-in user can edit their own).

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";
import { roleLabel } from "./role-label";

export interface SiteSettings {
  title: string;
  description: string;
  timezone: string;
  dateFormat: string;
  defaultCategory: number;
  postsPerPage: number;
}

interface RawSettings {
  title?: string;
  description?: string;
  timezone?: string;
  date_format?: string;
  default_category?: number;
  posts_per_page?: number;
}

/** Shared by both paths — the fast endpoint returns core's own option names,
 *  so a difference between paths can only be a DATA difference. */
function mapSettings(data: RawSettings): SiteSettings {
  return {
    title: decodeEntities(data.title ?? ""),
    description: decodeEntities(data.description ?? ""),
    timezone: data.timezone ?? "",
    dateFormat: data.date_format ?? "",
    defaultCategory: data.default_category ?? 0,
    postsPerPage: data.posts_per_page ?? 10,
  };
}

export async function getSettings(): Promise<SiteSettings> {
  const { data } = await adminFetch<RawSettings>("/wp/v2/settings", {});
  return mapSettings(data);
}

export async function getSettingsFast(token?: string): Promise<SiteSettings> {
  const body = await fastFetch<RawSettings>("settings", {}, { token });
  return mapSettings(body.data);
}

/** The read the Settings page should call: fast path first, REST if it is
 *  unavailable. Both re-check manage_options server-side. */
export function readSettings(token?: string): Promise<SiteSettings> {
  return withRestFallback(
    "settings",
    () => getSettingsFast(token),
    () => getSettings(),
  );
}

export interface SettingsWrite {
  title?: string;
  description?: string;
  timezone?: string;
  date_format?: string;
  default_category?: number;
  posts_per_page?: number;
}

export async function updateSettings(patch: SettingsWrite): Promise<void> {
  await adminFetch("/wp/v2/settings", { method: "POST", body: patch });
}

// --- own profile ---

export interface ProfileAvatar {
  /** wp attachment id — what a write sends back. */
  id: number;
  /** Rendition URL, resolved and stored by the plugin at write time. */
  url: string;
}

export interface Profile {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  description: string;
  url: string;
  username: string;
  roleLabel: string;
  initials: string;
  /** null until the user uploads one — the UI then falls back to initials. */
  avatar: ProfileAvatar | null;
}

interface RawMe {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  description?: string;
  url?: string;
  slug?: string;
  roles?: string[];
  /** ams-frontend-api ≥1.20.0 (REST field) / fast.php profile — same shape on
   *  both paths on purpose. Absent entirely on an older plugin. */
  ams_avatar?: { id?: number; url?: string } | null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapProfile(data: RawMe): Profile {
  const name = decodeEntities(data.name ?? "").trim();
  const roles = data.roles ?? [];
  return {
    id: data.id,
    name,
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    email: data.email ?? "",
    description: data.description ?? "",
    url: data.url ?? "",
    username: data.slug ?? "",
    roleLabel: roleLabel(roles),
    initials: initialsOf(name),
    avatar: data.ams_avatar?.id && data.ams_avatar.url ? { id: data.ams_avatar.id, url: data.ams_avatar.url } : null,
  };
}

export async function getProfile(): Promise<Profile> {
  const { data } = await adminFetch<RawMe>("/wp/v2/users/me", { query: { context: "edit" } });
  return mapProfile(data);
}

/** Always the TOKEN's own user — the fast endpoint takes no id, so this
 *  cannot be pointed at someone else's account. */
export async function getProfileFast(token?: string): Promise<Profile> {
  const body = await fastFetch<RawMe>("profile", {}, { token });
  return mapProfile(body.data);
}

export function readProfile(token?: string): Promise<Profile> {
  return withRestFallback(
    "profile",
    () => getProfileFast(token),
    () => getProfile(),
  );
}

export interface ProfileWrite {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  description?: string;
  url?: string;
  password?: string;
  /** { id: <attachment> } sets the profile picture, { id: 0 } removes it.
   *  Written on its own by setMyAvatar the moment an upload finishes — never
   *  part of the Save patch, so an unchanged picture can't be cleared by it. */
  ams_avatar?: { id: number };
}

export async function updateProfile(patch: ProfileWrite): Promise<void> {
  await adminFetch("/wp/v2/users/me", { method: "POST", body: patch });
}
