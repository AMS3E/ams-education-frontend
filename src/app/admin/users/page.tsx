import { redirect } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import UsersScreen from "@/components/admin/users/UsersScreen";
import { getSession, can } from "@/lib/auth/session";

// Client-first since the TanStack Query migration: the screen fetches through
// the /api/admin/users BFF. This shell only runs the capability gate off the
// session cookie (no WordPress round trip) — the BFF re-checks list_users on
// every request, and WordPress enforces it regardless.
export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!can(session.user, "list_users")) {
    return (
      <div className={css({ padding: "20px 22px" })}>
        <h1 className={css({ fontSize: "20px", fontWeight: 600 })}>Users</h1>
        <p className={css({ fontSize: "13px", marginTop: "8px" })} style={{ color: ac.muted }}>
          Your account doesn&rsquo;t have permission to manage users.
        </p>
      </div>
    );
  }

  // create_users isn't in the login-caps list; edit_users is the closest proxy
  // (both are admin-only in stock WordPress). WordPress enforces the real cap
  // on the POST either way — the action reports a 403 as the caps wall it is.
  return <UsersScreen canCreate={can(session.user, "edit_users")} />;
}
