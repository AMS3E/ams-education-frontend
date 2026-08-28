import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readAuthorOptions } from "@/lib/admin/users";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for the Articles list's author filter, fresh on every request
// (A6). The fast path answers "users with a published post" for every role —
// REST cannot (this install 403s /wp/v2/users to non-list_users callers).
export async function GET() {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token } = session;

  try {
    return NextResponse.json({ items: await readAuthorOptions(token), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "authors");
  }
}
