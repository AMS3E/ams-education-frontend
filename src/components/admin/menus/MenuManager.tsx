"use client";

import { useState } from "react";
import { css, cx } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon } from "../icons";
import {
  Surface,
  PageHeader,
  FormCard,
  Button,
  IconButton,
  Input,
  Table,
  Th,
  Td,
  Tr,
  TableFooter,
  EmptyState,
} from "../ui";
import { Bar, SkeletonKeyframes } from "../Skeleton";
import RefreshButton from "../RefreshButton";
import ConfirmDialog from "../ConfirmDialog";
import MediaPicker from "../MediaPicker";
import type { MenuItem, MenuSummary } from "@/lib/admin/menus";
import { addMenuItem, deleteMenuItem, renameMenuItem, reorderMenuItems, setMenuItemIcon, setMenuItemUrl } from "@/lib/admin/menu-actions";

// The CMS surface for the public site's navigation. Its first job is the
// program-icon strip (មាតិកាឌីជីថល) under the header — which in WordPress is a
// nav menu, edited through Appearance → Menus with a plugin panel per item.
//
// This screen keeps the useful half of that and drops the rest: the strip is
// an ORDERED LIST OF LINKS WITH ICONS, so it is edited as one — a live preview
// of the real strip on top, then one row per item with its label, link and
// position. No "add to menu" column, no per-item accordion, no separate save
// step for ordering.
//
// ICONS ARE EDITABLE since ams-frontend-api 1.7.6. They were read-only before
// that, and the reason is worth keeping: the icon is the item's FEATURED IMAGE
// (`_thumbnail_id`), which core REST would not expose or accept for a
// nav_menu_item, so `meta` came back `{}`. The plugin now registers that key
// for nav_menu_item alone behind edit_theme_options.
//
// The icon URL shown here still comes from parsing the item's rendered title
// (iconFromRendered) rather than from the id: the rendered markup is what the
// live theme itself emits, already at the item's chosen rendition, so it needs
// no second lookup to turn an attachment id into the right-sized URL.

/** Inline cell editor — a text input that fills its cell without the standard
 *  36px control chrome, so a row does not grow when you click into it. */
const cellInput = css({
  width: "100%",
  height: "30px",
  padding: "0 9px",
  borderRadius: "7px",
  fontFamily: "inherit",
  color: "var(--colors-admin-text)",
  background: "var(--colors-admin-surface-sunken)",
  border: "1px solid var(--colors-admin-border-strong)",
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "1px" },
});

/** The click target that turns a cell into that input. `cursor: text` because
 *  it looks and behaves like a field, not a button. */
const cellButton = css({
  textAlign: "left",
  background: "transparent",
  border: "none",
  cursor: "text",
  width: "100%",
  padding: "3px 0",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  borderRadius: "4px",
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
});

export default function MenuManager({
  menu,
  items,
  loading,
  error: loadError,
  fetchedAt,
  refreshing,
  onRefresh,
  onMutated,
}: {
  menu: MenuSummary | null;
  items: MenuItem[];
  loading: boolean;
  error: boolean;
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onMutated: () => void;
}) {
  // Local order, so moving a row feels instant instead of waiting on a ~1s
  // write. It is seeded from `items` ONCE per mount — the screen remounts this
  // component (via `key`) whenever a refetch brings new data, which is how the
  // local copy gets re-seeded without a render-phase setState or an effect.
  const [order, setOrder] = useState<MenuItem[]>(items);
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; field: "label" | "url" } | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [confirmDel, setConfirmDel] = useState<MenuItem | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [confirmClear, setConfirmClear] = useState<MenuItem | null>(null);

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

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirtyOrder(true);
  };

  const saveOrder = async () => {
    // Only the rows that actually moved. The server writes absolute positions,
    // so this compares each item's new index against the order WordPress
    // currently holds — a one-place move is two writes, not the whole menu.
    const current = new Map(items.map((i) => [i.id, i.order]));
    const updates = order
      .map((it, index) => ({ id: it.id, order: index + 1 }))
      .filter((u) => current.get(u.id) !== u.order);
    if (await run(() => reorderMenuItems(updates), "Couldn't save the order.")) {
      setDirtyOrder(false);
    }
  };

  /** An item keeps its own rendition and label placement; one that has never
   *  had an icon gets the defaults on the server side. */
  const iconContext = (it: MenuItem) => ({ size: it.imageSize, type: it.imageType, titlePosition: it.titlePosition });

  const pickIcon = async (it: MenuItem, attachmentId: number) => {
    setPicking(null);
    await run(() => setMenuItemIcon(it.id, attachmentId, iconContext(it)), "Couldn't set the icon.");
  };

  const clearIcon = async () => {
    if (!confirmClear) return;
    const it = confirmClear;
    if (await run(() => setMenuItemIcon(it.id, 0, iconContext(it)), "Couldn't clear the icon.")) {
      setConfirmClear(null);
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    const value = draft.trim();
    if (!value) return;
    const ok =
      editing.field === "label"
        ? await run(() => renameMenuItem(editing.id, value), "Couldn't rename.")
        : await run(() => setMenuItemUrl(editing.id, value), "Couldn't update the link.");
    if (ok) {
      setEditing(null);
      setDraft("");
    }
  };

  const submitNew = async () => {
    if (!menu) return;
    // order.length + 1 = the end of the menu; without it WordPress puts the
    // new item first (see addMenuItem).
    if (await run(() => addMenuItem(menu.id, newLabel, newUrl, order.length + 1), "Couldn't add the item.")) {
      setNewLabel("");
      setNewUrl("");
      setAdding(false);
    }
  };

  const doRemove = async () => {
    if (!confirmDel || busy) return;
    setBusy(true);
    setDelError(null);
    const res = await deleteMenuItem(confirmDel.id);
    setBusy(false);
    if (!res.ok) {
      setDelError(res.error ?? "Couldn't remove the item.");
      return;
    }
    setConfirmDel(null);
    onMutated();
  };

  return (
    <div>
      <PageHeader
        title="Menus"
        sub="The public site’s navigation. Changes here also change the WordPress site — it is the same menu."
        actions={
          <>
            <RefreshButton fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} />
            <Button variant="primary" icon="plus" onClick={() => setAdding((v) => !v)}>
              Add item
            </Button>
          </>
        }
      />

      <Surface>
      {/* The strip as the site actually draws it — the point of reference for
          every edit below. */}
      <FormCard
        title="Preview"
        sub="How the icon strip renders on the public site."
        className={css({ borderBottom: "1px solid var(--colors-admin-border)" })}
        bodyClassName={css({ padding: "16px 22px" })}
      >
        {loading ? (
          <div className={css({ display: "flex", gap: "18px" })}>
            {Array.from({ length: 8 }, (_, i) => (
              <Bar key={i} w={72} h={52} />
            ))}
            <SkeletonKeyframes />
          </div>
        ) : (
          <div className={css({ display: "flex", alignItems: "center", gap: "18px", overflowX: "auto", paddingBottom: "6px" })}>
            {order.map((it) => (
              <span key={it.id} className={css({ display: "flex", alignItems: "center", flex: "none" })} title={it.label}>
                {it.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the CMS's own absolute CDN URLs, previewed at their natural size
                  <img src={it.icon} alt={it.label} className={css({ height: "52px", width: "auto", objectFit: "contain" })} />
                ) : (
                  <span className={css({ fontSize: "11px", padding: "3px 7px", borderRadius: "5px" })} style={{ background: ac.surfaceSunken, color: ac.faint, border: `1px dashed ${ac.border}` }}>
                    no icon
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </FormCard>

      {adding ? (
        <div className={css({ padding: "14px 22px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <div className={css({ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" })}>
            <div className={css({ flex: 1, minWidth: "180px", maxWidth: "260px" })}>
              <div className={css({ fontSize: "12.5px", fontWeight: 500, marginBottom: "6px" })} style={{ color: ac.sub }}>Label</div>
              <Input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Daily Feed" />
            </div>
            <div className={css({ flex: 2, minWidth: "260px" })}>
              <div className={css({ fontSize: "12.5px", fontWeight: 500, marginBottom: "6px" })} style={{ color: ac.sub }}>Link</div>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitNew();
                  if (e.key === "Escape") setAdding(false);
                }}
                placeholder="https://infotainment.ams.com.kh/program/…"
              />
            </div>
            <Button variant="primary" disabled={busy} onClick={() => void submitNew()}>
              {busy ? "Adding…" : "Add"}
            </Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      <p className={css({ fontSize: "12px", padding: "10px 22px", lineHeight: 1.6 })} style={{ color: ac.muted, background: ac.surfaceSunken, borderBottom: `1px solid ${ac.border}` }}>
        <strong style={{ color: ac.sub, fontWeight: 600 }}>Click an icon to change it.</strong>{" "}
        Icons are the item&rsquo;s featured image in WordPress, so a change here shows on both sites. An item with no
        icon still appears in WordPress&rsquo;s own menu, but the public strip skips it — the strip is icons.
      </p>

      {error ? (
        <p role="alert" className={css({ fontSize: "12.5px", padding: "10px 22px" })} style={{ color: ac.danger, background: ac.dangerTint, borderBottom: `1px solid ${ac.danger}` }}>
          {error}
        </p>
      ) : null}

        <Table>
          <thead>
            <tr>
              <Th width="112px">Icon</Th>
              <Th>Label</Th>
              <Th>Link</Th>
              <Th width="190px" align="right" />
            </tr>
          </thead>
          <tbody>
            {loading && !loadError ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} aria-busy>
                  <Td><Bar w={26} h={26} /></Td>
                  <Td><Bar w={150} h={14} /></Td>
                  <Td><Bar w={220} h={12} /></Td>
                  <Td />
                </tr>
              ))
            ) : loadError ? (
              <tr>
                <Td colSpan={4}>
                  <EmptyState icon="x" title="Couldn't load menus" body="WordPress didn't answer. Use Refresh to try again." />
                </Td>
              </tr>
            ) : order.length === 0 ? (
              <tr>
                <Td colSpan={4}>
                  <EmptyState
                    icon="list"
                    title="This menu has no items yet"
                    body="Add one and it appears on both this site and WordPress."
                    action={
                      <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                        Add item
                      </Button>
                    }
                  />
                </Td>
              </tr>
            ) : (
              order.map((it, i) => (
                <Tr key={it.id} className={css({ "&:hover [data-act]": { opacity: 1 } })}>
                  <Td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPicking(it)}
                      aria-label={it.icon ? `Change the icon for ${it.label}` : `Add an icon for ${it.label}`}
                      title={it.icon ? "Change icon" : "Add icon"}
                      className={css({
                        width: "40px",
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        background: "transparent",
                        borderWidth: "1px",
                        borderStyle: "dashed",
                        transition: "background .12s, border-color .12s",
                        _hover: { background: "var(--colors-admin-surface-hover)" },
                        _disabled: { cursor: "default", opacity: 0.5 },
                        _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
                      })}
                      style={{ borderColor: it.icon ? "transparent" : ac.border }}
                    >
                      {it.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element -- same CDN URLs as the preview
                        <img src={it.icon} alt="" className={css({ width: "40px", height: "40px", objectFit: "contain" })} />
                      ) : (
                        <Icon name="plus" size={13} strokeWidth={2} />
                      )}
                    </button>
                  </Td>

                  <Td>
                    {editing?.id === it.id && editing.field === "label" ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        onBlur={() => void submitEdit()}
                        className={cx(cellInput, css({ fontSize: "13.5px" }))}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing({ id: it.id, field: "label" });
                          setDraft(it.label);
                        }}
                        className={cx(cellButton, css({ fontSize: "13.5px" }))}
                        style={{ color: ac.text }}
                      >
                        {it.label || <span style={{ color: ac.faint }}>(no label)</span>}
                      </button>
                    )}
                  </Td>

                  <Td>
                    {editing?.id === it.id && editing.field === "url" ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        onBlur={() => void submitEdit()}
                        className={cx(cellInput, css({ fontSize: "12.5px", fontFamily: "ui-monospace, monospace" }))}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing({ id: it.id, field: "url" });
                          setDraft(it.url);
                        }}
                        className={cx(cellButton, css({ fontSize: "12px" }))}
                        style={{ fontFamily: "ui-monospace, monospace", color: ac.muted }}
                      >
                        {it.url.replace(/^https?:\/\/[^/]+/, "") || it.url}
                      </button>
                    )}
                  </Td>

                  <Td align="right">
                    <span data-act className={css({ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "2px", opacity: 0, transition: "opacity .12s", _focusWithin: { opacity: 1 } })}>
                      <IconButton name="arrowUp" label={`Move ${it.label} up`} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                      <IconButton name="arrowDown" label={`Move ${it.label} down`} size="sm" disabled={i === order.length - 1} onClick={() => move(i, 1)} />
                      {it.iconId ? (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmClear(it)}>
                          Clear icon
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setDelError(null); setConfirmDel(it); }}>
                        Remove
                      </Button>
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
        <SkeletonKeyframes />

        <TableFooter>
          <span>{loading ? <Bar w={70} h={13} /> : `${order.length} item${order.length === 1 ? "" : "s"}`}</span>
          {/* The order is edited locally and committed in one write, so the
              pending state lives with the list it applies to, not in the page
              header where it would read as a page-wide save. */}
          {dirtyOrder ? (
            <span className={css({ display: "flex", alignItems: "center", gap: "8px" })}>
              <span style={{ color: ac.accentText }}>Order changed</span>
              <Button size="sm" onClick={() => { setOrder(items); setDirtyOrder(false); }}>
                Undo
              </Button>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveOrder()}>
                {busy ? "Saving…" : "Save order"}
              </Button>
            </span>
          ) : (
            <span />
          )}
        </TableFooter>
      </Surface>

      {picking ? (
        <MediaPicker
          title={picking.icon ? `Change icon — ${picking.label}` : `Add icon — ${picking.label}`}
          onPick={(m) => void pickIcon(picking, m.id)}
          onClose={() => setPicking(null)}
        />
      ) : null}

      {confirmClear ? (
        <ConfirmDialog
          title="Clear this icon?"
          confirmLabel="Clear icon"
          busyLabel="Clearing…"
          busy={busy}
          error={error}
          onConfirm={() => void clearIcon()}
          onCancel={() => setConfirmClear(null)}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>{confirmClear.label}</strong> will disappear from the
          public icon strip, because that strip renders icons and this row would no longer have one. It stays in
          WordPress&rsquo;s own menu, and nothing else about the item changes.
        </ConfirmDialog>
      ) : null}

      {confirmDel ? (
        <ConfirmDialog
          title="Remove this menu item?"
          confirmLabel="Remove item"
          busyLabel="Removing…"
          busy={busy}
          error={delError}
          onConfirm={() => void doRemove()}
          onCancel={() => { setConfirmDel(null); setDelError(null); }}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>{confirmDel.label}</strong> disappears from this menu
          on both sites. The page it links to is not affected.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
