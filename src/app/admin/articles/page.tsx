import ArticlesScreen from "@/components/admin/articles/ArticlesScreen";

// Client-first since the TanStack Query migration (docs/admin-dashboard-
// next-steps.md "DECIDED 2026-08-03"): the screen fetches through the
// /api/admin/* BFF and caches in the browser, so revisits render instantly
// with no server round trip. The filter state stays in the URL — read by the
// screen via useSearchParams, not the searchParams prop, so client-side
// back/forward serves straight from the query cache. The route itself is
// dynamic regardless (the admin layout reads the session cookie).
export default function AdminArticlesPage() {
  return <ArticlesScreen />;
}
