import MediaScreen from "@/components/admin/media/MediaScreen";

// Client-first since the TanStack Query migration: the screen fetches through
// the /api/admin/media BFF and caches in the browser.
export default function AdminMediaPage() {
  return <MediaScreen />;
}
