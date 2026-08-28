import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readPrograms } from "@/lib/admin/programs";
import { bffAuthRequired, bffError } from "@/lib/admin/bff";

// BFF read for the Programs list (~20 movies), fresh on every request (A6).
export async function GET() {
  const session = await getSession();
  if (!session) return bffAuthRequired();
  const { token } = session;

  try {
    return NextResponse.json({ items: await readPrograms(token), fetchedAt: Date.now() });
  } catch (e) {
    return bffError(e, "programs");
  }
}
