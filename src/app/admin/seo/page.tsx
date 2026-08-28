import { redirect } from "next/navigation";
import SeoListScreen from "@/components/admin/seo/SeoListScreen";
import { getSession } from "@/lib/auth/session";
import { listSeoRows, type SeoListResult } from "@/lib/admin/seo";
import { AdminAuthError } from "@/lib/admin/client";

// Server-first, unlike the TanStack-converted lists: this read has no fast-path
// resource and no BFF route, and the workbench is a low-traffic sweep tool —
// URL-driven pagination straight off searchParams is the whole state model.
export default async function AdminSeoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  let result: SeoListResult | null = null;
  try {
    result = await listSeoRows({ page, search: q || undefined, perPage: 20 });
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    // Leave result null — the screen renders its error state.
  }

  return <SeoListScreen result={result} query={{ q, page }} />;
}
