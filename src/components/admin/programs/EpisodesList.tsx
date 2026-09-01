"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon } from "../icons";
import { BentoCard } from "../ui";
import ConfirmDialog from "../ConfirmDialog";
import MediaPicker from "../MediaPicker";
import { startLegacyRefresh } from "../LegacySiteChip";
import { useProgramEdit } from "./ProgramEditContext";
import type { AdminEpisode } from "@/lib/admin/program-edit";
import {
  createShowAction,
  createEpisodeAction,
  updateEpisodeAction,
  trashEpisodeAction,
  loadEpisodeAction,
} from "@/lib/admin/program-actions";

// Episodes tab. Three states:
//  1. No episode collection yet (movie without _khi_tv_show_id): explain +
//     offer to create the collection (a DRAFT tv_show + the link meta). The
//     draft itself is quick; the link write back to the movie still runs the
//     slow publish hooks when the PROGRAM is published, so it keeps the
//     confirm dialog and a persistent progress state.
//  2. Collection, no episodes: the list frame + "New episode".
//  3. Collection with episodes: season accordion (grouped by the "S2:E14"
//     labels — the stored season_id index is unreliable) + "New episode".
// Episode creation posts a PUBLISHED episode (drafts vanish from every
// episode surface) with the meta set wp-admin's editor writes.

const fieldClass = css({ width: "100%", height: "36px", padding: "0 11px", borderRadius: "8px", fontSize: "13px" });

export default function EpisodesList({
  episodes,
  linked,
  programId,
  programTitle,
}: {
  episodes: AdminEpisode[];
  linked: boolean;
  programId: number;
  programTitle: string;
}) {
  const router = useRouter();
  // Episode writes only matter to the legacy site when the PROGRAM is live:
  // episodes of a draft program aren't linked anywhere, so their pages can't
  // have been visited and cached. Default to purging when the context is
  // somehow absent — over-purging is safe, a missed purge is the bug.
  const edit = useProgramEdit();
  const programLive = edit?.program ? edit.program.status === "publish" : true;
  const [search, setSearch] = useState("");
  // Season number of the open group; null = all collapsed. Seeded with the
  // newest season (episodes arrive sorted season-desc).
  const [openSeason, setOpenSeason] = useState<number | null>(episodes[0]?.season ?? null);
  const [adding, setAdding] = useState(false);
  // The row being edited (null = the dialog is closed or in create mode).
  const [editing, setEditing] = useState<AdminEpisode | null>(null);
  const [saved, setSaved] = useState<{ label: string; mode: "created" | "updated" | "trashed" } | null>(null);
  // Rows the server list hasn't confirmed yet — created/edited this session.
  // The list previously relied on router.refresh() alone, which raced the
  // slow WP read and left the new episode invisible until a manual reload
  // with nothing saying it worked. A row leaves the overlay by DERIVATION
  // (the server row appears and matches), never by an effect — the repo's
  // no-setState-in-effect rule stays untouched.
  const [overlay, setOverlay] = useState<Record<number, AdminEpisode>>({});
  // The mirror image for trash: ids hidden the moment the trash succeeds,
  // instead of lingering until router.refresh() catches up. Entries go inert
  // by the same derivation once the server list stops carrying the id.
  const [removed, setRemoved] = useState<Record<number, true>>({});
  // The row awaiting confirmation; the dialog stays up while the write runs so
  // a failure lands in it rather than in a second popup.
  const [confirmTrash, setConfirmTrash] = useState<AdminEpisode | null>(null);
  const [trashing, setTrashing] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);

  const doTrash = async () => {
    const ep = confirmTrash;
    if (!ep || trashing) return;
    setTrashing(true);
    setTrashError(null);
    const res = await trashEpisodeAction(programId, ep.id);
    setTrashing(false);
    if (!res.ok) {
      setTrashError(res.error ?? "Couldn't trash the episode.");
      return;
    }
    setConfirmTrash(null);
    // The row vanishes NOW and the banner says so — reloading to check is
    // exactly what this exists to end.
    setRemoved((r) => ({ ...r, [ep.id]: true }));
    setSaved({ label: ep.label || ep.title, mode: "trashed" });
    // A trashed row must not resurrect through the overlay.
    setOverlay((o) => {
      if (!o[ep.id]) return o;
      const rest = { ...o };
      delete rest[ep.id];
      return rest;
    });
    // Clear the legacy site's cached copies — the episode's own page plus its
    // show's and movie's pages (afa 1.17.2 walks the family links, 1.17.1
    // reconstructs the pre-trash URL).
    if (programLive) startLegacyRefresh(ep.id);
    router.refresh(); // this tab is a server page — re-pull the episode list
  };

  if (!linked) {
    return <CreateShowCard programId={programId} programTitle={programTitle} onCreated={() => router.refresh()} />;
  }

  // Overlay rows stand in for (or ahead of) the server list until it agrees,
  // re-sorted into the same season-desc / episode-desc order the loader
  // guarantees so a new episode lands in its season, not at an edge.
  const isConfirmed = (o: AdminEpisode) => {
    const s = episodes.find((e) => e.id === o.id);
    return !!s && s.title === o.title && s.label === o.label && s.runTime === o.runTime;
  };
  const pendingRows = Object.values(overlay).filter((o) => !isConfirmed(o) && !removed[o.id]);
  const pendingIds = new Set(pendingRows.map((o) => o.id));
  const all = [...pendingRows, ...episodes.filter((e) => !pendingIds.has(e.id) && !removed[e.id])].sort(
    (a, b) => b.season - a.season || b.episode - a.episode,
  );

  const q = search.trim().toLowerCase();
  const list = q
    ? all.filter((e) => e.title.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))
    : all;

  // Group into seasons, preserving the newest-first ordering from the loader.
  const groups: { season: number; eps: AdminEpisode[] }[] = [];
  for (const ep of list) {
    const last = groups[groups.length - 1];
    if (last && last.season === ep.season) last.eps.push(ep);
    else groups.push({ season: ep.season, eps: [ep] });
  }

  return (
    <>
      <div className={css({ display: "flex", alignItems: "center", gap: "10px" })}>
        <div className={css({ position: "relative", flex: 1, maxWidth: "360px" })}>
          <Icon name="search" size={15} style={{ position: "absolute", left: 12, top: 10, color: ac.faint }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${all.length} episodes…`}
            className={css({ width: "100%", height: "36px", padding: "0 12px 0 36px", borderRadius: "8px", fontSize: "13.5px" })}
            style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text }}
          />
        </div>
        <div className={css({ flex: 1 })} />
        <button
          type="button"
          onClick={() => {
            setSaved(null);
            setEditing(null);
            setAdding(true);
          }}
          className={css({ height: "36px", padding: "0 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", border: "none", color: "var(--colors-admin-accent-fg)", transition: "background .12s", _hover: { background: ac.accentHover } })}
          style={{ background: ac.accent }}
        >
          <Icon name="plus" size={13} strokeWidth={2.2} />
          New episode
        </button>
      </div>

      {adding || editing ? (
        <EpisodeDialog
          key={editing?.id ?? "new"}
          programId={programId}
          episodes={episodes}
          editing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={(mode, row) => {
            setAdding(false);
            setEditing(null);
            setSaved({ label: row.label, mode });
            // Show it NOW from what the dialog already knows; the server list
            // confirms (and replaces) it when router.refresh() lands.
            if (row.id) setOverlay((o) => ({ ...o, [row.id]: row }));
            setOpenSeason(row.season);
            // A created/updated episode changes its show's and movie's pages
            // on the legacy site (episodes are always posted PUBLISHED).
            if (programLive && row.id) startLegacyRefresh(row.id);
            router.refresh();
          }}
        />
      ) : null}

      {saved ? (
        <div
          role="status"
          className={css({ display: "flex", alignItems: "center", gap: "9px", padding: "10px 14px", borderRadius: "10px", fontSize: "13px" })}
          style={{ background: ac.dataSoft, border: `1px solid ${ac.data}`, color: ac.data }}
        >
          <Icon name="check" size={14} strokeWidth={2.2} />
          <span>Episode <strong>{saved.label}</strong> {saved.mode === "created" ? "published" : saved.mode === "updated" ? "updated" : "moved to trash"}.</span>
          <div className={css({ flex: 1 })} />
          <button type="button" onClick={() => setSaved(null)} aria-label="Dismiss" className={css({ width: "24px", height: "24px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", _hover: { background: ac.dataSoft } })} style={{ color: ac.data }}>
            <Icon name="x" size={11} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      <BentoCard>
        <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", fontSize: "13px", fontWeight: 600 })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <span>Episodes</span>
          <span className={css({ fontSize: "12px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.faint }}>
            {list.length === all.length
              ? `${all.length} episode${all.length === 1 ? "" : "s"}`
              : `${list.length} of ${all.length}`}
          </span>
        </div>

        {list.length === 0 ? (
          <div className={css({ padding: "32px", textAlign: "center", fontSize: "13px" })} style={{ color: ac.muted }}>
            {all.length === 0 ? "No episodes yet — add the first one." : `No episodes match “${search.trim()}”.`}
          </div>
        ) : (
          <div className={css({ padding: "4px 0 8px" })}>
            {groups.map(({ season, eps }, gi) => {
              const isOpen = q ? true : openSeason === season;
              return (
              <div key={`${season}-${gi}`}>
                <button
                  type="button"
                  onClick={() => setOpenSeason((s) => (s === season ? null : season))}
                  className={css({ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px 8px", width: "100%", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", _hover: { "& [data-season]": { color: ac.text } } })}
                >
                  <Icon name="chevronRight" size={11} strokeWidth={2.2} style={{ color: ac.faint, flex: "none", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  <span data-season className={css({ fontSize: "12px", fontWeight: 600, letterSpacing: "0.02em" })} style={{ color: isOpen ? ac.text : ac.muted }}>
                    {season > 0 ? `Season ${season}` : "No season label"}
                  </span>
                  <span className={css({ fontSize: "11.5px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.faint }}>
                    {eps.length} ep{eps.length === 1 ? "" : "s"}
                  </span>
                </button>
                {isOpen ? eps.map((ep) => (
                  <div key={ep.id} className={css({ display: "flex", alignItems: "center", gap: "12px", padding: "8px 20px", _hover: { background: ac.surfaceHover, "& [data-acts]": { opacity: 1 } } })} style={{ borderTop: `1px solid ${ac.rowLine}`, opacity: trashing && confirmTrash?.id === ep.id ? 0.5 : pendingIds.has(ep.id) ? 0.72 : 1 }}>
                    {ep.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
                      <img src={ep.thumbnail} alt="" loading="lazy" style={{ width: 56, height: 32, objectFit: "cover", borderRadius: 5, border: `1px solid ${ac.border}`, flex: "none" }} />
                    ) : (
                      <div style={{ width: 56, height: 32, borderRadius: 5, background: ac.skeleton, border: `1px solid ${ac.border}`, flex: "none" }} />
                    )}
                    <span className={css({ fontSize: "11.5px", flex: "none", minWidth: "52px", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.faint }}>
                      {ep.label || "—"}
                    </span>
                    <span className={css({ flex: 1, minWidth: 0, fontSize: "13.5px", lineHeight: 1.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>
                      {ep.title}
                    </span>
                    {pendingIds.has(ep.id) ? (
                      <span title="Saved — waiting for the server list to confirm" className={css({ fontSize: "10.5px", flex: "none", padding: "2px 8px", borderRadius: "999px" })} style={{ background: ac.dataSoft, color: ac.data }}>
                        syncing…
                      </span>
                    ) : null}
                    {ep.runTime ? (
                      <span className={css({ fontSize: "11.5px", flex: "none", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.faint }}>{ep.runTime}</span>
                    ) : null}
                    <span className={css({ fontSize: "11.5px", flex: "none", minWidth: "72px", textAlign: "right", fontVariantNumeric: "tabular-nums" })} style={{ color: ac.faint }}>
                      {ep.releaseDate}
                    </span>
                    {/* Hover-revealed row actions — kept visible on keyboard
                        focus so they're reachable without a pointer. */}
                    <div data-acts className={css({ display: "flex", gap: "2px", flex: "none", opacity: 0, transition: "opacity .14s", _focusWithin: { opacity: 1 } })}>
                      <button
                        type="button"
                        onClick={() => {
                          setSaved(null);
                          setAdding(false);
                          setEditing(ep);
                        }}
                        aria-label={`Edit ${ep.title}`}
                        title="Edit episode"
                        className={css({ width: "28px", height: "28px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", color: ac.muted, transition: "background .12s, color .12s", _hover: { background: ac.rowLine, color: ac.text } })}
                      >
                        <Icon name="pencil" size={13} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTrashError(null);
                          setConfirmTrash(ep);
                        }}
                        disabled={trashing}
                        aria-label={`Move ${ep.title} to trash`}
                        title="Move episode to trash"
                        className={css({ width: "28px", height: "28px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", color: ac.muted, transition: "background .12s, color .12s", _hover: { background: ac.dangerTint, color: ac.danger } })}
                      >
                        <Icon name="trash" size={13} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                )) : null}
              </div>
              );
            })}
          </div>
        )}
      </BentoCard>

      {confirmTrash ? (
        <ConfirmDialog
          title="Move this episode to the trash?"
          confirmLabel="Move to trash"
          busyLabel="Trashing…"
          busy={trashing}
          error={trashError}
          onConfirm={() => void doTrash()}
          onCancel={() => {
            setConfirmTrash(null);
            setTrashError(null);
          }}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>
            {confirmTrash.label ? `${confirmTrash.label} — ` : ""}
            {confirmTrash.title}
          </strong>{" "}
          comes off the site straight away. Nothing is deleted permanently — you can restore it from
          WordPress&rsquo;s Trash.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/* --- state 1: no episode collection yet ------------------------------------ */

function CreateShowCard({ programId, programTitle, onCreated }: { programId: number; programTitle: string; onCreated: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setConfirming(false);
    setCreating(true);
    setError(null);
    try {
      const res = await createShowAction(programId);
      if (!res.ok) {
        setError(res.error ?? "Couldn't create the episode collection.");
        return;
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error && e.message ? `Request failed: ${e.message}` : "Request failed — check the server console.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <BentoCard style={{ padding: "40px", textAlign: "center" }}>
      {creating ? (
        <>
          <span className={css({ display: "inline-flex" })} style={{ animation: "admin-spin 0.9s linear infinite", color: ac.muted }}>
            <Icon name="refresh" size={18} strokeWidth={1.8} />
          </span>
          <div className={css({ fontSize: "14px", fontWeight: 500, marginTop: "10px" })}>Creating the episode collection…</div>
          <div className={css({ fontSize: "12.5px", marginTop: "6px" })} style={{ color: ac.muted }}>
            Usually a few seconds — longer on a published program, where WordPress runs slow save
            hooks. Keep this tab open.
          </div>
          <style>{`@keyframes admin-spin { to { transform: rotate(360deg) } }`}</style>
        </>
      ) : (
        <>
          <div className={css({ fontSize: "14px", fontWeight: 500 })}>No seasons or episodes yet</div>
          <div className={css({ fontSize: "13px", marginTop: "6px", maxWidth: "520px", marginLeft: "auto", marginRight: "auto" })} style={{ color: ac.muted }}>
            Episodes live in a collection attached to the program. Create it once, then add
            seasons and episodes right here.
          </div>
          {error ? (
            <p role="alert" className={css({ fontSize: "12.5px", marginTop: "12px" })} style={{ color: ac.danger }}>{error}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={css({ marginTop: "16px", height: "36px", padding: "0 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", display: "inline-flex", alignItems: "center", gap: "7px", transition: "background .12s", _hover: { background: ac.accentHover } })}
            style={{ background: ac.accent }}
          >
            <Icon name="plus" size={13} strokeWidth={2.2} />
            Create seasons &amp; episodes
          </button>
        </>
      )}

      {confirming ? (
        <div className={css({ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" })} style={{ background: ac.overlay }} onClick={() => setConfirming(false)}>
          <div role="dialog" aria-label="Create episode collection" onClick={(e) => e.stopPropagation()} className={css({ width: "min(440px, 100%)", borderRadius: "14px", padding: "20px", textAlign: "left" })} style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}>
            <div className={css({ fontSize: "14px", fontWeight: 600 })}>Create the episode collection?</div>
            <p className={css({ fontSize: "13px", lineHeight: 1.7, marginTop: "10px" })} style={{ color: ac.muted }}>
              This creates the TV-show collection for <strong>{programTitle}</strong> in WordPress and links
              it to this program. It only needs to happen once. The collection stays a draft — it&rsquo;s
              never a page on the site, only the shelf your episodes sit on.
            </p>
            <div className={css({ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" })}>
              <button type="button" onClick={() => setConfirming(false)} className={css({ height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" })} style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text }}>
                Cancel
              </button>
              <button type="button" onClick={() => void create()} className={css({ height: "34px", padding: "0 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", transition: "background .12s", _hover: { background: ac.accentHover } })} style={{ background: ac.accent }}>
                Create collection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </BentoCard>
  );
}

/* --- new-episode dialog ----------------------------------------------------- */

/** Today in Phnom Penh as "YYYY-MM-DD" (en-CA formats as ISO). */
function todayPP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh" }).format(new Date());
}

function EpisodeDialog({
  programId,
  episodes,
  editing,
  onClose,
  onSaved,
}: {
  programId: number;
  episodes: AdminEpisode[];
  /** The row being edited; null = create a new episode. */
  editing: AdminEpisode | null;
  onClose: () => void;
  /** Fires with a fully-formed row so the list can show it immediately. */
  onSaved: (mode: "created" | "updated", row: AdminEpisode) => void;
}) {
  // Create: prefill from the newest labelled episode (same season, next
  // number). Edit: seed from the list row so the fields aren't empty while the
  // full episode loads — the row has no video URL and only a display-formatted
  // date, so the real values arrive from loadEpisodeAction below.
  const newest = episodes.find((e) => e.season > 0);
  const [season, setSeason] = useState(String(editing ? editing.season || 1 : newest?.season ?? 1));
  const [episode, setEpisode] = useState(String(editing ? editing.episode || 1 : (newest?.episode ?? 0) + 1));
  const [title, setTitle] = useState(editing?.title ?? "");
  // The list row carries no description either; it arrives with the load.
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [releaseDate, setReleaseDate] = useState(editing ? "" : todayPP());
  const [runTime, setRunTime] = useState(editing?.runTime ?? "");
  const [thumb, setThumb] = useState<{ id: number; url: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Editing starts blocked until the real episode lands: saving a half-loaded
  // form would blank the video URL and clear the thumbnail (thumbId 0).
  const [loading, setLoading] = useState(editing !== null);
  const [loadFailed, setLoadFailed] = useState(false);

  const editingId = editing?.id ?? 0;
  const fallbackThumb = editing?.thumbnail ?? "";

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    void loadEpisodeAction(editingId).then((res) => {
      if (cancelled) return;
      if (!res.ok || !res.episode) {
        setError(res.error ?? "Couldn't load the episode.");
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      const e = res.episode;
      if (e.season) setSeason(String(e.season));
      if (e.episode) setEpisode(String(e.episode));
      setTitle(e.title);
      setDescription(e.description);
      setVideoUrl(e.videoUrl);
      setReleaseDate(e.releaseDate);
      setRunTime(e.runTime);
      setThumb(e.thumbId ? { id: e.thumbId, url: e.thumbUrl || fallbackThumb } : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [editingId, fallbackThumb]);

  const fieldStyle = { background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text } as const;
  const labelClass = css({ fontSize: "12px", marginBottom: "6px" });

  const submit = async () => {
    if (busy || loading || loadFailed) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        season: Number(season) || 0,
        episode: Number(episode) || 0,
        title,
        description,
        videoUrl,
        releaseDate,
        runTime,
        thumbId: thumb?.id ?? 0,
      };
      const res = editing
        ? await updateEpisodeAction(programId, editing.id, payload)
        : await createEpisodeAction(programId, payload);
      if (!res.ok) {
        setError(res.error ?? `Couldn't ${editing ? "save" : "create"} the episode.`);
        return;
      }
      const iso = releaseDate.split("-");
      onSaved(editing ? "updated" : "created", {
        id: editing ? editing.id : (res.id ?? 0),
        title,
        label: `S${Number(season)}:E${Number(episode)}`,
        season: Number(season) || 0,
        episode: Number(episode) || 0,
        runTime,
        // The date input holds ISO; the list shows dd.mm.yyyy like the loader.
        releaseDate: iso.length === 3 ? `${iso[2]}.${iso[1]}.${iso[0]}` : "",
        thumbnail: thumb?.url || editing?.thumbnail || "",
        permalink: editing?.permalink ?? "",
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? `Request failed: ${e.message}` : "Request failed — check the server console.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css({ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" })} style={{ background: ac.overlay }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={editing ? "Edit episode" : "New episode"}
        onClick={(e) => e.stopPropagation()}
        className={css({ width: "min(480px, 100%)", maxHeight: "100%", overflowY: "auto", borderRadius: "14px" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}
      >
        <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <span className={css({ fontSize: "14px", fontWeight: 600 })}>{editing ? "Edit episode" : "New episode"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className={css({ width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", _hover: { background: ac.surfaceHover } })} style={{ color: ac.muted }}>
            <Icon name="x" size={12} strokeWidth={2.2} />
          </button>
        </div>

        {loading ? (
          <div className={css({ padding: "44px", textAlign: "center" })}>
            <span className={css({ display: "inline-flex" })} style={{ animation: "admin-spin 0.9s linear infinite", color: ac.muted }}>
              <Icon name="refresh" size={16} strokeWidth={1.8} />
            </span>
            <div className={css({ fontSize: "13px", marginTop: "8px" })} style={{ color: ac.muted }}>Loading episode…</div>
            <style>{`@keyframes admin-spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : loadFailed ? (
          <div className={css({ padding: "28px", textAlign: "center" })}>
            <p role="alert" className={css({ fontSize: "13px", margin: 0 })} style={{ color: ac.danger }}>{error}</p>
            <button type="button" onClick={onClose} className={css({ marginTop: "16px", height: "34px", padding: "0 16px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" })} style={fieldStyle}>
              Close
            </button>
          </div>
        ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className={css({ display: "flex", flexDirection: "column", gap: "14px", padding: "18px" })}
        >
          <div className={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" })}>
            <div>
              <div className={labelClass} style={{ color: ac.muted }}>Season</div>
              <input value={season} onChange={(e) => setSeason(e.target.value)} inputMode="numeric" className={fieldClass} style={fieldStyle} />
            </div>
            <div>
              <div className={labelClass} style={{ color: ac.muted }}>Episode number</div>
              <input value={episode} onChange={(e) => setEpisode(e.target.value)} inputMode="numeric" className={fieldClass} style={fieldStyle} />
            </div>
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className={fieldClass} style={fieldStyle} />
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Description</div>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown in the Description box under the player" className={css({ width: "100%", padding: "8px 11px", borderRadius: "8px", fontSize: "13px", lineHeight: 1.6, resize: "vertical" })} style={fieldStyle} />
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Video URL</div>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://vimeo.com/… or https://youtu.be/…" className={fieldClass} style={{ ...fieldStyle, fontFamily: "ui-monospace, monospace" }} />
          </div>
          <div className={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" })}>
            <div>
              <div className={labelClass} style={{ color: ac.muted }}>Release date</div>
              <input value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} placeholder="YYYY-MM-DD" className={fieldClass} style={fieldStyle} />
            </div>
            <div>
              <div className={labelClass} style={{ color: ac.muted }}>Duration</div>
              <input value={runTime} onChange={(e) => setRunTime(e.target.value)} placeholder="27:18 នាទី" className={fieldClass} style={fieldStyle} />
            </div>
          </div>
          <div>
            <div className={labelClass} style={{ color: ac.muted }}>Thumbnail</div>
            <div className={css({ display: "flex", alignItems: "center", gap: "10px" })}>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
                <img src={thumb.url} alt="" style={{ width: 84, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${ac.border}` }} />
              ) : (
                <div style={{ width: 84, height: 48, borderRadius: 6, background: ac.skeleton, border: `1px dashed ${ac.borderStrong}` }} />
              )}
              <button type="button" onClick={() => setPicking(true)} className={css({ height: "32px", padding: "0 12px", borderRadius: "8px", fontSize: "12.5px", cursor: "pointer", transition: "border-color .12s", _hover: { borderColor: ac.borderStrong } })} style={fieldStyle}>
                {thumb ? "Change" : "Choose or upload"}
              </button>
              {thumb ? (
                <button type="button" onClick={() => setThumb(null)} className={css({ height: "32px", padding: "0 10px", borderRadius: "8px", fontSize: "12.5px", cursor: "pointer", background: "transparent", border: "none" })} style={{ color: ac.muted }}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <div className={css({ fontSize: "11.5px", lineHeight: 1.6 })} style={{ color: ac.faint }}>
            {editing
              ? "Saving a published episode runs WordPress's slow publish hooks, so this can take a while. Renumbering doesn't change the episode's public URL."
              : "The episode publishes immediately (drafts don't appear in episode lists) and can take a while to save — WordPress runs slow hooks on publish."}
          </div>

          {error ? (
            <p role="alert" className={css({ fontSize: "12.5px", margin: 0 })} style={{ color: ac.danger }}>{error}</p>
          ) : null}

          <div className={css({ display: "flex", justifyContent: "flex-end", gap: "8px" })}>
            <button type="button" onClick={onClose} className={css({ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" })} style={fieldStyle}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={css({ height: "36px", padding: "0 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", transition: "background .12s", _hover: { background: ac.accentHover } })} style={{ background: ac.accent, opacity: busy ? 0.7 : 1 }}>
              {busy ? (editing ? "Saving…" : "Publishing…") : editing ? "Save episode" : "Publish episode"}
            </button>
          </div>
        </form>
        )}
      </div>

      {picking ? (
        <MediaPicker
          title="Episode thumbnail"
          onPick={(m) => {
            setThumb({ id: m.id, url: m.thumb || m.url });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
