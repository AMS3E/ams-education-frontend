"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { css, cx } from "@/styled-system/css";
import { ac } from "./tokens";
import { ADMIN_FONT_STACK, adminFont } from "./font";
import { Icon } from "./icons";
import { browseMedia } from "@/lib/admin/editor-actions";
import { uploadImageFile } from "./upload-client";
import type { MediaItem, MediaListResult } from "@/lib/admin/media";

// Modal media picker shared by the article editor (featured image) and the
// program editor (poster / backdrop). Browses the image library (24 per page,
// search-first — the library holds 115k items) and can upload a new image.
// Selection hands back ids + URLs — the caller stores the id in its own
// state and writes it on its own save; nothing is written from here except an
// upload, which only ADDS a library item.
export interface PickedMedia {
  id: number;
  thumb: string;
  /** Full-size source URL — what the body editor embeds. */
  url: string;
  alt: string;
  /** Carried for the block editor's media shape (see media-upload-bridge).
   *  Optional so the two original callers keep compiling unchanged. */
  title?: string;
  mime?: string;
  type?: string;
}

export type MediaKind = "image" | "video" | "audio";

/** Grid-tile noun per kind, for the search placeholder and empty state. */
const KIND_NOUN: Record<MediaKind | "all", string> = { image: "images", video: "videos", audio: "audio files", all: "files" };

export default function MediaPicker({
  title = "Choose image",
  multiple = false,
  kinds = ["image"],
  onPick,
  onPickMany,
  onClose,
}: {
  title?: string;
  /** Multi-select, for the gallery block. Off by default, so the featured-image
   *  and menu-icon callers behave exactly as before. */
  multiple?: boolean;
  /** Which media types this caller can actually USE. One kind locks the picker
   *  to it (no tab strip); several show a tab per kind plus "all". Defaults to
   *  image-only, so the featured-image / poster / menu-icon callers can no
   *  longer hand back an mp3 the way they could when every dialog showed all
   *  four tabs. The block bridge passes each block's own `allowedTypes`. */
  kinds?: MediaKind[];
  onPick: (m: PickedMedia) => void;
  /** Required when `multiple` — receives the whole selection, in click order. */
  onPickMany?: (list: PickedMedia[]) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<MediaListResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Multi-select keeps the picked ITEMS, not ids: the caller needs urls, and a
  // selection survives paging away from the page it was made on.
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  // The library is 115k items and overwhelmingly images; "all" exists because
  // the file block accepts anything, not because anyone browses that way.
  // There is deliberately NO date filter: neither read path takes a date range,
  // so it would mean a REST param, a fast.php resource change and another
  // plugin upload — not worth a deploy round trip for a search-first dialog.
  const locked = kinds.length === 1 ? kinds[0] : null;
  const [kind, setKind] = useState<MediaKind | "all">(locked ?? "all");

  // Debounced browse: search resets to page 1; page changes fetch directly.
  // All state updates happen inside the timer callback (never synchronously in
  // the effect body — react-hooks/set-state-in-effect).
  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      // A thrown action must land in the failed state, never spin forever.
      const res = await browseMedia({
        page,
        search: search.trim() || undefined,
        mediaType: kind === "all" ? undefined : kind,
      }).catch(() => null);
      if (stale) return;
      setResult(res);
      setFailed(res === null);
      setLoading(false);
    }, search ? 350 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [search, page, kind]);

  // Esc closes, as every other dialog in the admin does. Listener, not state,
  // so nothing is set during the effect body.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    const res = await uploadImageFile(file); // never throws
    setUploading(false);
    if (!res.ok || !res.id) {
      setUploadErr(res.error ?? "Upload failed.");
      return;
    }
    // Real mime/type, so a video uploaded inside a Video block's dialog reaches
    // the block as a video, not the bridge's "image" default.
    onPick({ id: res.id, thumb: res.thumb ?? "", url: res.url ?? res.thumb ?? "", alt: "", title: file.name, mime: file.type, type: file.type.split("/")[0] || "file" });
  };

  const items = result?.items ?? [];

  const toPicked = (m: MediaItem): PickedMedia => ({
    id: m.id,
    thumb: m.thumb,
    url: m.url || m.thumb,
    alt: m.alt,
    title: m.title,
    mime: m.mime,
    type: m.type,
  });

  const toggle = (m: PickedMedia) =>
    setPicked((prev) => (prev.some((p) => p.id === m.id) ? prev.filter((p) => p.id !== m.id) : [...prev, m]));

  // A PORTAL into <body>, for the same reason Dropdown's menu is one: this
  // dialog is mounted WHEREVER its opener lives, and one of those openers is
  // the media-upload bridge, which renders it INSIDE the Gutenberg image block
  // — deep in a block list whose selected-block wrappers are their own little
  // stacking contexts. Trapped in there, z-index 1000050 is compared inside a
  // layer worth ~20, and the block's contextual toolbar (a WordPress popover,
  // portal'd to <body> at 1000000+) painted straight across the dialog.
  // Nothing drawn OVER the page can be laid out INSIDE it.
  //
  // Escaping the admin shell also escapes the div that declares --font-admin,
  // so the variable is re-declared here and the stack named explicitly — the
  // same fix the Dropdown menu needed, and why the modal does not fall back to
  // Battambang for its Latin UI text.
  const overlay = (
    <div
      // z-index has to clear the ARTICLE EDITOR'S BAND, which sits at 1000001
      // because it in turn has to beat WordPress's own popover layer (1000000).
      // At the old value of 100 this modal opened UNDERNEATH that band: the
      // search box, the type filters and the Upload button were all covered by
      // a strip of editor toolbar. A modal outranks a sticky toolbar — always.
      className={cx(adminFont.variable, css({ position: "fixed", inset: 0, zIndex: 1000050, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }))}
      style={{ background: ac.overlay, fontFamily: ADMIN_FONT_STACK }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        // Wider and taller than before: at 860x640 the grid showed ~3 rows of
        // 120px thumbnails out of a 115k-item library, which is why picking
        // meant searching blind.
        className={css({ width: "min(1100px, 100%)", height: "min(760px, 88vh)", display: "flex", flexDirection: "column", borderRadius: "14px", overflow: "hidden" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}
      >
        {/* Header */}
        <div className={css({ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <span className={css({ fontSize: "14px", fontWeight: 600 })}>{title}</span>
          <div className={css({ position: "relative", flex: 1, maxWidth: "320px" })}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 9, color: ac.faint }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={`Search ${result ? result.total.toLocaleString() : ""} ${KIND_NOUN[kind]}…`}
              className={css({ width: "100%", height: "32px", padding: "0 11px 0 32px", borderRadius: "8px", fontSize: "13px" })}
              style={{ background: ac.canvas, border: `1px solid ${ac.border}`, color: ac.text }}
            />
          </div>
          {/* Type filter. Segmented rather than a dropdown: few options, and
              the current one has to be readable at a glance while picking.
              A single-kind caller gets no strip at all — there is nothing to
              switch to. */}
          {locked ? null : (
          <div className={css({ display: "flex", gap: "2px", padding: "2px", borderRadius: "8px" })} style={{ background: ac.canvas, border: `1px solid ${ac.border}` }}>
            {([...kinds, "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setPage(1);
                }}
                aria-pressed={kind === k}
                className={css({ height: "26px", padding: "0 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", border: "none", textTransform: "capitalize", transition: "background .12s" })}
                style={{ background: kind === k ? ac.surface : "transparent", color: kind === k ? ac.text : ac.muted, fontWeight: kind === k ? 600 : 400 }}
              >
                {k}
              </button>
            ))}
          </div>
          )}
          <div className={css({ flex: 1 })} />
          <label
            className={css({ height: "32px", padding: "0 14px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", color: "var(--colors-admin-accent-fg)", transition: "background .12s", _hover: { background: ac.accentHover } })}
            style={{ background: ac.accent, opacity: uploading ? 0.7 : 1 }}
          >
            <Icon name="upload" size={13} strokeWidth={2} />
            {uploading ? "Uploading…" : "Upload"}
            <input
              ref={fileRef}
              type="file"
              // Match the active tab, so the OS file dialog pre-filters to what
              // this caller can actually use.
              accept={kind === "all" ? "image/*,video/*,audio/*" : `${kind}/*`}
              disabled={uploading}
              className={css({ display: "none" })}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" onClick={onClose} aria-label="Close" className={css({ width: "30px", height: "30px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", _hover: { background: ac.surfaceHover } })} style={{ color: ac.muted }}>
            <Icon name="x" size={13} strokeWidth={2.2} />
          </button>
        </div>

        {uploadErr ? (
          <div className={css({ padding: "8px 18px", fontSize: "12.5px" })} style={{ color: ac.danger, background: ac.dangerTint, borderBottom: `1px solid ${ac.border}` }} role="alert">
            {uploadErr}
          </div>
        ) : null}

        {/* Grid */}
        <div className={css({ flex: 1, overflowY: "auto", padding: "16px 18px" })}>
          {failed ? (
            <div className={css({ padding: "48px", textAlign: "center", fontSize: "13px" })} style={{ color: ac.muted }}>
              Couldn&rsquo;t load the media library. Close and try again.
            </div>
          ) : loading && !result ? (
            <div className={css({ padding: "48px", textAlign: "center", fontSize: "13px" })} style={{ color: ac.muted }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className={css({ padding: "48px", textAlign: "center", fontSize: "13px" })} style={{ color: ac.muted }}>
              No {KIND_NOUN[kind]} match.
            </div>
          ) : (
            <div className={css({ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px", opacity: loading ? 0.55 : 1, transition: "opacity .15s" })}>
              {items.map((m: MediaItem) => {
                const pick = toPicked(m);
                const order = picked.findIndex((p) => p.id === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => (multiple ? toggle(pick) : onPick(pick))}
                    aria-pressed={multiple ? order >= 0 : undefined}
                    title={`${m.title}${m.dims ? ` · ${m.dims}` : ""}`}
                    className={css({ display: "block", padding: 0, borderRadius: "9px", overflow: "hidden", cursor: "pointer", background: "transparent", position: "relative", transition: "border-color .12s, transform .12s", _hover: { transform: "translateY(-2px)" } })}
                    style={{ border: order >= 0 ? `2px solid ${ac.accent}` : `1px solid ${ac.border}` }}
                  >
                    {m.type === "image" && m.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails from the S3 host
                      <img src={m.thumb} alt={m.alt || m.title} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: ac.skeleton }} />
                    ) : m.type === "video" && m.url ? (
                      <span className={css({ position: "relative", display: "block" })}>
                        {/* First frame as the thumbnail — same trick as the Media
                            grid (preload metadata + #t=0.1 for Safari). */}
                        <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className={css({ pointerEvents: "none" })} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: ac.skeleton }} />
                        <span aria-hidden className={css({ position: "absolute", left: "6px", bottom: "6px", width: "22px", height: "22px", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center" })} style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                          <Icon name="play" size={12} strokeWidth={2} />
                        </span>
                      </span>
                    ) : (
                      // Audio/files have no visual at all — an icon card with
                      // the filename is the only honest tile. (`thumb` falls
                      // back to the media FILE itself, which an <img> renders
                      // as the broken-image glyph.)
                      <span className={css({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", aspectRatio: "1", padding: "10px" })} style={{ background: ac.surfaceSunken }}>
                        <Icon name={m.type === "audio" ? "music" : "media"} size={22} strokeWidth={1.4} style={{ color: ac.faint }} />
                        <span className={css({ fontSize: "11.5px", lineHeight: 1.4, textAlign: "center", lineClamp: 3, wordBreak: "break-word" })} style={{ color: ac.muted }}>{m.title}</span>
                        <span className={css({ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" })} style={{ color: ac.faint }}>{m.mime.split("/")[1] ?? m.type}</span>
                      </span>
                    )}
                    {order >= 0 ? (
                      // The NUMBER, not a tick: gallery order is the order you
                      // clicked, and it is the one thing a tick cannot show.
                      <span
                        className={css({ position: "absolute", top: "6px", right: "6px", minWidth: "20px", height: "20px", borderRadius: "10px", fontSize: "11.5px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--colors-admin-accent-fg)" })}
                        style={{ background: ac.accent }}
                      >
                        {order + 1}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer / pager */}
        <div className={css({ display: "flex", alignItems: "center", gap: "12px", padding: "10px 18px" })} style={{ borderTop: `1px solid ${ac.border}`, background: ac.canvas }}>
          <span className={css({ fontSize: "12px" })} style={{ color: ac.muted }}>
            {result ? `Page ${result.page} of ${Math.max(1, result.totalPages).toLocaleString()}` : ""}
          </span>
          <div className={css({ flex: 1 })} />
          <div className={css({ display: "flex", gap: "6px" })}>
            <PagerBtn label="Previous" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)} />
            <PagerBtn label="Next" disabled={loading || !result || page >= result.totalPages} onClick={() => setPage((p) => p + 1)} />
          </div>
          {multiple && picked.length > 0 ? (
            // The selection tray: which images, in what order, with a way out
            // of a misclick that does not mean starting over.
            <button
              type="button"
              onClick={() => setPicked([])}
              className={css({ height: "30px", padding: "0 10px", borderRadius: "8px", fontSize: "12px", cursor: "pointer" })}
              style={{ background: "transparent", border: `1px solid ${ac.border}`, color: ac.muted }}
            >
              Clear {picked.length}
            </button>
          ) : null}
          {multiple ? (
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => onPickMany?.(picked)}
              className={css({ height: "30px", padding: "0 14px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, border: "none", color: "var(--colors-admin-accent-fg)", transition: "background .12s" })}
              style={{ background: ac.accent, opacity: picked.length === 0 ? 0.45 : 1, cursor: picked.length === 0 ? "default" : "pointer" }}
            >
              {picked.length === 0 ? "Select images" : `Insert ${picked.length}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

function PagerBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={css({ height: "30px", padding: "0 12px", borderRadius: "8px", fontSize: "12.5px", transition: "border-color .12s" })} style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: disabled ? ac.faint : ac.text, cursor: disabled ? "default" : "pointer" }}>
      {label}
    </button>
  );
}
