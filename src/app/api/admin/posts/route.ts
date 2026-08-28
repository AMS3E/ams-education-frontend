import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readPosts, type ListPostsParams } from "@/lib/admin/posts";
import { DEFAULT_STATUSES } from "@/lib/admin/constants";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for the admin Articles list, served FRESH on every request — the
// fast path answers in ~300ms, so the old shared 30min `unstable_cache` tier
// (and its visibility-scoped keys) is gone (A6). The route's remaining jobs:
// keep the httpOnly token out of browser JS, and normalize the filter params.
// The browser's TanStack Query cache still dedupes and serves back/forward.

// 20 rows a page (owner's call). ArticlesScreen mirrors this for its
// skeleton row count and its "1-20 of N" footer — change both together.
const PER_PAGE = 20;

/** Date-preset key → ISO lower bound, truncated to LOCAL MIDNIGHT so every
 *  request within a day produces the same string — an intra-day-stable cache
 *  key. (The old per-request `toISOString()` would have made every request
 *  its own cache entry.) */
function afterFromPreset(preset: string): string | undefined {
  if (!preset) return undefined;
  const now = new Date();
  const d = new Date(now);
  if (preset === "7d") d.setDate(now.getDate() - 7);
  else if (preset === "30d") d.setDate(now.getDate() - 30);
  else if (preset === "year") return `${now.getFullYear()}-01-01T00:00:00`;
  else return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token } = session;

  const sp = new URL(req.url).searchParams;
  const params: ListPostsParams = {
    page: Math.max(1, Number(sp.get("page")) || 1),
    perPage: PER_PAGE,
    search: sp.get("q")?.trim() || undefined,
    status: sp.get("status") || DEFAULT_STATUSES,
    categoryId: Number(sp.get("category")) || undefined,
    authorId: Number(sp.get("author")) || undefined,
    after: afterFromPreset(sp.get("date") ?? ""),
  };

  try {
    return NextResponse.json({ ...(await readPosts(params, token)), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "posts");
  }
}
