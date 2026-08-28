"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon } from "../icons";
import { Dropdown, SearchInput, type Option } from "../Dropdown";
import {
  Surface,
  PageHeader,
  Button,
  buttonClass,
  IconButton,
  Input,
  Textarea,
  Field,
  EmptyState,
  TableFooter,
} from "../ui";
import { Bar, SkeletonKeyframes } from "../Skeleton";
import RefreshButton from "../RefreshButton";
import type { MediaItem, MediaListResult } from "@/lib/admin/media";
import { saveMediaAlt, deleteMedia } from "@/lib/admin/screen-actions";
import { uploadImageFile } from "../upload-client";

const TYPE_OPTS: Option[] = [
  { label: "All types", value: "" },
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Audio", value: "audio" },
];

interface Query { search: string; type: string; page: number }

export default function MediaView({
  result,
  loading,
  fetching,
  error,
  fetchedAt,
  refreshing,
  onRefresh,
  onMutated,
  query,
  perPage,
}: {
  result: MediaListResult;
  /** First-ever load (nothing cached): the grid renders skeleton tiles. */
  loading: boolean;
  /** Any in-flight fetch (page turn, background refetch): tiles dim slightly. */
  fetching: boolean;
  error: boolean;
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  /** Invalidate the media cache after upload / alt-save / delete. */
  onMutated: () => void;
  query: Query;
  perPage: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [typeOpen, setTypeOpen] = useState(false);
  // null = nothing open. It used to mean "no explicit choice", falling back to
  // the FIRST item once data landed — a holdover from an always-open side
  // drawer, which also needed a "none" sentinel to express "explicitly closed".
  // The preview is a modal now, so that default would throw a full-screen
  // overlay over the library on every single page load. Closed is the default,
  // and the sentinel is gone with it.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    const res = await uploadImageFile(file); // never throws
    setUploading(false);
    if (!res.ok) {
      setUploadErr(res.error ?? "Upload failed.");
      return;
    }
    if (res.id) setSelectedId(res.id);
    onMutated(); // invalidate the client media cache (the route busted the server tag)
  };

  const go = (next: { search?: string; type?: string; page?: number }) => {
    const search = next.search ?? query.search;
    const type = next.type ?? query.type;
    const page = next.page ?? 1;
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (type) p.set("type", type);
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
  const sel = items.find((m) => m.id === selectedId) ?? null;
  const typeLabel = TYPE_OPTS.find((t) => t.value === query.type)?.label ?? "Type";

  return (
    <div>
      <div className={css({ minWidth: 0 })}>
        <PageHeader
          title="Media"
          sub={loading ? "Loading…" : `${total.toLocaleString("en-US")} files in the library`}
          actions={
            <>
              <RefreshButton fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} />
              {/* Upload has to be a <label> wrapping a hidden file input — a
                  <button> cannot open the file dialog — so it borrows the
                  button's classes rather than the component. */}
              <label className={buttonClass("primary")} style={{ opacity: uploading ? 0.7 : 1 }}>
                <Icon name="upload" size={14} strokeWidth={2} />
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  disabled={uploading}
                  className={css({ display: "none" })}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          }
        />

        <Surface>
        {/* Filters: the panel's first cell, above the content they scope. */}
        <div className={css({ display: "flex", alignItems: "center", gap: "10px", padding: "12px 22px", flexWrap: "wrap" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <form onSubmit={onSearch} className={css({ display: "flex" })}>
            <SearchInput placeholder="Search media…" name="q" defaultValue={query.search} width="300px" />
          </form>
          <Dropdown
            label={query.type ? typeLabel : "Type"}
            hasValue={!!query.type}
            open={typeOpen}
            onToggle={() => setTypeOpen((v) => !v)}
            onClose={() => setTypeOpen(false)}
            options={TYPE_OPTS}
            selected={query.type}
            onSelect={(v) => go({ type: v })}
          />
          {uploadErr ? (
            <span role="alert" className={css({ fontSize: "12.5px" })} style={{ color: ac.danger }}>
              {uploadErr}
            </span>
          ) : null}
        </div>

        {/* The grid and its footer share the panel the filters opened, so a
            grid of files and a table of rows read as the same kind of object. */}
          {loading && !error ? (
            <div className={gridClass} aria-busy>
              {Array.from({ length: 18 }, (_, i) => (
                <div key={i}>
                  {/* Square, like the real tiles — a rounded skeleton would
                      change shape under you as the images land. */}
                  <Bar w="100%" h={126} r={0} />
                  <div style={{ marginTop: 7 }}>
                    <Bar w="80%" h={10} />
                  </div>
                </div>
              ))}
              <SkeletonKeyframes />
            </div>
          ) : error ? (
            <EmptyState icon="x" title="Couldn't load media" body="WordPress didn't answer. Use Refresh to try again." />
          ) : items.length === 0 ? (
            <EmptyState
              icon="media"
              title="No media found"
              body={query.search || query.type ? "Try clearing the search or the type filter." : "Nothing has been uploaded yet."}
            />
          ) : (
            <div className={gridClass} style={{ opacity: fetching ? 0.55 : 1, transition: "opacity .15s" }}>
              {items.map((m) => {
                const on = selectedId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelectedId(m.id)}
                    className={tileClass}
                  >
                    <span
                      className={css({
                        position: "relative",
                        display: "flex",
                        aspectRatio: "1/1",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        transition: "box-shadow .18s ease, transform .18s ease, border-color .12s",
                      })}
                      style={{
                        background: ac.skeleton,
                        // Selection is a ring in the accent, matching every other
                        // "this one is chosen" mark in the tool (the checkbox,
                        // the active nav item).
                        border: `1px solid ${on ? ac.accent : ac.border}`,
                        boxShadow: on ? `0 0 0 2px ${ac.accent}` : undefined,
                      }}
                    >
                      {m.type === "image" && m.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
                        <img src={m.thumb} alt={m.alt} className={css({ width: "100%", height: "100%" })} style={{ objectFit: "cover" }} />
                      ) : m.type === "video" && m.url ? (
                        <>
                          {/* No image rendition exists for videos, so the tile IS
                              the video: preload="metadata" fetches just enough
                              for the browser to paint the first frame, and the
                              #t=0.1 fragment makes Safari actually paint it. */}
                          <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className={css({ width: "100%", height: "100%", pointerEvents: "none" })} style={{ objectFit: "cover" }} />
                          <span aria-hidden className={css({ position: "absolute", left: "6px", bottom: "6px", width: "22px", height: "22px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center" })} style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                            <Icon name="play" size={12} strokeWidth={2} />
                          </span>
                        </>
                      ) : (
                        <Icon name={m.type === "audio" ? "music" : "media"} size={20} strokeWidth={1.4} style={{ color: ac.faint }} />
                      )}
                    </span>
                    <span
                      className={css({ display: "block", fontSize: "10.5px", marginTop: "7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}
                      // NOT monospace. A filename here is usually Khmer, and
                      // `ui-monospace, monospace` replaces the whole admin
                      // stack — Battambang included — so Khmer had no font to
                      // fall to and the browser shaped it with whatever it
                      // happened to pick. Inheriting keeps Latin in Plus Jakarta
                      // and Khmer in Battambang, per glyph.
                      style={{ color: on ? ac.text : ac.sub }}
                    >
                      {m.title}
                    </span>
                    <span
                      className={css({ display: "block", fontSize: "10.5px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}
                      style={{ color: ac.faint }}
                    >
                      {[m.dims, m.date].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <TableFooter>
            <span>
              {loading ? (
                <Bar w={140} h={13} />
              ) : total === 0 ? (
                "No results"
              ) : (
                `${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`
              )}
            </span>
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

      {/* Full-screen preview — keyed by item so alt-draft state resets per selection */}
      {sel ? (
        <MediaDialog
          key={sel.id}
          item={sel}
          onClose={() => setSelectedId(null)}
          onSaved={onMutated}
          onDeleted={() => {
            setSelectedId(null);
            onMutated();
          }}
        />
      ) : null}
    </div>
  );
}

const gridClass = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(126px,1fr))",
  gap: "16px",
  padding: "18px",
});

/** A tile is a real <button>: the grid is a picker, and a div with an onClick
 *  gives keyboard users nothing to land on. */
const tileClass = css({
  display: "block",
  width: "100%",
  minWidth: 0,
  textAlign: "left",
  padding: 0,
  border: "none",
  background: "transparent",
  font: "inherit",
  cursor: "pointer",
  // Lift + shadow only. The tile's border is applied INLINE (it carries the
  // selected state), and an inline declaration beats any stylesheet rule — a
  // hover borderColor here would simply never land.
  _hover: { "& > span:first-child": { transform: "translateY(-3px)", boxShadow: "var(--shadows-admin-md)" } },
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
});

/** Full-screen preview. Replaced a 360px side drawer that lived IN the page
 *  layout and squeezed the grid whenever it opened.
 *
 *  It carries everything the drawer did, because the drawer was the only route
 *  to any of it: the file's URL, its alt text, and the delete. */
function MediaDialog({
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  item: MediaItem;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [alt, setAlt] = useState(item.alt);
  const [savingAlt, setSavingAlt] = useState(false);
  const [altMsg, setAltMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const altDirty = alt.trim() !== item.alt.trim();

  // Modal duties the drawer never had: it was part of the page, so the page
  // behind it stayed legitimately usable. This is not.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      // Back to the tile you opened, not to the top of the document.
      restoreRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Escape backs out of the delete confirmation first — one keypress
        // should not skip a confirmation AND close the file.
        if (confirming) setConfirming(false);
        else onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]",
        ),
      ).filter(el => el.tabIndex !== -1 && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming, onClose]);

  const saveAlt = async () => {
    if (savingAlt) return;
    setSavingAlt(true);
    setAltMsg(null);
    const res = await saveMediaAlt(item.id, alt);
    setSavingAlt(false);
    setAltMsg(res.ok ? { kind: "ok", text: "Saved" } : { kind: "err", text: res.error ?? "Couldn't save." });
    if (res.ok) onSaved();
  };

  // PERMANENT — attachments have no trash over REST (see deleteMedia), which is
  // why the confirmation takes over the footer IN PLACE rather than stacking a
  // second overlay: it has to survive a failed request and report it where you
  // are already looking, and there is nothing to restore from if it goes wrong.
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteErr(null);
    const res = await deleteMedia(item.id);
    setDeleting(false);
    if (!res.ok) {
      setDeleteErr(res.error ?? "Couldn't delete the file.");
      return;
    }
    setConfirming(false);
    onDeleted();
  };

  return (
    <div
      // Padded, not flush: the panel used to fill the viewport edge to edge,
      // which hid the dimmed backdrop entirely and made the preview read as a
      // page you had navigated to rather than a layer over the one you were on.
      // The gutter is the only thing telling you there is something behind it,
      // so it is also the click target that closes.
      className={css({
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: { base: "16px", md: "32px", lg: "48px" },
      })}
      style={{ background: ac.overlay }}
      // Backdrop dismiss on mousedown that both starts AND ends on the backdrop:
      // dragging to select the URL text and releasing outside must not close it.
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Media details: ${item.title}`}
        tabIndex={-1}
        className={css({
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 380px" },
          gridTemplateRows: { base: "minmax(0,1fr) auto", lg: "1fr" },
          minWidth: 0,
          overflow: "hidden",
          _focusVisible: { outline: "none" },
        })}
        // The shadow is what makes an inset panel read as floating rather than
        // as a differently-coloured rectangle — the same lift MediaPicker and
        // ConfirmDialog use, so the tool's overlays behave alike.
        style={{ background: ac.surface, boxShadow: ac.shadowMd }}
      >
        {/* Left: the file itself, on the sunken ground so a transparent PNG
            reads as an image rather than as a hole in the dialog. */}
        <div
          className={css({ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0, minHeight: 0, padding: "32px" })}
          style={{ background: ac.surfaceSunken }}
        >
          {item.type === "image" && (item.url || item.thumb) ? (
            // The full file, not the thumbnail the drawer used — at this size a
            // thumb is visibly soft, and seeing the real image is the point.
            // eslint-disable-next-line @next/next/no-img-element -- admin preview; next/image needs remotePatterns for the S3 host
            <img
              src={item.url || item.thumb}
              alt={item.alt}
              className={css({ maxWidth: "100%", maxHeight: "100%", display: "block" })}
              style={{ objectFit: "contain" }}
            />
          ) : item.type === "video" && item.url ? (
            // A real player, same footprint rules as the image: the whole point
            // of opening a video is watching it.
            <video src={item.url} controls preload="metadata" className={css({ maxWidth: "100%", maxHeight: "100%", display: "block" })} />
          ) : item.type === "audio" && item.url ? (
            <div className={css({ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", width: "100%" })}>
              <Icon name="music" size={48} strokeWidth={1.2} style={{ color: ac.faint }} />
              <audio src={item.url} controls preload="metadata" className={css({ width: "100%", maxWidth: "420px" })} />
            </div>
          ) : (
            <Icon name="media" size={48} strokeWidth={1.2} style={{ color: ac.faint }} />
          )}
        </div>

        {/* Right: everything you can DO with it. Scrolls on its own, so a long
            filename never pushes Delete off the bottom. */}
        <div
          className={css({ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflowY: "auto" })}
          style={{ borderLeft: `1px solid ${ac.border}` }}
        >
          <div
            className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "14px 20px", flex: "none" })}
            style={{ borderBottom: `1px solid ${ac.border}` }}
          >
            <div className={css({ fontSize: "14px", fontWeight: 600 })}>Media details</div>
            <IconButton name="x" label="Close preview" size="sm" onClick={onClose} />
          </div>

          <div className={css({ display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px", flex: 1 })}>
            <div>
              {/* Inherits the admin stack for the same reason as the grid tile.
                  `overflowWrap: anywhere` rather than `wordBreak: break-all`:
                  Khmer is written without spaces, so it still needs to break
                  mid-string, but break-all will split inside a glyph cluster and
                  detach a vowel sign from its consonant. */}
              <div className={css({ fontSize: "13px", lineHeight: 1.6, overflowWrap: "anywhere" })}>
                {item.title}
              </div>
              <div className={css({ fontSize: "12.5px", marginTop: "6px" })} style={{ color: ac.muted }}>
                {[item.dims, item.size, item.mime].filter(Boolean).join(" · ")}
              </div>
            </div>

            <div className={css({ display: "flex", flexDirection: "column", gap: "9px", paddingTop: "16px" })} style={{ borderTop: `1px solid ${ac.rowLine}` }}>
              <DetailRow label="Uploaded by" value={item.authorName || "—"} />
              <DetailRow label="Uploaded" value={item.date} />
            </div>

            {item.type === "image" ? (
              <div>
                <Field label="Alt text" hint="Describes the image for screen readers and for search.">
                  <Textarea
                    value={alt}
                    onChange={e => {
                      setAlt(e.target.value);
                      setAltMsg(null);
                    }}
                    rows={2}
                    placeholder="Describe the image…"
                  />
                </Field>
                {altDirty || altMsg ? (
                  <div className={css({ display: "flex", alignItems: "center", gap: "10px", marginTop: "9px" })}>
                    {altDirty ? (
                      <Button variant="primary" size="sm" disabled={savingAlt} onClick={() => void saveAlt()}>
                        {savingAlt ? "Saving…" : "Save alt text"}
                      </Button>
                    ) : null}
                    {altMsg ? (
                      <span className={css({ fontSize: "12px" })} style={{ color: altMsg.kind === "err" ? ac.danger : ac.good }}>
                        {altMsg.text}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Not a <Field>: that renders a <label>, and a label wrapping the
                Copy button would forward the click to the input as well. */}
            <div>
              <div className={css({ fontSize: "12.5px", fontWeight: 500, marginBottom: "6px" })} style={{ color: ac.sub }}>
                File URL
              </div>
              <div className={css({ display: "flex", gap: "6px" })}>
                <Input readOnly value={item.url} className={css({ flex: 1, minWidth: 0, fontSize: "11px", fontFamily: "ui-monospace, monospace" })} />
                <Button
                  icon="copy"
                  className={css({ flex: "none" })}
                  onClick={() => {
                    navigator.clipboard?.writeText(item.url);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>

          {/* Footer, which the delete confirmation takes over in place. */}
          <div className={css({ padding: "14px 20px", flex: "none" })} style={{ borderTop: `1px solid ${ac.border}` }}>
            {confirming ? (
              <div className={css({ display: "flex", flexDirection: "column", gap: "10px" })}>
                <div className={css({ fontSize: "12.5px", lineHeight: 1.6 })} style={{ color: ac.sub }}>
                  <strong style={{ color: ac.text, fontWeight: 600 }}>{item.title}</strong> is removed from WordPress
                  for good. Unlike posts and programs there is no Trash to restore it from, and any article or program
                  still using this file loses its image.
                </div>
                {deleteErr ? (
                  <div role="alert" className={css({ fontSize: "12.5px" })} style={{ color: ac.danger }}>
                    {deleteErr}
                  </div>
                ) : null}
                <div className={css({ display: "flex", gap: "8px" })}>
                  <Button variant="danger" disabled={deleting} className={css({ flex: 1 })} onClick={() => void remove()}>
                    {deleting ? "Deleting…" : "Delete permanently"}
                  </Button>
                  <Button
                    disabled={deleting}
                    onClick={() => {
                      setConfirming(false);
                      setDeleteErr(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="danger"
                icon="trash"
                disabled={deleting}
                className={css({ width: "100%" })}
                onClick={() => {
                  setDeleteErr(null);
                  setConfirming(true);
                }}
              >
                Delete permanently
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={css({ display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "12.5px" })}>
      <span style={{ color: ac.muted, flex: "none" }}>{label}</span>
      <span className={css({ textAlign: "right", minWidth: 0, wordBreak: "break-word" })}>{value}</span>
    </div>
  );
}
