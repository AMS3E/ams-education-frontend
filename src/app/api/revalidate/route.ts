import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { safeTag } from "@/lib/api/client";

/**
 * On-demand cache invalidation. Point a WordPress "post published/updated"
 * webhook here so fresh content appears immediately instead of waiting for the
 * time-based revalidation window:
 *
 *   POST /api/revalidate?secret=<REVALIDATE_SECRET>&tag=articles&tag=home&…
 *
 * `tag` may repeat — the AMS Frontend API plugin (≥1.7.3) sends every tag a
 * publish touches in ONE request. Tags in use across the app: "articles",
 * "home", "article:<slug>", "category:<slug>", "comments:<postId>",
 * "daily-events", "authors", "episodes", "tv-show:<id>", "program",
 * "program:<slug>", "featured-program", "menu".
 *
 * Send the RAW slug even when it is Khmer: tags are normalized through
 * safeTag() on both sides, so an over-long percent-encoded slug maps onto the
 * same hashed tag the page was cached under.
 */
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  if (searchParams.get("secret") !== process.env.REVALIDATE_SECRET) {
    // Log rejects (never the secret itself) so a misconfigured webhook shows up
    // in Vercel logs as "arriving but with the wrong secret" — distinct from
    // never arriving at all.
    console.warn("[revalidate] rejected — missing/invalid secret");
    return NextResponse.json({ ok: false, error: "invalid secret" }, { status: 401 });
  }

  const raws = searchParams.getAll("tag");
  if (raws.length === 0) raws.push("articles");
  // External CMS webhooks need immediate expiry: the first visitor after a
  // publish waits for regeneration and receives fresh content. Using "max"
  // here would serve that visitor the stale entry while refreshing behind it.
  const tags = raws.map((raw) => {
    const tag = safeTag(raw);
    revalidateTag(tag, { expire: 0 });
    return tag;
  });

  return NextResponse.json({ ok: true, revalidated: tags });
}
