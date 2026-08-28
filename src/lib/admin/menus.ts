// WordPress nav menus, for the dashboard's Menus screen.
//
// This is the CMS surface for the public site's own navigation — most visibly
// the program-icon strip under the header (មាតិកាឌីជីថល), which is WordPress's
// "AMS Infotainment Third Menu". Editing it here edits the SAME menu the old
// WordPress theme renders, so the two sites cannot drift apart.
//
// Reads go through core REST as the logged-in user, NOT the fast path: menus
// are an edit_theme_options surface, and /wp/v2/menus answers 401 to anyone
// anonymous (measured 2026-08-05). The fast path's pub-menu resource serves
// the PUBLIC site, which needs no session and gets published items only.

import { adminFetch } from "./client";
import { PROGRAM_ICON_MENU } from "./constants";
import { decodeEntities } from "@/lib/api/mappers";

export { PROGRAM_ICON_MENU };

interface RawMenu {
  id: number;
  name: string;
  slug: string;
  locations?: string[];
}

interface RawMenuItem {
  id: number;
  title: { raw?: string; rendered?: string };
  url: string;
  menu_order: number;
  parent: number;
  type: string;
  object: string;
  object_id: number;
  target: string;
  status: string;
  /** Empty `{}` until ams-frontend-api 1.7.6 registered these keys — see
   *  MenuItem.iconId. */
  meta?: Record<string, string | number>;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export interface MenuSummary {
  id: number;
  name: string;
  slug: string;
  /** Theme locations this menu is assigned to — the tell for which menu is
   *  actually rendered where. */
  locations: string[];
}

export interface MenuItem {
  id: number;
  /** The LABEL, from title.raw. title.rendered is not usable here: the menu-
   *  image plugin filters it into a `<span>…</span><img …>` blob, so rendered
   *  text would show markup in an input. */
  label: string;
  url: string;
  order: number;
  parent: number;
  type: string;
  target: string;
  /** Icon URL, parsed out of title.rendered — see iconFromRendered. This stays
   *  the DISPLAY source even now that the id is writable: it is the URL the
   *  live theme itself emits, already at the right rendition. */
  icon: string;
  /** The icon's attachment id, from `_thumbnail_id` — the menu-image plugin
   *  stores the icon as the item's FEATURED IMAGE, not under a `_menu_item_*`
   *  key (measured on live; `_menu_item_icon` exists and is always empty).
   *  Readable and writable since ams-frontend-api 1.7.6 registered it for
   *  `nav_menu_item` behind an edit_theme_options auth callback. 0 = no icon,
   *  which on the PUBLIC strip means the item is not rendered at all. */
  iconId: number;
  /** `_menu_item_image_size` — which rendition the theme draws (`menu-36x36`,
   *  `menu-48x48`, `full`). Carried so that replacing an icon preserves the
   *  item's existing choice rather than silently resizing it. */
  imageSize: string;
  /** `_menu_item_image_type` / `_menu_item_image_title_position`. Only used to
   *  tell a configured item from one that has never had an icon, so defaults
   *  are filled in for the latter without overriding the former. */
  imageType: string;
  titlePosition: string;
}

/** What an item that has never carried an icon gets, so it renders on BOTH
 *  sites. The values are the ones every existing row on this menu already
 *  has — measured, not chosen. */
export const ICON_DEFAULTS = {
  size: "menu-36x36",
  type: "image",
  titlePosition: "hide",
} as const;

/**
 * The icon URL out of a menu item's RENDERED title.
 *
 * The menu-image plugin stores its attachment id in postmeta under a key that
 * is not registered in REST, so `meta` comes back as `[]` and the id is not
 * readable from here. What IS readable is the rendered title, which the same
 * plugin has already filtered into `<span class="menu-image-title">LABEL</span>
 * <img … src="…">`. Pulling the src back out of that is the only way to show
 * the real icon without a plugin change — and it is exactly the URL the live
 * site renders, because it came from the live site's own filter.
 */
export function iconFromRendered(rendered: string): string {
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(rendered ?? "");
  return m ? m[1] : "";
}

export async function listMenus(token?: string): Promise<MenuSummary[]> {
  const { data } = await adminFetch<RawMenu[]>("/wp/v2/menus", {
    token,
    query: { per_page: 100, _fields: "id,name,slug,locations" },
  });
  return (data ?? []).map((m) => ({
    id: m.id,
    name: decodeEntities(m.name).trim(),
    slug: m.slug,
    locations: m.locations ?? [],
  }));
}

/** One menu's items, in menu order. `context=edit` is what makes title.raw
 *  available; without it there is no way to get the unfiltered label. */
export async function listMenuItems(menuId: number, token?: string): Promise<MenuItem[]> {
  const { data } = await adminFetch<RawMenuItem[]>("/wp/v2/menu-items", {
    token,
    query: {
      menus: menuId,
      per_page: 100,
      context: "edit",
      orderby: "menu_order",
      order: "asc",
      // Menu items can legitimately be drafts; the public site only renders
      // published ones, so the editor should show what it will publish.
      status: "publish,draft",
    },
  });
  return (data ?? []).map((i) => ({
    id: i.id,
    label: decodeEntities(i.title?.raw ?? "").trim(),
    url: i.url ?? "",
    order: i.menu_order ?? 0,
    parent: i.parent ?? 0,
    type: i.type ?? "custom",
    target: i.target ?? "",
    icon: iconFromRendered(i.title?.rendered ?? ""),
    iconId: Number(i.meta?._thumbnail_id ?? 0) || 0,
    imageSize: str(i.meta?._menu_item_image_size),
    imageType: str(i.meta?._menu_item_image_type),
    titlePosition: str(i.meta?._menu_item_image_title_position),
  }));
}

export interface MenuScreenData {
  menus: MenuSummary[];
  menu: MenuSummary | null;
  items: MenuItem[];
}

/** Everything the Menus screen needs: the menu list, plus one menu's items.
 *  Defaults to the program-icon menu, which is the one this screen exists for. */
export async function readMenuScreen(slug: string, token?: string): Promise<MenuScreenData> {
  const menus = await listMenus(token);
  const menu = menus.find((m) => m.slug === slug) ?? menus.find((m) => m.slug === PROGRAM_ICON_MENU) ?? null;
  const items = menu ? await listMenuItems(menu.id, token) : [];
  return { menus, menu, items };
}
