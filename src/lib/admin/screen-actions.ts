"use server";

// Server Actions for the taxonomy managers, settings, profile, post trash,
// user creation, and media item writes. Clients call these then invalidate
// their TanStack queries — the BFF reads are uncached since A6, so the next
// fetch sees the write with no tag choreography. Only PUBLIC-site tags
// (articles, featured-program) are still busted here.

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { adminFetch, AdminAuthError, AdminApiError } from "./client";
import { updateSettings, updateProfile, readProfile, type SettingsWrite, type ProfileWrite } from "./settings";
import { createUser, type NewUser } from "./users";
import { updateMediaAlt, deleteMediaItem } from "./media";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: number;
}

/** Map a thrown error to a result — but let an expired session redirect. */
function fail(e: unknown, msg: string): ActionResult {
  if (e instanceof AdminAuthError) redirect("/login");
  return { ok: false, error: e instanceof AdminApiError ? msg : "Something went wrong. Please try again." };
}

/** WordPress's own error message out of an AdminApiError body ("Sorry, that
 *  username already exists!" beats a generic "couldn't create"). */
function wpMessage(e: unknown): string {
  if (!(e instanceof AdminApiError)) return "";
  try {
    const parsed = JSON.parse(e.detail) as { message?: string };
    return typeof parsed.message === "string" ? parsed.message : "";
  } catch {
    return "";
  }
}

/* --- categories --- */

export async function createCategory(name: string, parent = 0): Promise<ActionResult> {
  const n = name.trim();
  if (!n) return { ok: false, error: "Enter a category name." };
  try {
    const { data } = await adminFetch<{ id: number }>("/wp/v2/categories", { method: "POST", body: { name: n, parent } });
    return { ok: true, id: data.id };
  } catch (e) {
    return fail(e, "Couldn't create the category (the name may already exist).");
  }
}

export async function renameCategory(id: number, name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n) return { ok: false, error: "Enter a category name." };
  try {
    await adminFetch(`/wp/v2/categories/${id}`, { method: "POST", body: { name: n } });
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't rename the category.");
  }
}

/** Re-parent a term. `parent` 0 promotes it to top level. Children move WITH
 *  it — the tree is stored as parent pointers, so nothing else is rewritten.
 *
 *  MEASURED (2026-08-05, live): a cycle is NOT refused. Moving a term under
 *  its own descendant — or under itself — answers 200 and silently stores
 *  parent=0 instead (wp_check_term_hierarchy_for_loops coerces). So the
 *  taxonomy can never be corrupted into an unreachable loop, but the write
 *  would look like it worked while quietly promoting the term to top level.
 *  That is why the Move picker hides a term's own descendants: the guard is
 *  for the user's expectations, not for the data. */
export async function setCategoryParent(id: number, parent: number): Promise<ActionResult> {
  if (id === parent) return { ok: false, error: "A category can't be its own parent." };
  try {
    await adminFetch(`/wp/v2/categories/${id}`, { method: "POST", body: { parent } });
    return { ok: true };
  } catch (e) {
    return fail(e, wpMessage(e) || "Couldn't move the category.");
  }
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  try {
    await adminFetch(`/wp/v2/categories/${id}`, { method: "DELETE", query: { force: true } });
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't delete the category.");
  }
}

/* --- tags --- */

export async function createTag(name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n) return { ok: false, error: "Enter a tag name." };
  try {
    const { data } = await adminFetch<{ id: number }>("/wp/v2/tags", { method: "POST", body: { name: n } });
    return { ok: true, id: data.id };
  } catch (e) {
    return fail(e, "Couldn't create the tag (it may already exist).");
  }
}

export async function deleteTag(id: number): Promise<ActionResult> {
  try {
    await adminFetch(`/wp/v2/tags/${id}`, { method: "DELETE", query: { force: true } });
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't delete the tag.");
  }
}

/* --- settings / profile --- */

export async function saveSettings(patch: SettingsWrite): Promise<ActionResult> {
  try {
    await updateSettings(patch);
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't save settings. Check your permissions (manage_options).");
  }
}

export async function saveProfile(patch: ProfileWrite): Promise<ActionResult> {
  try {
    await updateProfile(patch);
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't save your profile.");
  }
}

/** Point the signed-in account at an uploaded image (0 clears it). Its own
 *  action, outside saveProfile, because the picture applies the moment the
 *  upload finishes rather than waiting for Save — see ProfileForm. */
export async function setMyAvatar(attachmentId: number): Promise<ActionResult> {
  try {
    await updateProfile({ ams_avatar: { id: attachmentId } });
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't update the picture.");
  }
}

/** The sidebar account chip's picture and role, fresh from WordPress. Its own
 *  tiny action (not readProfile exposed wholesale) because the chip mounts on
 *  EVERY admin page: it should carry two strings, and a failure must stay
 *  silent — initials + the login-time role are the designed fallback, and a
 *  decorative fetch must never bounce the app to /login.
 *
 *  The role rides along because the layout's copy comes from the session cookie
 *  written once at login: a role added in wp-admin afterwards would otherwise
 *  stay invisible until the next login. */
export async function fetchMyChip(): Promise<{ url: string | null; roleLabel: string | null }> {
  try {
    const profile = await readProfile();
    return { url: profile.avatar?.url ?? null, roleLabel: profile.roleLabel };
  } catch {
    return { url: null, roleLabel: null };
  }
}

/* --- featured program (homepage banner) --- */

/** Set the homepage banner through the plugin's write endpoint (≥1.7.4,
 *  manage_options). movieId 0 hides the banner; bgImageId 0 falls back to the
 *  movie's own backdrop. The plugin pings production's featured-program tag
 *  itself; the local revalidate covers this deployment too. */
export async function saveFeaturedProgram(movieId: number, bgImageId: number): Promise<ActionResult> {
  try {
    await adminFetch("/wp/v2/web/featured-program", {
      method: "POST",
      body: { movie_id: movieId, bg_image: bgImageId },
    });
    revalidateTag("featured-program", "max");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't save the featured program. Is plugin v1.7.4 deployed?");
  }
}

/* --- users --- */

/** Create a WordPress user. WordPress enforces create_users itself; a 403 is
 *  reported as the capability wall it is (admins pass natively — anyone else
 *  would need a plugin caps grant, same playbook as the program caps). */
export async function createUserAction(fields: NewUser): Promise<ActionResult> {
  const username = fields.username.trim();
  const email = fields.email.trim();
  if (!username) return { ok: false, error: "Enter a username." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (fields.password.length < 8) return { ok: false, error: "Use a password of at least 8 characters." };
  try {
    const { id } = await createUser({ ...fields, username, email, name: fields.name.trim() });
    return { ok: true, id };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    if (e instanceof AdminApiError && e.status === 403) {
      return {
        ok: false,
        error: "WordPress refused (create_users). Your role can't create users — this needs a plugin caps grant.",
      };
    }
    return { ok: false, error: wpMessage(e) || "Couldn't create the user. Please try again." };
  }
}

/* --- media --- */

export async function saveMediaAlt(id: number, alt: string): Promise<ActionResult> {
  try {
    await updateMediaAlt(id, alt.trim());
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't save the alt text. Check your permissions on this file.");
  }
}

/** PERMANENT — attachments have no trash over REST. The UI confirms first. */
export async function deleteMedia(id: number): Promise<ActionResult> {
  try {
    await deleteMediaItem(id);
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't delete the file. It may be protected or your role can't delete others' uploads.");
  }
}

/* --- post trash --- */

export async function trashPost(id: number): Promise<ActionResult> {
  try {
    await adminFetch(`/wp/v2/posts/${id}`, { method: "DELETE" }); // to trash (not force)
    revalidateTag("articles", "max"); // public lists (a published post may have vanished)
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't move the post to trash.");
  }
}
