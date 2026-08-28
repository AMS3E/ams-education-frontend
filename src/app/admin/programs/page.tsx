import ProgramsScreen from "@/components/admin/programs/ProgramsScreen";

// Client-first since the TanStack Query migration: the screen fetches through
// the /api/admin/programs BFF and caches in the browser.
export default function AdminProgramsPage() {
  return <ProgramsScreen />;
}
