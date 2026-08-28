import { notFound, redirect } from "next/navigation";
import SeoPanel from "@/components/admin/seo/SeoPanel";
import { getSession } from "@/lib/auth/session";
import { getPostForEdit, type EditablePost } from "@/lib/admin/post-edit";
import { AdminAuthError } from "@/lib/admin/client";

export default async function AdminSeoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let post: EditablePost | null = null;
  try {
    post = await getPostForEdit(id);
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }
  if (!post) notFound();
  return <SeoPanel post={post} />;
}
