import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readCategories } from "@/lib/admin/categories";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for the category tree, fresh on every request (A6) — so a create/
// rename/delete is visible on the next fetch with no tag choreography.
export async function GET() {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token } = session;

  try {
    return NextResponse.json({ items: await readCategories(token), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "categories");
  }
}
