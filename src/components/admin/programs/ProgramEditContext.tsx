"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { EditableProgram } from "@/lib/admin/program-edit";
import { saveProgramAction, setProgramStatusAction, type ProgramPayload } from "@/lib/admin/program-actions";
import { adminKeys } from "@/lib/admin/queries";
import { startLegacyRefresh } from "../LegacySiteChip";

// Bridges the [id] layout's persistent top bar (which owns the Save button)
// and the Details tab's form (which owns the fields). The form registers a
// collector that snapshots its current state; the top bar's Save runs it,
// posts the payload through the Server Action, and exposes saving/feedback
// state for both to render. Create mode has no provider — components fall
// back to their static create rendering when the context is null.

export type SaveMsg = { kind: "ok" | "err"; text: string } | null;

/** Returns the payload to save, or a string to show as a validation error. */
export type Collector = () => ProgramPayload | string;

interface ProgramEditApi {
  program: EditableProgram;
  /** Public site path for the View button ("/program/<slug>"), resolved from
   *  the routing registry by the layout. "" when the program has no public
   *  page (a draft, or a tv_show container). */
  publicPath: string;
  /** A write is in flight — drives the "Saving…" label. */
  saving: boolean;
  /** Saving, OR the write landed but the server data behind the editor hasn't
   *  caught up yet. Every action button disables on THIS, not on `saving`. */
  busy: boolean;
  saveMsg: SaveMsg;
  /** Details form: (re)register the fresh-state collector on every render,
   *  and null it on unmount — Save on the Episodes tab must not see a stale
   *  snapshot of an unmounted form. */
  setCollector: (fn: Collector | null) => void;
  /** Top bar: run the collector and save. No-op when no form is mounted. */
  save: () => void;
  /** Top bar: publish / unpublish. Saves the Details fields in the same write
   *  when the form is mounted; falls back to a status-only flip when it isn't
   *  (the Episodes tab), so the button works on every tab. */
  setStatus: (status: "draft" | "publish") => void;
}

const Ctx = createContext<ProgramEditApi | null>(null);

export const useProgramEdit = () => useContext(Ctx);

export default function ProgramEditProvider({
  program,
  publicPath,
  children,
}: {
  program: EditableProgram;
  publicPath: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const collectorRef = useRef<Collector | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<SaveMsg>(null);
  // The status a completed write has ALREADY put in WordPress. `router.refresh()`
  // re-pulls the editor's server data, but that costs a full WordPress round
  // trip (~4s — the known REST floor), so for those seconds `program.status`
  // still reads the OLD value: the pill said "Draft" and the button offered
  // "Publish" again, and a second click started another ~85s write. This is
  // refresh LATENCY, not a stale cache — do not restructure the refresh.
  const [pendingStatus, setPendingStatus] = useState<"draft" | "publish" | null>(null);

  const setCollector = useCallback((fn: Collector | null) => {
    collectorRef.current = fn;
  }, []);

  const finish = useCallback(
    (res: { ok: boolean; error?: string }, okText: string, status?: "draft" | "publish") => {
      setSaving(false);
      if (!res.ok) {
        setSaveMsg({ kind: "err", text: res.error ?? "Save failed." });
        return;
      }
      setSaveMsg({ kind: "ok", text: okText });
      // The write changed something the OLD WordPress site shows — it is
      // published now, or it was until this write (an unpublish). Our writes
      // skip AMS Cache's purge hooks (the fast-save fix), so kick off the
      // background purge+re-warm; the chip in the top bar narrates it.
      // `program.status` here is the PRE-save status.
      if (status === "publish" || program.status === "publish") startLegacyRefresh(program.id);
      if (status) {
        // The action returned ok, so WordPress HAS this status — show it now and
        // stay busy until the refreshed data agrees.
        setPendingStatus(status);
        // Safety valve: never leave the buttons locked if the refresh never
        // lands (a WP hiccup, a discarded refresh). 5× the measured round trip.
        window.setTimeout(() => setPendingStatus(null), 20_000);
        // A status change moves the program on/off the public site and changes
        // its list pill — the server tag is already busted, so drop the client
        // list cache too or the grid keeps painting the old status for 30min.
        void queryClient.invalidateQueries({ queryKey: adminKeys.programs });
      }
      router.refresh(); // re-pull the (no-store) server data behind the editor
    },
    [program.id, program.status, queryClient, router],
  );

  // True from the moment a status write succeeds until the server data catches
  // up. Derived, so it needs no effect to clear itself (and trips no
  // setState-in-effect lint).
  const syncing = pendingStatus !== null && program.status !== pendingStatus;
  const view = syncing ? { ...program, status: pendingStatus } : program;

  const run = useCallback(
    (status?: "draft" | "publish") => {
      if (saving || syncing) return;
      const collect = collectorRef.current;
      const okText = status === "publish" ? "Published" : status === "draft" ? "Moved to draft" : "Saved";

      // No Details form mounted (the Episodes tab). A plain Save has nothing to
      // write, but a status flip still does — do it without the fields.
      if (!collect) {
        if (!status) return;
        setSaving(true);
        setSaveMsg(null);
        void setProgramStatusAction(program.type, program.id, status).then((res) => finish(res, okText, status));
        return;
      }

      const payload = collect();
      if (typeof payload === "string") {
        setSaveMsg({ kind: "err", text: payload });
        return;
      }
      setSaving(true);
      setSaveMsg(null);
      void saveProgramAction(program.type, program.id, payload, status).then((res) => finish(res, okText, status));
    },
    [program.type, program.id, saving, syncing, finish],
  );

  const save = useCallback(() => run(), [run]);
  const setStatus = useCallback((status: "draft" | "publish") => run(status), [run]);

  return (
    <Ctx.Provider
      value={{ program: view, publicPath, saving, busy: saving || syncing, saveMsg, setCollector, save, setStatus }}
    >
      {children}
    </Ctx.Provider>
  );
}
