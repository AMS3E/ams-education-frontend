import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readTags } from "@/lib/admin/tags";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

const PER_PAGE = 20;

// BFF read for the Tags manager (5.5k terms, search-first), fresh on every
// request (A6).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token } = session;

  const sp = new URL(req.url).searchParams;
  const params = {
    page: Math.max(1, Number(sp.get("page")) || 1),
    perPage: PER_PAGE,
    search: sp.get("q")?.trim() || undefined,
  };

  try {
    return NextResponse.json({ ...(await readTags(params, token)), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "tags");
  }
}
