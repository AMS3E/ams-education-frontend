"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { BrandLockup } from "./brand";
import { Icon, type IconName } from "./icons";
import ThemeControl from "./ThemeControl";
import AccountMenu, { type AccountUser } from "./AccountMenu";

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Extra path prefixes that should also light this item (e.g. the editor). */
  also?: string[];
  /** WordPress capability required to see this item; omit for always-on. */
  cap?: string;
}

interface NavGroup {
  /** Section heading. Aurora and Phoenix both group their nav this way, and it
   *  is the cheapest legibility win in the shell: eight flat items read as a
   *  list to scan, three labelled groups read as a place you know. */
  title: string;
  items: NavItem[];
}

// Capability-aware nav. The admin-only items carry the WordPress capability that
// gates them (see ams_afa_login_caps): Users needs list_users, Settings needs
// manage_options. The layout resolves the real session and passes `capabilities`
// down, so an item drops out for anyone who lacks its cap — and a group whose
// every item is filtered out disappears with them.
const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/admin", icon: "dashboard" }],
  },
  {
    title: "Content",
    items: [
      { label: "Articles", href: "/admin/articles", icon: "articles" },
      { label: "Programs", href: "/admin/programs", icon: "programs" },
      { label: "Media", href: "/admin/media", icon: "media" },
    ],
  },
  {
    title: "Site",
    items: [
      // Menus, Users and Roles pulled from the nav on request (2026-08-28) —
      // the screens still exist at /admin/menus, /admin/users, /admin/roles,
      // just unlisted here. The group disappears with them (see the `.filter`
      // below), same mechanism as the already-hidden Settings/SEO entries.
      // { label: "Menus", href: "/admin/menus", icon: "list", cap: "manage_options" },
      // NO "SEO" entry, on the owner's call (2026-08-12): the Yoast metabox
      // under the article covers the day-to-day, so the standalone workbench
      // came out of the nav. The screens still exist at /admin/seo — put the
      // item back here the day a bulk SEO pass is actually wanted.
      // { label: "Users", href: "/admin/users", icon: "users", cap: "list_users" },
      // { label: "Roles", href: "/admin/roles", icon: "eye", cap: "list_users" },
      // { label: "Settings", href: "/admin/settings", icon: "settings", cap: "manage_options" },
    ],
  },
];

const navRow = css({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "9px 12px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px",
  transition: "background .12s, color .12s",
  _hover: { background: "var(--colors-admin-surface-hover)" },
});

// Section heading: small, tracked-out uppercase. The size difference alone is
// what makes eight items read as three labelled groups instead of one long list
// — at body size a heading competes with the rows it is meant to be organising.
const navHeading = css({
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "0 12px",
  marginBottom: "6px",
});

export default function AdminSidebar({ capabilities, user }: { capabilities: Record<string, boolean>; user: AccountUser }) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    // Dashboard is the index, so match it exactly; every other item owns its
    // subtree (so /admin/articles/123 keeps "Articles" lit).
    if (item.href === "/admin") return pathname === "/admin";
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
    return (item.also ?? []).some(p => pathname.startsWith(p));
  };

  const groups = GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => !item.cap || capabilities[item.cap] === true),
  })).filter(g => g.items.length > 0);

  return (
    <aside
      className={css({
        width: "232px",
        flex: "none",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      })}
      style={{ background: ac.surface, borderRight: `1px solid ${ac.border}` }}>
      {/* Brand — mark and name, left-aligned across the rail, closed off with a
          rule so the identity block reads as the header of the nav rather than
          as its first item. */}
      <div className={css({ padding: "18px 16px 17px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
        <BrandLockup />
      </div>

      {/* Grouped nav */}
      <nav className={css({ display: "flex", flexDirection: "column", gap: "18px", padding: "16px 12px 20px" })}>
        {groups.map(group => (
          <div key={group.title}>
            <div className={navHeading} style={{ color: ac.faint }}>
              {group.title}
            </div>
            <div className={css({ display: "flex", flexDirection: "column", gap: "2px" })}>
              {group.items.map(item => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={navRow}
                    style={{
                      // Selection carries the accent now. It was neutral while
                      // the accent WAS neutral — back then `accentText` meant
                      // "clickable", and colouring one row in a list where every
                      // row is clickable said the wrong thing. With a teal
                      // accent that ambiguity is gone, and the selected row is
                      // marked three ways at once: hue, tint and weight.
                      color: active ? ac.accentText : ac.sub,
                      background: active ? ac.accentTint : undefined,
                      fontWeight: active ? 600 : 400,
                    }}>
                    <Icon name={item.icon} size={17} strokeWidth={active ? 1.9 : 1.6} style={{ flex: "none" }} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={css({ flex: "1" })} />

      {/* Foot. The theme control and the account menu used to live in a sticky
          top bar; that bar is gone and they sit here now, which is also where
          the account menu originally was before the restyle moved it up.
          `flex: none` so a long nav scrolls past them rather than squashing
          them, and a rule above so the block reads as its own zone.

          (No global "Refresh data" row — every screen has its own
          "Refresh · updated Xm ago" scoped to that screen's caches; a global
          bust would cold-start everything at once.) */}
      <div
        className={css({ flex: "none", display: "flex", flexDirection: "column", gap: "10px", padding: "12px" })}
        style={{ borderTop: `1px solid ${ac.border}` }}>
        <ThemeControl />
        <AccountMenu user={user} />
      </div>
    </aside>
  );
}
