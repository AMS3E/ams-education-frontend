import { redirect } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import RolesScreen from "@/components/admin/RolesScreen";
import { getSession, can } from "@/lib/auth/session";

// Role Management — read-only roles/capabilities viewer. Client-first like
// every converted screen (fetches through /api/admin/roles). The shell runs
// the capability gate off the session cookie; the BFF re-checks list_users
// on every request, and WordPress gates the underlying endpoint regardless.
export default async function AdminRolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!can(session.user, "list_users")) {
    return (
      <div className={css({ padding: "20px 22px" })}>
        <h1 className={css({ fontSize: "20px", fontWeight: 600 })}>Role Management</h1>
        <p className={css({ fontSize: "13px", marginTop: "8px" })} style={{ color: ac.muted }}>
          Your account doesn&rsquo;t have permission to view roles.
        </p>
      </div>
    );
  }

  return <RolesScreen />;
}
