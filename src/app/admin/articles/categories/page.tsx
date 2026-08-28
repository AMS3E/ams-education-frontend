import CategoriesScreen from "@/components/admin/articles/CategoriesScreen";

// Client-first since the TanStack Query migration: the manager fetches through
// the /api/admin/categories BFF and caches in the browser.
export default function AdminCategoriesPage() {
  return (
    <CategoriesScreen />
  );
}
