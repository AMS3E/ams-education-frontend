import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readMedia } from "@/lib/admin/media";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

const PER_PAGE = 48;

// BFF read for the Media grid (115k items, search-first), fresh on every
// request (A6) — an upload is visible on the next fetch with no tag
// choreography. The fast path serves the whole library to every role with
// edit_posts (owner decision, 2026-08-04 — see fast.php's media resource).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token } = session;

  const sp = new URL(req.url).searchParams;
  const params = {
    page: Math.max(1, Number(sp.get("page")) || 1),
    perPage: PER_PAGE,
    search: sp.get("q")?.trim() || undefined,
    mediaType: sp.get("type") || undefined,
  };

  try {
    return NextResponse.json({ ...(await readMedia(params, token)), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "media");
  }
}
