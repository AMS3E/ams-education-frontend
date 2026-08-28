"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
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
                  <Tr key={a.id} className={css({ "&:hover [data-go]": { opacity: 1, transform: "translateX(0)" }, "&:hover [data-thumb]": { borderColor: "var(--colors-admin-border-strong)" } })}>
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
                      <span className={css({ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" })}>
                        <button
                          type="button"
                          data-go
                          disabled={trashingId !== null}
                          onClick={(e) => trash(e, a.id, a.title, a.status)}
                          aria-label={`Move “${a.title}” to trash`}
                          className={css({ width: "26px", height: "26px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", opacity: 0, transition: "opacity .14s ease, transform .14s ease, color .12s", _hover: { background: "var(--colors-admin-danger-tint)", color: "var(--colors-admin-danger)" }, _focusVisible: { opacity: 1, transform: "translateX(0)", outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" } })}
                          style={{ transform: "translateX(-4px)", color: trashingId === a.id ? ac.danger : ac.faint }}
                        >
                          <Icon name="trash" size={14} strokeWidth={1.7} />
                        </button>
                        <span data-go className={css({ display: "flex", opacity: 0, transition: "opacity .14s ease, transform .14s ease" })} style={{ transform: "translateX(-4px)", color: ac.faint }}>
                          <Icon name="chevronRight" size={15} strokeWidth={2} />
                        </span>
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
