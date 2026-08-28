"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon } from "../icons";
import { Dropdown, SearchInput, type Option } from "../Dropdown";
import { Surface, PageHeader, Button, IconButton, Badge, Table, Th, Td, Tr, TableFooter, EmptyState } from "../ui";
import { Bar, SkeletonKeyframes } from "../Skeleton";
import RefreshButton from "../RefreshButton";
import type { UserListResult } from "@/lib/admin/users";
import { createUserAction } from "@/lib/admin/screen-actions";

const ROLE_FILTERS: Option[] = [
  { label: "All roles", value: "" },
  { label: "Administrator", value: "administrator" },
  { label: "Editor", value: "editor" },
  { label: "Author", value: "author" },
  { label: "Contributor", value: "contributor" },
  { label: "SEO Manager", value: "seo_manager" },
  { label: "SEO Editor", value: "seo_editor" },
];

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

interface Query { search: string; role: string; page: number }

export default function UsersView({
  result,
  loading,
  fetching,
  error,
  fetchedAt,
  refreshing,
  onRefresh,
  onCreated,
  query,
  perPage,
  canCreate = false,
}: {
  result: UserListResult;
  /** First-ever load (nothing cached): the table renders skeleton rows. */
  loading: boolean;
  /** Any in-flight fetch (page turn, background refetch): rows dim slightly. */
  fetching: boolean;
  error: boolean;
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  /** Invalidate the users cache after a successful create. */
  onCreated: () => void;
  query: Query;
  perPage: number;
  canCreate?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [roleOpen, setRoleOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);
  // Row selection is Phoenix's table move. It is local and page-scoped on
  // purpose: nothing here acts on a selection yet, so persisting it across
  // pages would promise a bulk action that does not exist.
  // Sorting is PAGE-LOCAL and says so, because neither read path takes an
  // order parameter: the fast users resource and the REST fallback both pin
  // `orderby=name&order=asc`. Sorting the whole 84-row set would mean a
  // fast.php change and another plugin upload; sorting what is on screen is
  // honest and needs neither. The header shows the direction so nobody reads
  // it as a global sort.
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "name", dir: "asc" });

  const go = (next: { search?: string; role?: string; page?: number }) => {
    const search = next.search ?? query.search;
    const role = next.role ?? query.role;
    const page = next.page ?? 1;
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (role) p.set("role", role);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = new FormData(e.currentTarget).get("q");
    go({ search: typeof v === "string" ? v.trim() : "" });
  };

  const { items, total, totalPages } = result;
  const start = total === 0 ? 0 : (query.page - 1) * perPage + 1;
  const end = start === 0 ? 0 : start + items.length - 1;
  const roleLabel = ROLE_FILTERS.find((r) => r.value === query.role)?.label ?? "Role";

  const rows = [...items].sort((a, b) => {
    const pick = (u: (typeof items)[number]) => (sort.field === "name" ? u.name : sort.field === "email" ? u.email : u.roleLabel);
    const cmp = pick(a).localeCompare(pick(b), undefined, { sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  });

  /** Exports what is ON SCREEN — the sorted current page — not the whole set,
   *  for the same reason the sort is page-local. */
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["Name,Email,Role", ...rows.map((u) => [u.name, u.email, u.roleLabel].map(esc).join(","))].join("\r\n");
    // Leading BOM so Excel opens the Khmer display names as UTF-8 rather than
    // as mojibake, which is what a Windows locale does without it.
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ams-users-page-${query.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div>
      {/* Header rhythm (trail → title → actions) now lives in PageHeader, so
          every screen inherits it rather than re-deriving the spacing. */}
      <PageHeader
        title="Users"
        sub={loading ? "Loading…" : `${total.toLocaleString("en-US")} people can sign in to this dashboard`}
        actions={
          <>
            <RefreshButton fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} />
            <Button icon="copy" onClick={exportCsv} disabled={items.length === 0}>
              Export
            </Button>
            {canCreate ? (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  setCreatedName(null);
                  setCreating(true);
                }}
              >
                New user
              </Button>
            ) : null}
          </>
        }
      />

      <Surface>
      {/* Filters: the panel's first cell, above the content they scope. */}
      <div className={css({ display: "flex", alignItems: "center", gap: "10px", padding: "12px 22px", flexWrap: "wrap" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
        <form onSubmit={onSearch} className={css({ display: "flex" })}>
          <SearchInput placeholder="Search users…" name="q" defaultValue={query.search} width="300px" />
        </form>
        <Dropdown
          label={query.role ? roleLabel : "Role"}
          hasValue={!!query.role}
          open={roleOpen}
          onToggle={() => setRoleOpen((v) => !v)}
          onClose={() => setRoleOpen(false)}
          options={ROLE_FILTERS}
          selected={query.role}
          onSelect={(v) => go({ role: v })}
        />
      </div>

      {creating ? (
        <NewUserDialog
          onClose={() => setCreating(false)}
          onCreated={(username) => {
            // Land on a search for the new username: the list is alphabetical
            // across pages, so a bare refresh would usually hide the proof.
            setCreating(false);
            setCreatedName(username);
            go({ search: username });
            onCreated(); // invalidate the client users cache (the action busted the server tag)
          }}
        />
      ) : null}

      {createdName ? (
        <div
          role="status"
          className={css({ display: "flex", alignItems: "center", gap: "9px", padding: "10px 22px", fontSize: "13px" })}
          style={{ background: ac.dataSoft, borderBottom: `1px solid ${ac.data}`, color: ac.data }}
        >
          <Icon name="check" size={14} strokeWidth={2.2} />
          <span>
            User <strong>{createdName}</strong> created — the list below is filtered to it.
          </span>
          <div className={css({ flex: 1 })} />
          <button
            type="button"
            onClick={() => setCreatedName(null)}
            aria-label="Dismiss"
            className={css({ width: "24px", height: "24px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", _hover: { background: "var(--colors-admin-data-soft)" } })}
            style={{ color: ac.data }}
          >
            <Icon name="x" size={11} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

        <div style={{ opacity: fetching && !loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <Table>
            <thead>
              <tr>
                <SortTh field="name" sort={sort} onSort={setSort}>Name</SortTh>
                <SortTh field="email" sort={sort} onSort={setSort}>Email</SortTh>
                <SortTh field="role" sort={sort} onSort={setSort} width="180px">Role</SortTh>
                <Th width="60px" align="right" />
              </tr>
            </thead>
            <tbody>
              {loading && !error ? (
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} aria-busy>
                    <Td>
                      <span className={css({ display: "flex", alignItems: "center", gap: "10px" })}>
                        <Bar w={30} h={30} r={9} />
                        <Bar w={i % 2 ? 150 : 110} h={13} />
                      </span>
                    </Td>
                    <Td><Bar w={180} h={12} /></Td>
                    <Td><Bar w={78} h={20} r={6} /></Td>
                    <Td />
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <Td colSpan={4}>
                    <EmptyState icon="x" title="Couldn't load users" body="WordPress didn't answer. Use Refresh to try again." />
                  </Td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <Td colSpan={4}>
                    <EmptyState
                      icon="users"
                      title="No users match"
                      body={query.search || query.role ? "Try clearing the search or the role filter." : "Nobody has dashboard access yet."}
                    />
                  </Td>
                </tr>
              ) : (
                rows.map((u) => {
                  return (
                    <Tr key={u.id}>
                      <Td>
                        <span className={css({ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 })}>
                          <span
                            className={css({ width: "30px", height: "30px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 600, flex: "none" })}
                            style={{ background: ac.surfaceSunken, border: `1px solid ${ac.border}`, color: ac.muted }}
                          >
                            {initials(u.name)}
                          </span>
                          <span className={css({ fontSize: "13.5px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>{u.name}</span>
                        </span>
                      </Td>
                      <Td>
                        {/* Plain text, not a mailto link: nobody mails a user
                            from an admin list, and a blue link here reads as
                            navigation into the row. */}
                        <span
                          className={css({ fontSize: "12.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" })}
                          style={{ fontFamily: "ui-monospace, monospace", color: ac.muted }}
                        >
                          {u.email}
                        </span>
                      </Td>
                      <Td>
                        <Badge>{u.roleLabel}</Badge>
                      </Td>
                      <Td align="right">
                        <IconButton name="more" label={`Actions for ${u.name}`} size="sm" />
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
          <SkeletonKeyframes />
        </div>
        <TableFooter>
          <span>{loading ? <Bar w={90} h={13} /> : total === 0 ? "No results" : `${start}–${end} of ${total.toLocaleString("en-US")}`}</span>
          <span className={css({ display: "flex", gap: "6px" })}>
            <Button size="sm" icon="chevronLeft" disabled={query.page <= 1} onClick={() => go({ page: query.page - 1 })}>
              Previous
            </Button>
            <Button size="sm" iconRight="chevronRight" disabled={query.page >= totalPages} onClick={() => go({ page: query.page + 1 })}>
              Next
            </Button>
          </span>
        </TableFooter>
      </Surface>
    </div>
  );
}

// --- new-user dialog -------------------------------------------------------

// Roles this site actually assigns (the filter list minus "all"). Author is the
// default — it's what program editors and writers get here.
const NEW_USER_ROLES: Option[] = ROLE_FILTERS.filter((r) => r.value !== "");

/** 16 chars over a 72-symbol alphabet (~99 bits) — WordPress-strength. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("author");
  const [roleOpen, setRoleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldClass = css({ width: "100%", height: "36px", padding: "0 11px", borderRadius: "8px", fontSize: "13px" });
  const fieldStyle = { background: ac.surfaceSunken, border: `1px solid ${ac.border}`, color: ac.text } as const;
  const labelClass = css({ fontSize: "12px", marginBottom: "6px" });

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createUserAction({ username, email, password, name, role });
      if (!res.ok) {
        setError(res.error ?? "Couldn't create the user.");
        return;
      }
      onCreated(username);
    } catch (e) {
      // A thrown action (dead dev worker, stale build, network drop) must not
      // leave the dialog silently stuck on "Creating…".
      setError(e instanceof Error && e.message ? `Request failed: ${e.message}` : "Request failed — check the dev server console.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={css({ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" })}
      style={{ background: ac.overlay }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="New user"
        onClick={(e) => e.stopPropagation()}
        // No overflow:hidden here — it would clip the Role dropdown's menu,
        // which pops out of the card's absolutely-positioned wrapper.
        className={css({ width: "min(440px, 100%)", borderRadius: "14px" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}
      >
        <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <span className={css({ fontSize: "14px", fontWeight: 600 })}>New user</span>
          <button type="button" onClick={onClose} aria-label="Close" className={css({ width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", _hover: { background: ac.surfaceHover } })} style={{ color: ac.muted }}>
            <Icon name="x" size={12} strokeWidth={2.2} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className={css({ display: "flex", flexDirection: "column", gap: "14px", padding: "18px" })}
        >
          <div className={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" })}>
            <div>
              <div className={labelClass} style={{ color: ac.muted }}>Username</div>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="off" placeholder="login name" className={fieldClass} style={fieldStyle} />
            </div>
            <div>
              <div className={labelClass} style={{ color: ac.muted }}>Display name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="optional" className={fieldClass} style={fieldStyle} />
            </div>
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Email</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" placeholder="name@ams.com.kh" className={fieldClass} style={fieldStyle} />
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Password</div>
            <div className={css({ display: "flex", gap: "8px" })}>
              <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="min 8 characters" className={fieldClass} style={{ ...fieldStyle, fontFamily: "ui-monospace, monospace" }} />
              <button type="button" onClick={() => setPassword(generatePassword())} className={css({ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "12.5px", cursor: "pointer", flex: "none", transition: "border-color .12s", _hover: { borderColor: ac.borderStrong } })} style={fieldStyle}>
                Generate
              </button>
            </div>
            <div className={css({ fontSize: "11.5px", marginTop: "6px" })} style={{ color: ac.faint }}>
              Copy it before creating — it isn&rsquo;t shown again.
            </div>
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Role</div>
            <Dropdown
              label={NEW_USER_ROLES.find((r) => r.value === role)?.label ?? "Role"}
              hasValue
              open={roleOpen}
              onToggle={() => setRoleOpen((v) => !v)}
              onClose={() => setRoleOpen(false)}
              options={NEW_USER_ROLES}
              selected={role}
              onSelect={setRole}
              minWidth={200}
            />
          </div>

          {error ? (
            <p role="alert" className={css({ fontSize: "12.5px", margin: 0 })} style={{ color: ac.danger }}>{error}</p>
          ) : null}

          <div className={css({ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" })}>
            <button type="button" onClick={onClose} className={css({ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", transition: "border-color .12s", _hover: { borderColor: ac.borderStrong } })} style={fieldStyle}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={css({ height: "36px", padding: "0 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", transition: "background .12s", _hover: { background: ac.accentHover } })} style={{ background: ac.accent, opacity: busy ? 0.7 : 1 }}>
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type SortField = "name" | "email" | "role";

/** A sortable column header, Phoenix's Members table anatomy. The arrow shows
 *  the ACTIVE direction and dims when the column is not the sort key, so the
 *  control never implies an order it is not applying. */
function SortTh({
  children,
  field,
  sort,
  onSort,
  width,
}: {
  children: React.ReactNode;
  field: SortField;
  sort: { field: SortField; dir: "asc" | "desc" };
  onSort: (s: { field: SortField; dir: "asc" | "desc" }) => void;
  width?: string;
}) {
  const active = sort.field === field;
  return (
    <Th width={width}>
      <button
        type="button"
        onClick={() => onSort({ field, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
        aria-label={`Sort by ${field}, ${active && sort.dir === "asc" ? "descending" : "ascending"}`}
        className={css({
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          background: "transparent",
          border: "none",
          padding: 0,
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          cursor: "pointer",
          color: "inherit",
          _hover: { color: "var(--colors-admin-text)" },
          _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px", borderRadius: "4px" },
        })}
      >
        {children}
        <Icon
          name={active && sort.dir === "desc" ? "arrowDown" : "arrowUp"}
          size={11}
          strokeWidth={2.4}
          style={{ opacity: active ? 1 : 0.32 }}
        />
      </button>
    </Th>
  );
}
