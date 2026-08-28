"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { css } from "@/styled-system/css";
import { ac, type Status } from "../tokens";
import { Icon } from "../icons";
import { StatusPill } from "../ui";
import LegacySiteChip, { startLegacyRefresh } from "../LegacySiteChip";
import ConfirmDialog from "../ConfirmDialog";
import { useProgramEdit } from "./ProgramEditContext";
import { trashProgramAction } from "@/lib/admin/program-actions";
import { adminKeys } from "@/lib/admin/queries";

// The fixed frame at the top of the program editor: back arrow, program
// identity, primary action, and the Details|Episodes tab bar. It never
// re-mounts when switching tabs (it lives in the [id] layout), so the header
// stays put while only the body below swaps. The real program + Save live in
// ProgramEditContext (provided by that layout). The create flow has its own
// header — see NewProgramView.
export default function ProgramTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const edit = useProgramEdit();
  // Which confirm is up, if any. The dialog stays open across the write so a
  // rejection (an Author role has edit but not delete caps, for one) lands in
  // it instead of a native alert.
  const [confirm, setConfirm] = useState<null | "trash" | "unpublish">(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const onEpisodes = pathname.endsWith("/episodes");
  const base = onEpisodes ? pathname.slice(0, -"/episodes".length) : pathname;

  const program = edit?.program;
  const publicPath = edit?.publicPath ?? "";
  const saving = edit?.saving ?? false;
  // Buttons disable on `busy`, which also covers the ~4s after a write lands
  // while the server data catches up; only the LABEL keys off `saving`, so the
  // "Published" confirmation isn't overwritten by "Saving…" during that window.
  const busy = edit?.busy ?? false;
  const saveMsg = edit?.saveMsg ?? null;
  const statusLabel: Status =
    program?.status === "publish" ? "Published" : program?.status === "pending" ? "Pending" : "Draft";
  const published = program?.status === "publish";

  const doTrash = async () => {
    if (!program || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await trashProgramAction(program.id);
    if (!res.ok) {
      setDeleting(false);
      setDeleteError(res.error ?? "Couldn't trash the program.");
      return;
    }
    // A published program leaves its cached page + listings behind on the
    // legacy site — same ghost problem as trashing an article (afa 1.17.1
    // reconstructs the pre-trash URL). Fire-and-forget: the purge survives the
    // client-side navigation below even though no chip is mounted to show it.
    if (published) startLegacyRefresh(program.id);
    // The action busted the BFF tag; drop the client list cache too, or the
    // grid would paint the trashed program again from its 30min entry.
    // `deleting` stays true — we're navigating away, not returning to the form.
    await queryClient.invalidateQueries({ queryKey: adminKeys.programs });
    router.push("/admin/programs");
  };

  return (
    <div style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}>
      {/* Header row */}
      <div className={css({ display: "flex", alignItems: "center", gap: "14px", padding: "0 24px", height: "60px" })}>
        <Link href="/admin/programs" className={css({ width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", _hover: { background: ac.surfaceSunken } })} style={{ color: ac.muted }}>
          <Icon name="back" size={16} strokeWidth={1.8} />
        </Link>
        {!program ? (
          <div className={css({ fontSize: "20px", fontWeight: 600, lineHeight: 1.4 })}>Program</div>
        ) : (
          <>
            <div className={css({ fontSize: "20px", fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40vw" })}>{program.title || `#${program.id}`}</div>
            <StatusPill status={statusLabel} />
            <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap" })} style={{ color: saveMsg?.kind === "err" ? ac.danger : ac.faint }}>
              {saving ? "Saving…" : saveMsg?.text ?? ""}
            </span>
            <LegacySiteChip postId={program.id} />
          </>
        )}
        <div className={css({ flex: 1 })} />
        {program ? (
          <>
            <div className={css({ fontSize: "12.5px" })} style={{ color: ac.faint }}>
              {program.type === "movie" ? "Program" : "TV Show"} #{program.id}
            </div>
            {/* View always stays put — a missing button reads as a bug. When
                there's no public page yet it goes inert and the tooltip says
                why (only PUBLISHED movies are routed; a tv_show is an episode
                container, never a page of its own). */}
            {publicPath ? (
              <a
                href={publicPath}
                target="_blank"
                rel="noreferrer"
                title="Open this program on the public site"
                className={css({ height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", background: ac.surface, color: ac.text, borderWidth: "1px", borderStyle: "solid", borderColor: ac.border, transition: "border-color .12s", _hover: { borderColor: ac.borderStrong } })}
              >
                View
              </a>
            ) : (
              <span
                aria-disabled="true"
                title={
                  program.type === "movie"
                    ? "Publish this program to open it on the public site"
                    : "An episode collection has no public page of its own"
                }
                className={css({ height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", cursor: "not-allowed", display: "flex", alignItems: "center", background: ac.canvas, color: ac.faint, borderWidth: "1px", borderStyle: "solid", borderColor: ac.border })}
              >
                View
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirm("trash");
              }}
              disabled={deleting}
              title="Move this program to the trash"
              className={css({ height: "34px", padding: "0 12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", background: ac.surface, color: ac.muted, borderWidth: "1px", borderStyle: "solid", borderColor: ac.border, transition: "background .12s, border-color .12s, color .12s", _hover: { background: ac.dangerTint, borderColor: ac.danger, color: ac.danger } })}
              style={{ opacity: deleting ? 0.6 : 1 }}
            >
              <Icon name="trash" size={13} strokeWidth={1.8} />
              {deleting ? "Trashing…" : "Delete"}
            </button>
            {/* Publish / Unpublish. Outlined-accent sits between the plain
                secondary buttons and the solid-red Save, so a draft's most
                important action reads as such without two solid reds. */}
            <button
              type="button"
              onClick={() => {
                if (!edit) return;
                // Publishing is additive and instantly reversible — no confirm.
                // Unpublishing takes a live page down, so it gets one.
                if (published) setConfirm("unpublish");
                else edit.setStatus("publish");
              }}
              disabled={busy || !edit}
              title={
                published
                  ? "Move this program back to draft — it comes off the public site"
                  : "Publish this program to the public site"
              }
              className={css({ height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", background: ac.surface, borderWidth: "1px", borderStyle: "solid", transition: "background .12s" })}
              style={
                published
                  ? { color: ac.muted, borderColor: ac.border, opacity: busy ? 0.6 : 1 }
                  : { color: ac.accent, borderColor: ac.accent, opacity: busy ? 0.6 : 1 }
              }
            >
              {published ? "Unpublish" : "Publish"}
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={busy || !edit}
          onClick={edit?.save}
          className={css({ height: "34px", padding: "0 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", boxShadow: ac.shadowSm, transition: "background .12s", _hover: { background: ac.accentHover } })}
          style={{ background: ac.accent, opacity: busy ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Tab bar */}
      <div className={css({ display: "flex", padding: "0 24px" })}>
        <Tab href={base} label="Details" active={!onEpisodes} />
        <Tab href={`${base}/episodes`} label="Episodes" active={onEpisodes} />
      </div>

      {confirm === "trash" && program ? (
        <ConfirmDialog
          title="Move this program to the trash?"
          confirmLabel="Move to trash"
          busyLabel="Trashing…"
          busy={deleting}
          error={deleteError}
          onConfirm={() => void doTrash()}
          onCancel={() => {
            setConfirm(null);
            setDeleteError(null);
          }}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>{program.title || `#${program.id}`}</strong> comes off the
          site straight away.
          {program.type === "movie" && program.showId > 0
            ? " Its episode collection goes to the trash with it — the episodes themselves stay in WordPress."
            : ""}{" "}
          Nothing is deleted permanently; you can restore it from WordPress&rsquo;s Trash.
        </ConfirmDialog>
      ) : null}

      {confirm === "unpublish" && program ? (
        <ConfirmDialog
          title="Take this program off the public site?"
          confirmLabel="Unpublish"
          onConfirm={() => {
            setConfirm(null);
            edit?.setStatus("draft"); // progress shows in the top bar, as with Save
          }}
          onCancel={() => setConfirm(null)}
        >
          <strong style={{ color: ac.text, fontWeight: 600 }}>{program.title || `#${program.id}`}</strong> goes back to
          draft — its page and poster disappear from the site. Nothing is deleted, and publishing again puts it back.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={css({ padding: "11px 2px", marginRight: "22px", fontSize: "13.5px", cursor: "pointer" })}
      style={{
        color: active ? ac.text : ac.muted,
        fontWeight: active ? 500 : 400,
        borderBottom: `2px solid ${active ? ac.accent : "transparent"}`,
        marginBottom: "-1px",
      }}
    >
      {label}
    </Link>
  );
}
