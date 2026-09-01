import { redirect } from "next/navigation";
import ArticleEditor from "@/components/admin/articles/ArticleEditor";
import { readCategories, type CategoryNode } from "@/lib/admin/categories";
import { listPostTemplates, type PostTemplate } from "@/lib/admin/post-edit";
import { AdminAuthError } from "@/lib/admin/client";

// New Article — the editor with no post. Categories are loaded so the picker is
// real; everything else starts blank. Nothing exists in WordPress until the
// editor's first autosave creates the draft (once something is written, a
// minute in) — from then on it edits that draft in place under its real URL.
export default async function AdminNewArticlePage() {
  let categories: CategoryNode[] = [];
  let templates: PostTemplate[] = [];
  try {
    // Both at once — see the [id] page for why this must not be sequential.
    [categories, templates] = await Promise.all([readCategories(), listPostTemplates()]);
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    // A category-list hiccup shouldn't block creating an article.
  }
  return <ArticleEditor categories={categories} templates={templates} />;
}
