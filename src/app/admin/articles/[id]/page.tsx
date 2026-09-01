import { notFound, redirect } from "next/navigation";
import ArticleEditor from "@/components/admin/articles/ArticleEditor";
import { getPostForEdit, listPostTemplates, type EditablePost, type PostTemplate } from "@/lib/admin/post-edit";
import { readCategories, type CategoryNode } from "@/lib/admin/categories";
import { AdminAuthError } from "@/lib/admin/client";

// The article editor, loading the real post selected by [id] plus the category
// tree, both as the logged-in user.
export default async function AdminArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();

  let post: EditablePost | null;
  let categories: CategoryNode[];
  // Third leg of the SAME Promise.all, deliberately: every REST call here costs
  // the site's fixed ~4s bootstrap, so the template list has to ride alongside
  // the post rather than after it. listPostTemplates never throws — a missing
  // list degrades the Template control, it must not fail the screen.
  let templates: PostTemplate[];
  try {
    [post, categories, templates] = await Promise.all([
      getPostForEdit(postId),
      readCategories(),
      listPostTemplates(),
    ]);
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }

  if (!post) notFound();
  return <ArticleEditor post={post} categories={categories} templates={templates} />;
}
