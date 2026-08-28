import { redirect } from "next/navigation";
import DashboardScreen from "@/components/admin/DashboardScreen";
import { getSession } from "@/lib/auth/session";

// Client-first since the TanStack Query migration: the screen fetches through
// /api/admin/dashboard and caches in the browser. This shell only resolves
// the greeting name from the session cookie (no WordPress round trip).
export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const firstName = session.user.name.split(/\s+/)[0] || session.user.name;
  return <DashboardScreen firstName={firstName} />;
}
