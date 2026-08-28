import { NextResponse } from "next/server";
import { getSession, can } from "@/lib/auth/session";
import { readRoles } from "@/lib/admin/roles";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for Role Management, fresh on every request (A6). Still gated on
// list_users here, and re-checked by the fast endpoint server-side.
export async function GET() {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token, user } = session;
  if (!can(user, "list_users")) {
    return NextResponse.json({ error: "Your role can't view role management." }, { status: 403 });
  }

  try {
    return NextResponse.json({ items: await readRoles(token), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "roles");
  }
}
