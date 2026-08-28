import NewProgramView from "@/components/admin/programs/NewProgramView";

// Create flow — Details + slug, no tabs. Creates the movie only; the episode
// collection (tv_show) is created on demand from the editor's Episodes tab.
export default function AdminNewProgramPage() {
  return <NewProgramView />;
}
