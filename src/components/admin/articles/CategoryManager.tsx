"use client";

import { Fragment, useMemo, useState } from "react";
import { css, cx } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon } from "../icons";
import { SearchInput } from "../Dropdown";
import { Surface, PageHeader, Button, Input, Table, Th, Td, Tr, TableFooter, EmptyState } from "../ui";
import { Bar, SkeletonKeyframes } from "../Skeleton";
import RefreshButton from "../RefreshButton";
import ArticlesTabs from "./ArticlesTabs";
import ConfirmDialog from "../ConfirmDialog";
import type { CategoryNode } from "@/lib/admin/categories";
import { createCategory, deleteCategory, renameCategory, setCategoryParent } from "@/lib/admin/screen-actions";

// The category tree is a real hierarchy on this site (26 terms, three levels
// deep). WordPress exposes that as a "Parent Category" dropdown on a separate
// Add-Category form, which makes nesting something you have to know about
// beforehand. Here the tree itself is the interface: every row can grow a
// child in place, and moving a branch is a picker on the row that moves —
// no dropdown hunting, no re-typing a name to re-file it.

/** Native <select> on the shared control geometry — the parent picker is a long
 *  hierarchical list, which the browser's own menu handles better than a
 *  custom one (type-ahead, keyboard, no popup clipping). */
const selectClass = css({
  height: "36px",
  padding: "0 8px",
  borderRadius: "9px",
  fontSize: "13px",
  fontFamily: "inherit",
  cursor: "pointer",
  maxWidth: "260px",
  color: "var(--colors-admin-text)",
  background: "var(--colors-admin-surface-sunken)",
  border: "1px solid var(--colors-admin-border)",
  transition: "border-color .13s ease",
  _hover: { borderColor: "var(--colors-admin-border-strong)" },
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
});

/** Inline cell editor — fills its cell without the 36px control chrome, so a
 *  row does not grow when you click into it. */
const cellInput = css({
  width: "100%",
  minWidth: 0,
  height: "30px",
  padding: "0 9px",
  borderRadius: "7px",
  fontSize: "13.5px",
  fontFamily: "inherit",
  color: "var(--colors-admin-text)",
  background: "var(--colors-admin-surface-sunken)",
  border: "1px solid var(--colors-admin-border-strong)",
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "1px" },
});

/** Depth marker on a child row. */
const TREE_ELBOW = "\u2514";
/** One level of indent inside an <option>. NON-BREAKING spaces: a select
 *  collapses ordinary leading whitespace, so plain spaces would flatten the
 *  hierarchy in every parent picker. */
const INDENT = "\u00A0\u00A0";
const TOP_LEVEL_OPTION = "\u2014 Top level \u2014";

/** Row actions are per-row and mutually exclusive: at most one row is being
 *  renamed, moved, or given a child at a time. */
type RowMode = { kind: "rename" | "move" | "addChild"; id: number } | null;

export default function CategoryManager({
  categories,
  loading,
  error: loadError,
  fetchedAt,
  refreshing,
  onRefresh,
  onMutated,
}: {
  categories: CategoryNode[];
  loading: boolean;
  error: boolean;
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  /** Invalidate the categories cache after a successful write. */
  onMutated: () => void;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RowMode>(null);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // The term awaiting confirmation; the dialog stays up across the write so a
  // rejection lands in it instead of a native popup.
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string; kids: number } | null>(null);
  const [delError, setDelError] = useState<string | null>(null);

  // Parent → children, and the descendant set of any term. Both come off the
  // same flat depth-ordered list the BFF returns.
  const { childrenOf, descendantsOf } = useMemo(() => {
    const kids = new Map<number, CategoryNode[]>();
    for (const c of categories) {
      const list = kids.get(c.parent) ?? [];
      list.push(c);
      kids.set(c.parent, list);
    }
    const descendantsOf = (id: number): Set<number> => {
      const out = new Set<number>();
      const walk = (p: number) => {
        for (const k of kids.get(p) ?? []) {
          out.add(k.id);
          walk(k.id);
        }
      };
      walk(id);
      return out;
    };
    return { childrenOf: kids, descendantsOf };
  }, [categories]);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tops = categories.filter((c) => c.depth === 0).length;

  // Search keeps a match's ANCESTORS visible, so a hit three levels down still
  // reads as part of its branch instead of floating context-free.
  const q = search.trim();
  const visible = useMemo(() => {
    if (!q) {
      const hidden = new Set<number>();
      for (const id of collapsed) for (const d of descendantsOf(id)) hidden.add(d);
      return categories.filter((c) => !hidden.has(c.id));
    }
    const keep = new Set<number>();
    for (const c of categories) {
      if (!c.name.includes(q) && !c.slug.includes(q)) continue;
      keep.add(c.id);
      let p = c.parent;
      while (p) {
        keep.add(p);
        p = byId.get(p)?.parent ?? 0;
      }
    }
    return categories.filter((c) => keep.has(c.id));
  }, [categories, q, collapsed, descendantsOf, byId]);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const closeRow = () => {
    setMode(null);
    setDraft("");
    setError(null);
  };

  /** Run a write, surface its error, and refresh on success. */
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? fallback);
      return false;
    }
    onMutated();
    return true;
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await run(() => createCategory(name, newParent), "Couldn't create.")) {
      setNewName("");
      setNewParent(0);
      setAdding(false);
    }
  };

  const submitChild = async (parent: number) => {
    const name = draft.trim();
    if (!name) return;
    if (await run(() => createCategory(name, parent), "Couldn't create.")) {
      // A new child is only useful if you can see it.
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parent);
        return next;
      });
      closeRow();
    }
  };

  const submitRename = async (id: number) => {
    const name = draft.trim();
    if (!name) return;
    if (await run(() => renameCategory(id, name), "Couldn't rename.")) closeRow();
  };

  const submitMove = async (id: number, parent: number) => {
    if (await run(() => setCategoryParent(id, parent), "Couldn't move.")) closeRow();
  };

  const doRemove = async () => {
    const target = confirmDel;
    if (!target || busy) return;
    setBusy(true);
    setDelError(null);
    const res = await deleteCategory(target.id);
    setBusy(false);
    if (!res.ok) {
      setDelError(res.error ?? "Couldn't delete.");
      return;
    }
    setConfirmDel(null);
    onMutated();
  };

  /** Options for a "move under" picker: every term except the one moving and
   *  its own descendants (WordPress would reject those as cycles). */
  const moveOptions = (id: number) => {
    const banned = descendantsOf(id);
    banned.add(id);
    return categories.filter((c) => !banned.has(c.id));
  };

  return (
    <div>
      {/* Title band, then everything else in one panel — the Articles list's
          shape. No `trail`: the tab strip below already says where you are. */}
      <PageHeader
        title="Categories"
        sub={loading ? "Loading…" : `${categories.length} categories · ${tops} top-level`}
        actions={
          <>
            <RefreshButton fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} />
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                setAdding((v) => !v);
                closeRow();
              }}
            >
              New category
            </Button>
          </>
        }
      />

      <Surface>
        {/* The tab strip is rendered HERE rather than by the page, so it can sit
            inside the panel and carry this screen's search in its trailing
            slot — same row, one rule under both. */}
        <ArticlesTabs
          trailing={
            <>
              <SearchInput placeholder="Search categories…" value={search} onValueChange={setSearch} width="260px" />
              {collapsed.size > 0 ? <Button onClick={() => setCollapsed(new Set())}>Expand all</Button> : null}
            </>
          }
        />

      {adding ? (
        <div className={css({ padding: "14px 22px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
        <div className={css({ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" })}>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNew();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="New category name…"
            className={css({ flex: 1, minWidth: "220px", maxWidth: "360px" })}
          />
          <label className={css({ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" })} style={{ color: ac.muted }}>
            under
            <select value={newParent} onChange={(e) => setNewParent(Number(e.target.value))} className={selectClass}>
              <option value={0}>— Top level —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{`${"  ".repeat(c.depth)}${c.name}`}</option>
              ))}
            </select>
          </label>
          <Button variant="primary" disabled={busy} onClick={() => void submitNew()}>
            {busy ? "Creating…" : "Create"}
          </Button>
          <Button
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className={css({ fontSize: "12.5px", padding: "10px 22px" })} style={{ color: ac.danger, background: ac.dangerTint, borderBottom: `1px solid ${ac.danger}` }}>
          {error}
        </p>
      ) : null}

        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th width="240px">Slug</Th>
              <Th width="90px" align="right">Posts</Th>
              <Th width="240px" align="right" />
            </tr>
          </thead>
          <tbody>
            {loading && !loadError ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-busy>
                  <Td><Bar w={i % 2 ? 180 : 130} h={14} /></Td>
                  <Td><Bar w={140} h={12} /></Td>
                  <Td align="right"><Bar w={40} h={12} /></Td>
                  <Td />
                </tr>
              ))
            ) : loadError ? (
              <tr>
                <Td colSpan={4}>
                  <EmptyState icon="x" title="Couldn't load categories" body="WordPress didn't answer. Use Refresh to try again." />
                </Td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <Td colSpan={4}>
                  <EmptyState icon="folder" title="No categories match" body={q ? "Try a shorter search term." : "The tree is empty."} />
                </Td>
              </tr>
            ) : (
              visible.map((c) => {
                const kids = childrenOf.get(c.id)?.length ?? 0;
                const isCollapsed = collapsed.has(c.id);
                const renaming = mode?.kind === "rename" && mode.id === c.id;
                const moving = mode?.kind === "move" && mode.id === c.id;
                const addingChild = mode?.kind === "addChild" && mode.id === c.id;
                return (
                  <Fragment key={c.id}>
                    <Tr className={css({ "&:hover [data-act]": { opacity: 1 } })}>
                      {/* Depth is indentation on the name cell rather than nested
                          tables: the hierarchy is this screen's whole point, and
                          one flat row list keeps the columns aligned at every
                          level. */}
                      <Td>
                        <span className={css({ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 })} style={{ paddingLeft: c.depth * 22 }}>
                          {kids > 0 && !q ? (
                            <button
                              type="button"
                              onClick={() => toggle(c.id)}
                              aria-expanded={!isCollapsed}
                              aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${c.name}`}
                              className={css({
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "20px",
                                height: "20px",
                                borderRadius: "5px",
                                cursor: "pointer",
                                background: "transparent",
                                border: "none",
                                flex: "none",
                                transition: "background .12s",
                                _hover: { background: "var(--colors-admin-surface-sunken)" },
                                _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "1px" },
                              })}
                              style={{ color: ac.muted }}
                            >
                              <Icon name="chevronDown" size={12} strokeWidth={2.2} style={{ transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform .12s" }} />
                            </button>
                          ) : (
                            <span className={css({ width: "20px", flex: "none", textAlign: "center", fontSize: "12px" })} style={{ color: ac.faint }}>
                              {c.depth > 0 ? TREE_ELBOW : ""}
                            </span>
                          )}
                          {renaming ? (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void submitRename(c.id);
                                if (e.key === "Escape") closeRow();
                              }}
                              className={cellInput}
                            />
                          ) : (
                            <span className={css({ fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })} style={{ fontWeight: c.depth === 0 ? 500 : 400 }}>
                              {c.name}
                            </span>
                          )}
                          {kids > 0 && isCollapsed ? (
                            <span className={css({ fontSize: "11px", flex: "none", padding: "2px 7px", borderRadius: "999px" })} style={{ background: ac.surfaceSunken, color: ac.muted }}>
                              {kids}
                            </span>
                          ) : null}
                        </span>
                      </Td>

                      <Td>
                        <span className={css({ fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" })} style={{ fontFamily: "ui-monospace, monospace", color: ac.muted }}>
                          {c.slug}
                        </span>
                      </Td>

                      <Td align="right">
                        <span className={css({ fontSize: "12.5px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.muted }}>
                          {c.count.toLocaleString("en-US")}
                        </span>
                      </Td>

                      <Td align="right">
                        {renaming ? (
                          <span className={css({ display: "flex", justifyContent: "flex-end", gap: "4px" })}>
                            <Button size="sm" variant="primary" disabled={busy} onClick={() => void submitRename(c.id)}>
                              Save
                            </Button>
                            <Button size="sm" onClick={closeRow}>
                              Cancel
                            </Button>
                          </span>
                        ) : moving ? (
                          <span className={css({ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px" })}>
                            <select
                              autoFocus
                              defaultValue={c.parent}
                              disabled={busy}
                              onChange={(e) => void submitMove(c.id, Number(e.target.value))}
                              className={cx(selectClass, css({ height: "30px", fontSize: "12.5px", maxWidth: "150px" }))}
                            >
                              <option value={0}>{TOP_LEVEL_OPTION}</option>
                              {moveOptions(c.id).map((o) => (
                                <option key={o.id} value={o.id}>{`${INDENT.repeat(o.depth)}${o.name}`}</option>
                              ))}
                            </select>
                            <Button size="sm" onClick={closeRow}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <span data-act className={css({ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "2px", opacity: 0, transition: "opacity .12s", _focusWithin: { opacity: 1 } })}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="plus"
                              aria-label={`Add a subcategory under ${c.name}`}
                              onClick={() => {
                                setMode({ kind: "addChild", id: c.id });
                                setDraft("");
                                setError(null);
                              }}
                            >
                              Sub
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Rename ${c.name}`}
                              onClick={() => {
                                setMode({ kind: "rename", id: c.id });
                                setDraft(c.name);
                                setError(null);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Move ${c.name}`}
                              onClick={() => {
                                setMode({ kind: "move", id: c.id });
                                setError(null);
                              }}
                            >
                              Move
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Delete ${c.name}`}
                              disabled={busy}
                              onClick={() => {
                                setDelError(null);
                                setConfirmDel({ id: c.id, name: c.name, kids });
                              }}
                            >
                              Delete
                            </Button>
                          </span>
                        )}
                      </Td>
                    </Tr>

                    {addingChild ? (
                      <tr>
                        <Td colSpan={4} style={{ background: ac.surfaceSunken }}>
                          <span className={css({ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" })} style={{ paddingLeft: (c.depth + 1) * 22 }}>
                            <span className={css({ fontSize: "12px", flex: "none" })} style={{ color: ac.faint }}>
                              {TREE_ELBOW}
                            </span>
                            <Input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void submitChild(c.id);
                                if (e.key === "Escape") closeRow();
                              }}
                              placeholder={`New subcategory under ${c.name}`}
                              className={css({ flex: 1, minWidth: "200px", maxWidth: "360px" })}
                            />
                            <Button size="sm" variant="primary" disabled={busy} onClick={() => void submitChild(c.id)}>
                              Add
                            </Button>
                            <Button size="sm" onClick={closeRow}>
                              Cancel
                            </Button>
                          </span>
                        </Td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </Table>
        <SkeletonKeyframes />

        <TableFooter>
          <span>
            {loading
              ? <Bar w={110} h={13} />
              : `${visible.length.toLocaleString("en-US")} shown of ${categories.length.toLocaleString("en-US")}`}
          </span>
          {/* Categories come back as one full tree in a single call — there is no
              page to turn, so the footer carries the count alone rather than
              dead pager buttons. */}
          <span />
        </TableFooter>
      </Surface>

      {confirmDel ? (
        <ConfirmDialog
          title="Delete this category?"
          confirmLabel="Delete category"
          busyLabel="Deleting…"
          busy={busy}
          error={delError}
          onConfirm={() => void doRemove()}
          onCancel={() => {
            setConfirmDel(null);
            setDelError(null);
          }}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>{confirmDel.name}</strong> is removed from the site.
          Posts keep their content — they just lose this category.
          {confirmDel.kids > 0 ? (
            <>
              {" "}Its {confirmDel.kids} subcategor{confirmDel.kids === 1 ? "y" : "ies"} move up to
              this category&rsquo;s own parent rather than being deleted.
            </>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
