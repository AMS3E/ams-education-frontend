"use server";

// Server Actions for the Menus screen: rename, re-point, reorder, add and
// remove items of a WordPress nav menu.
//
// These write the SAME menu the old WordPress theme renders, so a change here
// changes both sites. Writes go to core REST as the logged-in user (the
// standing decision — the fast path stays read-only); WordPress enforces
// edit_theme_options itself, and a 403 is reported as the capability wall it
// is rather than a generic failure.
//
// The public site's copy of this menu is ISR-cached under the "menu" tag, so
// every successful write busts it — otherwise an editor's reorder would not
// show up until the revalidate window expired.

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { adminFetch, AdminAuthError, AdminApiError } from "./client";
// A VALUE import, not a type re-export: `export type { … }` from a "use server"
// file crashes every action in it at dev runtime with an opaque digest 500.
import { ICON_DEFAULTS } from "./menus";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: number;
}

function fail(e: unknown, msg: string): ActionResult {
  if (e instanceof AdminAuthError) redirect("/login");
  if (e instanceof AdminApiError && e.status === 403) {
    return { ok: false, error: "WordPress refused (edit_theme_options). Your role can't edit menus." };
  }
  if (e instanceof AdminApiError) {
    try {
      const parsed = JSON.parse(e.detail) as { message?: string };
      if (typeof parsed.message === "string" && parsed.message) return { ok: false, error: parsed.message };
    } catch {
      /* fall through to the caller's message */
    }
  }
  return { ok: false, error: msg };
}

/** Every successful menu write invalidates the public site's cached copy. */
function bustPublicMenu() {
  revalidateTag("menu", "max");
}

export async function renameMenuItem(id: number, label: string): Promise<ActionResult> {
  const title = label.trim();
  if (!title) return { ok: false, error: "Enter a label." };
  try {
    await adminFetch(`/wp/v2/menu-items/${id}`, { method: "POST", body: { title } });
    bustPublicMenu();
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't rename this item.");
  }
}

export async function setMenuItemUrl(id: number, url: string): Promise<ActionResult> {
  const u = url.trim();
  if (!u) return { ok: false, error: "Enter a link." };
  try {
    await adminFetch(`/wp/v2/menu-items/${id}`, { method: "POST", body: { url: u } });
    bustPublicMenu();
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't update this link.");
  }
}

/**
 * Write the new ordering.
 *
 * `menu_order` is 1-based, and WordPress does NOT renumber siblings for you —
 * two items sharing an order fall back to id order, which reads as a random
 * swap to whoever just moved something. So positions are absolute 1..n, and
 * the SCREEN sends only the rows whose position actually changed: moving one
 * item one place is 2 writes rather than 14, and each of these is a ~1s WP
 * REST call that blocks the row actions while it runs.
 *
 * Sequential on purpose — firing a dozen writes in parallel at a host that has
 * IP-banned this project before is not worth the saved seconds.
 */
export async function reorderMenuItems(updates: { id: number; order: number }[]): Promise<ActionResult> {
  if (!updates.length) return { ok: true };
  try {
    for (const u of updates) {
      await adminFetch(`/wp/v2/menu-items/${u.id}`, { method: "POST", body: { menu_order: u.order } });
    }
    bustPublicMenu();
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't save the new order. Some items may have moved — refresh to see where things stand.");
  }
}

/**
 * Add an item to the END of a menu.
 *
 * `position` is not optional in practice: WordPress's menu-items controller
 * defaults menu_order to 1, so an item created without one jumps to the FRONT
 * of the menu (measured — a test item landed ahead of ស្ថាបត្យកម្មសកល in the
 * live strip). The screen passes the current item count so a new entry appends
 * where the person adding it expects.
 */
export async function addMenuItem(menuId: number, label: string, url: string, position?: number): Promise<ActionResult> {
  const title = label.trim();
  const u = url.trim();
  if (!title) return { ok: false, error: "Enter a label." };
  if (!u) return { ok: false, error: "Enter a link." };
  try {
    const { data } = await adminFetch<{ id: number }>("/wp/v2/menu-items", {
      method: "POST",
      // `custom` + url is what every item in this menu already is: the strip
      // links to program pages by absolute URL, not by post id.
      body: {
        title,
        url: u,
        type: "custom",
        menus: menuId,
        status: "publish",
        menu_order: position && position > 0 ? position : 1,
      },
    });
    bustPublicMenu();
    return { ok: true, id: data.id };
  } catch (e) {
    return fail(e, "Couldn't add the item.");
  }
}

/**
 * Set (or clear) a menu item's ICON.
 *
 * The icon is the item's FEATURED IMAGE — `_thumbnail_id` — not a `_menu_item_*`
 * key. That was measured on live, and it is the reason this was read-only until
 * ams-frontend-api 1.7.6: core REST answered `meta: {}` for nav_menu_item and
 * refused the write. The plugin now registers the key for that post type alone,
 * behind an edit_theme_options auth callback, so this is an ordinary REST write.
 *
 * `attachmentId = 0` clears the icon. On the PUBLIC strip that removes the item
 * entirely, because a row with no icon has nothing to render — the screen says
 * so before it happens.
 *
 * The three companion values are passed in from the row rather than re-fetched:
 * an item that already has an icon keeps its own rendition and label placement,
 * while an item that has never had one (anything added from this screen) gets
 * the defaults every existing row carries. WordPress rejects an unknown size on
 * its side too, falling back to `full`.
 */
export async function setMenuItemIcon(
  id: number,
  attachmentId: number,
  current: { size?: string; type?: string; titlePosition?: string } = {},
): Promise<ActionResult> {
  const iconId = Number.isFinite(attachmentId) && attachmentId > 0 ? Math.trunc(attachmentId) : 0;
  try {
    await adminFetch(`/wp/v2/menu-items/${id}`, {
      method: "POST",
      body: {
        meta: {
          _thumbnail_id: iconId,
          _menu_item_image_size: current.size || ICON_DEFAULTS.size,
          _menu_item_image_type: current.type || ICON_DEFAULTS.type,
          _menu_item_image_title_position: current.titlePosition || ICON_DEFAULTS.titlePosition,
        },
      },
    });
    bustPublicMenu();
    return { ok: true };
  } catch (e) {
    return fail(e, iconId ? "Couldn't set the icon." : "Couldn't clear the icon.");
  }
}

/** PERMANENT: menu items have no trash worth using — WordPress leaves a
 *  trashed item in the menu structure. force=true removes it outright. */
export async function deleteMenuItem(id: number): Promise<ActionResult> {
  try {
    await adminFetch(`/wp/v2/menu-items/${id}`, { method: "DELETE", query: { force: true } });
    bustPublicMenu();
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't remove the item.");
  }
}
