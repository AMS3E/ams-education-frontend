import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readMenuScreen, PROGRAM_ICON_MENU } from "@/lib/admin/menus";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for the Menus screen. Fresh per request like every other admin read
// since A6 — a reorder or rename is visible on the next fetch.
//
// TWO WordPress round trips (the menu list, then the chosen menu's items), and
// they are strictly sequential: the items query needs the menu's id, which
// only the first call knows. ~8s cold on WP REST; menus are not on the fast
// path because they need edit_theme_options.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return bffAuthRequired();

  const slug = new URL(request.url).searchParams.get("menu") || PROGRAM_ICON_MENU;

  try {
    const data = await readMenuScreen(slug, session.token);
    return NextResponse.json({ ...data, fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "menus");
  }
}
