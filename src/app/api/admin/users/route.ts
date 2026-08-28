import { NextResponse } from "next/server";
import { getSession, can } from "@/lib/auth/session";
import { readUsers } from "@/lib/admin/users";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

const PER_PAGE = 20;

// BFF read for the Users screen, fresh on every request (A6). Still GATED on
// list_users here — this payload contains emails — and the fast endpoint
// re-checks the same capability server-side against the verified token, as
// WordPress itself would.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token, user } = session;
  if (!can(user, "list_users")) {
    return NextResponse.json({ error: "Your role can't view users." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const params = {
    page: Math.max(1, Number(sp.get("page")) || 1),
    perPage: PER_PAGE,
    search: sp.get("q")?.trim() || undefined,
    roles: sp.get("role") || undefined,
  };

  try {
    return NextResponse.json({ ...(await readUsers(params, token)), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "users");
  }
}
