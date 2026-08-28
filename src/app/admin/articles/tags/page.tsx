import TagsScreen from "@/components/admin/articles/TagsScreen";

// Client-first since the TanStack Query migration: the manager fetches through
// the /api/admin/tags BFF and caches in the browser. Search/page state stays
// in the URL, read client-side via useSearchParams.
export default function AdminTagsPage() {
  return (
    <TagsScreen />
  );
}
