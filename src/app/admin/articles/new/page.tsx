import { redirect } from "next/navigation";
import ArticleEditor from "@/components/admin/articles/ArticleEditor";
import { readCategories, type CategoryNode } from "@/lib/admin/categories";
import { listPostTemplates, type PostTemplate } from "@/lib/admin/post-edit";
import { listAuthors, type AuthorOption } from "@/lib/admin/users";
import { readProfile } from "@/lib/admin/settings";
import { AdminAuthError } from "@/lib/admin/client";

// New Article — the editor with no post. Categories are loaded so the picker is
// real; everything else starts blank. Nothing exists in WordPress until the
// editor's first autosave creates the draft (once something is written, a
// minute in) — from then on it edits that draft in place under its real URL.
export default async function AdminNewArticlePage() {
  let categories: CategoryNode[] = [];
  let templates: PostTemplate[] = [];
  let authors: AuthorOption[] = [];
  let currentAuthor: AuthorOption | null = null;
  try {
    // All at once — see the [id] page for why this must not be sequential.
    // The profile fetch degrades on its own (.catch): the signed-in user's
    // name is a nicety for the Author row's initial label, never worth
    // failing the whole screen over.
    [categories, templates, authors, currentAuthor] = await Promise.all([
      readCategories(),
      listPostTemplates(),
      listAuthors(),
      readProfile().then((p) => ({ id: p.id, name: p.name })).catch(() => null),
    ]);
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    // A category-list hiccup shouldn't block creating an article.
  }
  return <ArticleEditor categories={categories} templates={templates} authors={authors} currentAuthor={currentAuthor} />;
}
