"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { css } from "@/styled-system/css";
import { ac, type Status } from "../tokens";
import { Icon } from "../icons";
import { Dropdown, SearchInput, PrimaryButton, type Option } from "../Dropdown";
import { Surface, PageHeader, StatusPill, Table, Th, Td, Tr, TableFooter, Button, EmptyState } from "../ui";
import { Bar, SkeletonKeyframes } from "../Skeleton";
import RefreshButton from "../RefreshButton";
import ConfirmDialog from "../ConfirmDialog";
import ArticlesTabs from "./ArticlesTabs";
import { trashPost } from "@/lib/admin/screen-actions";
import LegacySiteChip, { startLegacyRefresh } from "../LegacySiteChip";
import { DEFAULT_STATUSES } from "@/lib/admin/constants";
import type { PostListResult } from "@/lib/admin/posts";
import type { CategoryNode } from "@/lib/admin/categories";
import type { AuthorOption } from "@/lib/admin/users";

/**
 * WordPress's real permalink for one post (category path, custom overrides
 * and all) — the list itself never carries this (the fast path has no way to
 * compute it, see getPostPermalink's comment), so View/Preview/Copy URL fetch
 * it on click, through the same BFF pattern as every other admin write.
 */
async function fetchPermalink(id: number): Promise<string | null> {
  const res = await fetch(`/api/admin/posts/${id}/permalink`, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as { link?: string };
  return body.link || null;
}

const rowActionLink = css({ fontSize: "11.5px", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", _hover: { textDecoration: "underline" }, _disabled: { cursor: "default", textDecoration: "none" } });


const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: DEFAULT_STATUSES },
  { label: "Published", value: "publish" },
  { label: "Pending", value: "pending" },
  { label: "Draft", value: "draft" },
];

const DATE_OPTIONS: Option[] = [
  { label: "Any time", value: "" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "This year", value: "year" },
];

function statusDisplay(raw: string): Status {
  if (raw === "publish") return "Published";
  if (raw === "pending") return "Pending";
  return "Draft";
}
const labelOf = (opts: Option[], value: string) => opts.find((o) => o.value === value)?.label ?? value;

interface Query { search: string; status: string; category: string; author: string; date: string; page: number }

export default function ArticlesView({
  result,
  error,
  loading,
  fetching,
  fetchedAt,
  refreshing,
  onRefresh,
  onTrashed,
  query,
  perPage,
  categories,
  authors,
}: {
  result: PostListResult | null;
  error: boolean;
  /** First-ever load (nothing cached): the table renders skeleton rows. */
  loading: boolean;
  /** Any in-flight fetch (page turn, background refetch): rows dim slightly. */
  fetching: boolean;
  /** When the shown data was pulled from WordPress; absent until loaded. */
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onTrashed: () => void;
  query: Query;
  perPage: number;
  categories: CategoryNode[];
  authors: AuthorOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [trashingId, setTrashingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // Which row's real permalink is in flight, and for which of the two actions
  // that need it — View/Preview (open) and Copy URL both hit the same BFF
  // call, so a click on either disables both for that row until it resolves.
  const [pendingPermalink, setPendingPermalink] = useState<{ id: number; action: "open" | "copy" } | null>(null);
  // Permalinks resolved ahead of a click, keyed by post id — populated on row
  // hover/focus (see prefetchPermalink) so "View"/"Preview" is a REAL <a href>
  // by the time it's clicked (native middle-click/ctrl-click/right-click-copy
  // all need an actual href, not a JS-only onClick). Ref, not state, tracks
  // which ids are already in flight so a fast mouse re-entering the row
  // doesn't fire a second fetch.
  const [resolvedLinks, setResolvedLinks] = useState<Record<number, string>>({});
  const prefetching = useRef<Set<number>>(new Set());

  const prefetchPermalink = (id: number) => {
    if (resolvedLinks[id] !== undefined || prefetching.current.has(id)) return;
    prefetching.current.add(id);
    void fetchPermalink(id)
      .catch(() => null)
      .then((link) => {
        prefetching.current.delete(id);
        if (link) setResolvedLinks((m) => ({ ...m, [id]: link }));
      });
  };
  // The row awaiting confirmation; the dialog stays up while the write runs so
  // a rejection lands in it rather than in a native alert.
  const [confirmTrash, setConfirmTrash] = useState<{ id: number; title: string; status: string } | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);

  // Row-level "move to trash". Lives on the row (a Link), so the handler must
  // swallow the navigation.
  const trash = (e: React.MouseEvent, id: number, title: string, status: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (trashingId) return;
    setTrashError(null);
    setConfirmTrash({ id, title, status });
  };

  const doTrash = async () => {
    const target = confirmTrash;
    if (!target || trashingId) return;
    setTrashingId(target.id);
    setTrashError(null);
    const res = await trashPost(target.id);
    setTrashingId(null);
    if (!res.ok) {
      setTrashError(res.error ?? "Couldn't move the post to trash.");
      return;
    }
    setConfirmTrash(null);
    onTrashed(); // invalidate the client posts cache (the action busted the server tag)
    // A LIVE article leaves a ghost behind on the legacy site: its cached page
    // plus every listing that still shows it. Same purge as publishing (the
    // plugin reconstructs the pre-trash URL — see afa 1.17.1); drafts and
    // scheduled posts never had public pages, so nothing to clear for them.
    if (target.status === "publish") startLegacyRefresh(target.id);
  };

  // Fallback for "View"/"Preview" when the row's <a href> hasn't resolved yet
  // (a click faster than the hover-prefetch — see prefetchPermalink and the
  // <a>'s own onClick, which only calls this when resolvedLinks has nothing).
  // Opens the tab SYNCHRONOUSLY (before the await) and redirects it once the
  // fetch resolves — opening it only after the await is what popup blockers
  // catch. Can't pass the `noopener` FEATURE to window.open here: browsers
  // then return null instead of the window reference this needs to navigate
  // later. Severing window.opener by hand right after achieves the same
  // tabnabbing protection without losing the reference.
  const openPermalink = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (pendingPermalink) return;
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    setPendingPermalink({ id, action: "open" });
    const link = await fetchPermalink(id).catch(() => null);
    setPendingPermalink((p) => (p?.id === id && p.action === "open" ? null : p));
    if (link) win?.location.replace(link);
    else win?.close();
  };

  // Row-level "copy URL" — reuses a hover-prefetched link when there is one,
  // same as the View <a> does, instead of always paying the round trip.
  const copyUrl = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    let link = resolvedLinks[id];
    if (!link) {
      if (pendingPermalink) return;
      setPendingPermalink({ id, action: "copy" });
      link = (await fetchPermalink(id).catch(() => null)) ?? "";
      setPendingPermalink((p) => (p?.id === id && p.action === "copy" ? null : p));
    }
    if (!link) return;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
      })
      .catch(() => {
        // Clipboard permission denied or unavailable — nothing to recover into.
      });
  };

  const go = (next: Partial<Omit<Query, "page">> & { page?: number }) => {
    const merged = { ...query, page: 1, ...next };
    const p = new URLSearchParams();
    if (merged.search) p.set("q", merged.search);
    if (merged.status && merged.status !== DEFAULT_STATUSES) p.set("status", merged.status);
    if (merged.category) p.set("category", merged.category);
    if (merged.author) p.set("author", merged.author);
    if (merged.date) p.set("date", merged.date);
    if (merged.page > 1) p.set("page", String(merged.page));
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("q");
    go({ search: typeof value === "string" ? value.trim() : "" });
  };

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const start = total === 0 ? 0 : (query.page - 1) * perPage + 1;
  const end = start === 0 ? 0 : start + items.length - 1;

  const categoryOptions: Option[] = [{ label: "All categories", value: "" }, ...categories.map((c) => ({ label: `${"— ".repeat(c.depth)}${c.name}`, value: String(c.id) }))];
  const authorOptions: Option[] = [{ label: "All authors", value: "" }, ...authors.map((a) => ({ label: a.name, value: String(a.id) }))];

  const catName = categories.find((c) => String(c.id) === query.category)?.name ?? "";
  const authorName = authors.find((a) => String(a.id) === query.author)?.name ?? "";

  const menu = (id: string) => ({
    open: openMenu === id,
    onToggle: () => setOpenMenu((m) => (m === id ? null : id)),
    onClose: () => setOpenMenu(null),
  });

  const chips: { key: string; kind: string; value: string; clear: () => void }[] = [];
  if (query.search) chips.push({ key: "q", kind: "Search", value: query.search, clear: () => go({ search: "" }) });
  if (query.status !== DEFAULT_STATUSES) chips.push({ key: "status", kind: "Status", value: labelOf(STATUS_OPTIONS, query.status), clear: () => go({ status: DEFAULT_STATUSES }) });
  if (query.category && catName) chips.push({ key: "category", kind: "Category", value: catName, clear: () => go({ category: "" }) });
  if (query.author && authorName) chips.push({ key: "author", kind: "Author", value: authorName, clear: () => go({ author: "" }) });
  if (query.date) chips.push({ key: "date", kind: "Date", value: labelOf(DATE_OPTIONS, query.date), clear: () => go({ date: "" }) });

  return (
    <div>
      {/* Title band. No `trail` — the breadcrumb is deliberately off here (the
          tab strip below already says where you are). The primary action moved
          up out of the toolbar so the screen opens the way every other one
          does: what this is, then what you can do about it. */}
      <PageHeader
        title="Articles"
        sub={loading ? "Loading…" : `${total.toLocaleString("en-US")} ${total === 1 ? "story" : "stories"}`}
        actions={
          <>
            {/* No postId: the list isn't one post's screen, so it wears
                whatever legacy-cache run is active (a trash fired here, or a
                save the user navigated away from). */}
            <LegacySiteChip />
            <RefreshButton fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} />
            <PrimaryButton label="New Article" href="/admin/articles/new" />
          </>
        }
      />

      <Surface>
        {/* Tabs and the filters share one row, so the rule beneath them reads as
            the table's own header rather than as a second bar. */}
        <ArticlesTabs
          trailing={
            <>
              <form onSubmit={onSearchSubmit} className={css({ display: "flex", minWidth: "220px" })}>
                <SearchInput placeholder="Search articles…" name="q" defaultValue={query.search} width="260px" />
              </form>
              <Dropdown label={query.status !== DEFAULT_STATUSES ? labelOf(STATUS_OPTIONS, query.status) : "Status"} hasValue={query.status !== DEFAULT_STATUSES} {...menu("status")} options={STATUS_OPTIONS} selected={query.status} onSelect={(v) => go({ status: v })} />
              <Dropdown label={query.category && catName ? catName : "Category"} hasValue={!!query.category} {...menu("category")} options={categoryOptions} selected={query.category} onSelect={(v) => go({ category: v })} minWidth={220} />
              {authors.length > 0 ? (
                <Dropdown label={query.author && authorName ? authorName : "Author"} hasValue={!!query.author} {...menu("author")} options={authorOptions} selected={query.author} onSelect={(v) => go({ author: v })} minWidth={220} />
              ) : null}
              <Dropdown label={query.date ? labelOf(DATE_OPTIONS, query.date) : "Date"} hasValue={!!query.date} {...menu("date")} options={DATE_OPTIONS} selected={query.date} onSelect={(v) => go({ date: v })} />
            </>
          }
        />

        {/* Active filter chips */}
        {chips.length ? (
          <div className={css({ display: "flex", alignItems: "center", gap: "8px", padding: "12px 22px", flexWrap: "wrap" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
            {chips.map((c) => (
              <Chip key={c.key} kind={c.kind} value={c.value} onRemove={c.clear} />
            ))}
            <button type="button" onClick={() => go({ search: "", status: DEFAULT_STATUSES, category: "", author: "", date: "" })} className={css({ fontSize: "12px", cursor: "pointer", padding: "4px 6px", border: "none", background: "transparent", _hover: { color: ac.text } })} style={{ color: ac.muted }}>
              Clear all
            </button>
          </div>
        ) : null}

        {/* The table. Same anatomy as the Users list on purpose — a real
            <table>, the shared header, one row-hover — so the two most-used
            screens in the tool are recognisably the same object. The ROW is not
            the link (a <tr> cannot be an anchor): the title carries it, which
            also gives keyboard users one stop per row instead of one per cell.

            Page turns / background refetches dim the (kept-previous) rows
            instead of unmounting them into a skeleton. */}
        <div style={{ opacity: fetching && !loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <Table>
            <thead>
              <tr>
                <Th width="104px" />
                <Th>Title</Th>
                <Th width="210px">Category</Th>
                <Th width="160px">Author</Th>
                <Th width="100px">Date</Th>
                <Th width="110px">Status</Th>
                <Th width="70px" align="right" />
              </tr>
            </thead>
            <tbody>
              {loading && !error ? (
                Array.from({ length: perPage }, (_, i) => (
                  <tr key={i} aria-busy>
                    <Td><Bar w={80} h={80} r={0} /></Td>
                    <Td><Bar w={i % 2 ? "70%" : "52%"} h={15} /></Td>
                    <Td><Bar w={120} h={12} /></Td>
                    <Td><Bar w={110} h={12} /></Td>
                    <Td><Bar w={70} h={12} /></Td>
                    <Td><Bar w={74} h={20} r={99} /></Td>
                    <Td />
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <Td colSpan={7}>
                    <EmptyState icon="x" title="Couldn't load articles" body="The request to WordPress failed. Refresh to try again." />
                  </Td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <EmptyState
                      icon="articles"
                      title="No articles found"
                      body={chips.length ? "Try clearing the filters above." : "Nothing to show yet."}
                    />
                  </Td>
                </tr>
              ) : (
                items.map((a) => (
                  <Tr
                    key={a.id}
                    className={css({ "&:hover [data-go]": { opacity: 1, transform: "translateX(0)" }, "&:hover [data-thumb]": { borderColor: "var(--colors-admin-border-strong)" }, "&:hover [data-row-actions]": { opacity: 1 }, "&:focus-within [data-row-actions]": { opacity: 1 } })}
                    onMouseEnter={() => prefetchPermalink(a.id)}
                    onFocus={() => prefetchPermalink(a.id)}
                  >
                    <Td>
                      {a.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail; next/image would need remotePatterns for the S3 host
                        <img data-thumb src={a.thumb} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: "cover", border: `1px solid ${ac.border}`, transition: "border-color .12s", display: "block" }} />
                      ) : (
                        <div data-thumb style={{ width: 40, height: 40, border: `1px solid ${ac.border}`, background: ac.skeleton, transition: "border-color .12s" }} />
                      )}
                    </Td>
                    <Td>
                      <Link href={`/admin/articles/${a.id}`} className={css({ fontSize: "14.5px", lineHeight: 1.55, lineClamp: 2, display: "block", _hover: { textDecoration: "underline" } })}>
                        {a.title}
                      </Link>
                      {/* WordPress-style row actions, revealed on hover/focus — see
                          the Tr's "&:hover [data-row-actions]" rule above, which
                          also fires prefetchPermalink: WordPress's REAL permalink
                          (custom overrides, category paths — the fast-path list
                          has no way to compute it) is fetched as soon as the row
                          is hovered/focused, so by the time "View" is actually
                          clicked it is a real <a href>, not just an onClick — native
                          middle-click/ctrl-click/right-click-copy all need one.
                          openPermalink is only the fallback for a click faster than
                          the prefetch. Label says what a published post's link IS
                          ("View"); anything else calls it "Preview" since
                          WordPress's own link for an unpublished post is its
                          preview placeholder, not a public page. */}
                      <div data-row-actions className={css({ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", opacity: 0, transition: "opacity .12s ease" })}>
                        <a
                          href={resolvedLinks[a.id] ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-disabled={pendingPermalink?.id === a.id && pendingPermalink.action === "open"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!resolvedLinks[a.id]) void openPermalink(e, a.id);
                          }}
                          className={rowActionLink}
                          style={{ color: pendingPermalink?.id === a.id && pendingPermalink.action === "open" ? ac.faint : ac.accentText }}
                        >
                          {pendingPermalink?.id === a.id && pendingPermalink.action === "open" ? "Opening…" : a.status === "publish" ? "View" : "Preview"}
                        </a>
                        <span aria-hidden style={{ color: ac.faint }}>|</span>
                        <Link href={`/admin/articles/${a.id}`} className={rowActionLink} style={{ color: ac.accentText }}>
                          Edit
                        </Link>
                        <span aria-hidden style={{ color: ac.faint }}>|</span>
                        <button
                          type="button"
                          disabled={pendingPermalink !== null}
                          onClick={(e) => void copyUrl(e, a.id)}
                          className={rowActionLink}
                          style={{ color: pendingPermalink?.id === a.id && pendingPermalink.action === "copy" ? ac.faint : ac.accentText }}
                        >
                          {pendingPermalink?.id === a.id && pendingPermalink.action === "copy" ? "Copying…" : copiedId === a.id ? "Copied!" : "Copy URL"}
                        </button>
                        <span aria-hidden style={{ color: ac.faint }}>|</span>
                        <button
                          type="button"
                          disabled={trashingId !== null}
                          onClick={(e) => trash(e, a.id, a.title, a.status)}
                          className={rowActionLink}
                          style={{ color: trashingId === a.id ? ac.faint : ac.danger }}
                        >
                          Trash
                        </button>
                      </div>
                    </Td>
                    <Td>
                      <span className={css({ fontSize: "12.5px", lineHeight: 1.6, lineClamp: 2, display: "block" })} style={{ color: ac.muted }}>{a.categoryNames.join(", ")}</span>
                    </Td>
                    <Td>
                      <span className={css({ fontSize: "12.5px", lineClamp: 2, display: "block" })} style={{ color: ac.muted }}>{a.authorName}</span>
                    </Td>
                    <Td>
                      <span className={css({ fontSize: "12.5px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.muted }}>{a.date}</span>
                    </Td>
                    <Td><StatusPill status={statusDisplay(a.status)} /></Td>
                    <Td align="right">
                      <span data-go className={css({ display: "flex", justifyContent: "flex-end", opacity: 0, transition: "opacity .14s ease, transform .14s ease" })} style={{ transform: "translateX(-4px)", color: ac.faint }}>
                        <Icon name="chevronRight" size={15} strokeWidth={2} />
                      </span>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
          {/* Bar's pulse animation is driven by these keyframes — dropping them
              with the old local SkeletonRows would have left static grey bars. */}
          <SkeletonKeyframes />
        </div>

        <TableFooter>
          <span>{loading ? <Bar w={90} h={13} /> : total === 0 ? "No results" : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}</span>
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

      {confirmTrash ? (
        <ConfirmDialog
          title="Move this article to the trash?"
          confirmLabel="Move to trash"
          busyLabel="Trashing…"
          busy={trashingId !== null}
          error={trashError}
          onConfirm={() => void doTrash()}
          onCancel={() => {
            setConfirmTrash(null);
            setTrashError(null);
          }}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>{confirmTrash.title}</strong> comes off the site
          straight away. Nothing is deleted permanently — you can restore it from WordPress&rsquo;s Trash.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function Chip({ kind, value, onRemove }: { kind: string; value: string; onRemove: () => void }) {
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "7px", height: "26px", padding: "0 6px 0 10px", borderRadius: "99px", fontSize: "12px", maxWidth: "320px" })} style={{ background: ac.surfaceSunken, border: `1px solid ${ac.border}`, color: ac.text }}>
      <span style={{ color: ac.muted }}>{kind}:</span>
      <span className={css({ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>{value}</span>
      <button type="button" onClick={onRemove} className={css({ width: "16px", height: "16px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", flex: "none", _hover: { background: ac.border } })} style={{ color: ac.muted }} aria-label={`Remove ${kind} filter`}>
        <Icon name="x" size={9} strokeWidth={2.5} />
      </button>
    </div>
  );
}
