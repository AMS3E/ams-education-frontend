import { redirect } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import MenusScreen from "@/components/admin/menus/MenusScreen";
import { getSession, can } from "@/lib/auth/session";

// Menus — the CMS surface for the public site's navigation. Client-first like
// every converted screen (fetches through /api/admin/menus). The shell runs
// the capability gate off the session cookie; WordPress enforces
// edit_theme_options on every write regardless, and the screen reports that
// refusal if a role somehow gets this far.
export default async function AdminMenusPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // manage_options stands in for edit_theme_options, which the login payload
  // does not carry — see the note on the sidebar's Menus entry.
  if (!can(session.user, "manage_options")) {
    return (
      <div className={css({ padding: "20px 22px" })}>
        <h1 className={css({ fontSize: "20px", fontWeight: 600 })}>Menus</h1>
        <p className={css({ fontSize: "13px", marginTop: "8px" })} style={{ color: ac.muted }}>
          Your account doesn&rsquo;t have permission to edit site menus.
        </p>
      </div>
    );
  }

  return <MenusScreen />;
}
