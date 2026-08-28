import { redirect } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import SettingsForm from "@/components/admin/SettingsForm";
import { getSession, can } from "@/lib/auth/session";
import { readSettings, type SiteSettings } from "@/lib/admin/settings";
import { readCategories, type CategoryNode } from "@/lib/admin/categories";
import { readPrograms, type ProgramItem } from "@/lib/admin/programs";
import { readFeaturedConfig, type FeaturedConfig } from "@/lib/admin/featured";
import { AdminAuthError } from "@/lib/admin/client";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!can(session.user, "manage_options")) {
    return (
      <div className={css({ padding: "20px 22px" })}>
        <h1 className={css({ fontSize: "20px", fontWeight: 600 })}>Settings</h1>
        <p className={css({ fontSize: "13px", marginTop: "8px" })} style={{ color: ac.muted }}>
          Your account doesn&rsquo;t have permission to change site settings.
        </p>
      </div>
    );
  }

  let settings: SiteSettings;
  let categories: CategoryNode[];
  let programs: ProgramItem[];
  let featured: FeaturedConfig | null;
  try {
    // One round trip. The banner extras degrade independently (featured null /
    // programs empty renders the card's own error state) — the core settings
    // form must not go down with them.
    [settings, categories, programs, featured] = await Promise.all([
      readSettings(),
      readCategories(),
      readPrograms().catch(() => [] as ProgramItem[]),
      readFeaturedConfig().catch(() => null),
    ]);
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }
  return <SettingsForm settings={settings} categories={categories} programs={programs} featured={featured} />;
}
