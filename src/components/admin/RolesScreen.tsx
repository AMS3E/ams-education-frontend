"use client";

// Role Management — read-only viewer over the plugin's web/roles endpoint
// (≥1.7.5): every role, its user count, and its GRANTED capabilities grouped
// by area. Deliberately not an editor: changing role capabilities is a
// WordPress-level operation with site-wide blast radius.

import { useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { Icon } from "./icons";
import { Surface, PageHeader, EmptyState } from "./ui";
import { Bar, SkeletonKeyframes } from "./Skeleton";
import RefreshButton from "./RefreshButton";
import { useRoles, useScreenRefresh, adminKeys } from "@/lib/admin/queries";
import type { RoleInfo } from "@/lib/admin/roles";

/** Bucket a capability into a human area. Order matters: first match wins. */
const CAP_GROUPS: { label: string; test: (c: string) => boolean }[] = [
  { label: "Programs & episodes", test: (c) => /movie|tv_show|episode|video|person|genre|playlist/.test(c) },
  { label: "Posts & pages", test: (c) => /post|page/.test(c) && !/wpseo/.test(c) },
  { label: "Media", test: (c) => /upload|unfiltered_upload/.test(c) },
  { label: "Categories & terms", test: (c) => /categor|term|taxonom/.test(c) },
  { label: "Comments", test: (c) => /comment|moderate/.test(c) },
  { label: "Users", test: (c) => /user/.test(c) && !/wpseo/.test(c) },
  { label: "SEO (Yoast)", test: (c) => /wpseo|yoast/.test(c) },
  { label: "Site administration", test: (c) => /manage|option|theme|plugin|update|install|import|export|customize|switch/.test(c) },
];

function groupCaps(caps: string[]): { label: string; caps: string[] }[] {
  const buckets = new Map<string, string[]>();
  for (const cap of caps) {
    const label = CAP_GROUPS.find((g) => g.test(cap))?.label ?? "Other";
    const list = buckets.get(label) ?? [];
    list.push(cap);
    buckets.set(label, list);
  }
  // Stable order: the group list first, then Other.
  const order = [...CAP_GROUPS.map((g) => g.label), "Other"];
  return order.filter((l) => buckets.has(l)).map((label) => ({ label, caps: buckets.get(label)! }));
}

export default function RolesScreen() {
  const roles = useRoles();
  const { refreshing, refresh } = useScreenRefresh("roles", [adminKeys.roles]);
  // Slug of the expanded role; the first role (Administrator, usually) starts open.
  const [open, setOpen] = useState<string | null>(null);

  const items = roles.data?.items ?? [];

  return (
    // Uncapped. The panels run the full width of the content column like every
    // other screen — a 1100px ceiling left the header and the role rows
    // stopping short of the edge with bare canvas beside them.
    <div>
      <PageHeader
        title="Roles"
        sub={roles.isPending ? "Loading…" : `${items.length} roles — read-only, because a capability change is a WordPress-level operation.`}
        actions={<RefreshButton fetchedAt={roles.data?.fetchedAt} refreshing={refreshing} onRefresh={refresh} />}
      />

      {/* The caveat is load-bearing, not decoration: a role's stored list is not
          the whole truth about what its holders can do. */}
      <p className={css({ fontSize: "12.5px", padding: "12px 22px", lineHeight: 1.7 })} style={{ color: ac.faint, background: ac.surface, borderBottom: `1px solid ${ac.border}` }}>
        Program capabilities (movies / TV shows / episodes) can also be granted at runtime by the AMS plugin, beyond
        what a role&rsquo;s stored list shows.
      </p>

      {roles.isPending ? (
        <div className={css({ display: "flex", flexDirection: "column", gap: "12px", padding: "16px 22px" })} aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <Surface key={i} style={{ padding: "16px 20px" }}>
              <Bar w={i % 2 ? 180 : 140} h={16} />
              <div style={{ marginTop: 8 }}>
                <Bar w={90} h={12} />
              </div>
            </Surface>
          ))}
          <SkeletonKeyframes />
        </div>
      ) : roles.isError ? (
        <Surface>
          <EmptyState icon="x" title="Couldn't load roles" body="Is plugin v1.7.5 deployed? Use Refresh to try again." />
        </Surface>
      ) : (
        <div className={css({ display: "flex", flexDirection: "column", gap: "12px", padding: "16px 22px" })}>
          {items.map((role) => (
            <RoleCard key={role.slug} role={role} open={open === role.slug} onToggle={() => setOpen((s) => (s === role.slug ? null : role.slug))} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({ role, open, onToggle }: { role: RoleInfo; open: boolean; onToggle: () => void }) {
  const groups = groupCaps(role.caps);
  return (
    <Surface style={{ overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          padding: "16px 20px",
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
          _hover: { background: "var(--colors-admin-surface-hover)" },
          _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "-2px" },
        })}
      >
        <Icon name="chevronRight" size={13} strokeWidth={2.2} style={{ color: ac.faint, flex: "none", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        <span className={css({ fontSize: "14.5px", fontWeight: 600 })}>{role.name}</span>
        <span className={css({ fontSize: "11.5px" })} style={{ fontFamily: "ui-monospace, monospace", color: ac.faint }}>{role.slug}</span>
        <div className={css({ flex: 1 })} />
        <span className={css({ fontSize: "12px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.muted }}>
          {role.userCount} user{role.userCount === 1 ? "" : "s"}
        </span>
        <span className={css({ fontSize: "12px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.faint }}>
          {role.caps.length} capabilit{role.caps.length === 1 ? "y" : "ies"}
        </span>
      </button>

      {open ? (
        <div className={css({ padding: "4px 20px 18px 45px" })} style={{ borderTop: `1px solid ${ac.rowLine}` }}>
          {groups.length === 0 ? (
            <div className={css({ fontSize: "13px", paddingTop: "12px" })} style={{ color: ac.muted }}>No capabilities granted.</div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className={css({ marginTop: "14px" })}>
                <div className={css({ fontSize: "11.5px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" })} style={{ color: ac.muted }}>
                  {g.label}
                  <span className={css({ fontWeight: 400, marginLeft: "6px" })} style={{ color: ac.faint }}>{g.caps.length}</span>
                </div>
                <div className={css({ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" })}>
                  {g.caps.map((cap) => (
                    <span key={cap} className={css({ fontSize: "11.5px", padding: "3px 9px", borderRadius: "99px", whiteSpace: "nowrap" })} style={{ fontFamily: "ui-monospace, monospace", background: ac.surfaceSunken, border: `1px solid ${ac.border}`, color: ac.sub }}>
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </Surface>
  );
}
