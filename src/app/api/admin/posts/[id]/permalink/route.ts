import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPostPermalink } from "@/lib/admin/posts";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for one post's real WordPress permalink — the Articles list's
// Copy URL / View row actions fetch this on click rather than carrying `link`
// on every row of the (fast-path) list, which has no way to compute it.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return bffAuthRequired();

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) return NextResponse.json({ error: "Invalid post id." }, { status: 400 });

  try {
    const result = await getPostPermalink(postId, session.token);
    if (!result) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    return bffError(e, "post-permalink");
  }
}
