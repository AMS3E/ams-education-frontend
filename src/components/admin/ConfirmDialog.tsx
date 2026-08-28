"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { Icon } from "./icons";

// The admin's confirm step for destructive actions — the replacement for
// window.confirm/alert, which don't belong in this UI and can't do the two
// things these flows actually need: STAY OPEN while the write runs (WordPress
// takes seconds, sometimes a minute) and report a failure in place instead of
// in a second native popup.
//
// Cancel takes focus on open, never the destructive button: a stray Enter
// should never be the thing that deletes something.

const btn = css({
  height: "36px",
  padding: "0 16px",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "7px",
  transition: "background .12s, border-color .12s",
});

export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel = "Working…",
  tone = "danger",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** The explanation — say what happens and whether it's reversible. */
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  /** "danger" paints the confirm button in the error red, kept distinct from
   *  the AMS brand accent so destructive never looks like primary. */
  tone?: "danger" | "default";
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape closes — but not mid-write, when the action is already in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className={css({ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" })}
      style={{ background: ac.overlay }}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={css({ width: "min(440px, 100%)", borderRadius: "14px", padding: "20px" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}
      >
        <div className={css({ fontSize: "14px", fontWeight: 600 })}>{title}</div>
        <div className={css({ fontSize: "13px", lineHeight: 1.7, marginTop: "10px" })} style={{ color: ac.muted }}>
          {children}
        </div>

        {error ? (
          <p
            role="alert"
            className={css({ fontSize: "12.5px", lineHeight: 1.6, marginTop: "14px", marginBottom: 0, padding: "9px 11px", borderRadius: "8px" })}
            style={{ color: ac.danger, background: ac.dangerTint, border: `1px solid ${ac.danger}` }}
          >
            {error}
          </p>
        ) : null}

        <div className={css({ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" })}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={btn}
            style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text, opacity: busy ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={btn}
            style={{ background: tone === "danger" ? ac.dangerFill : ac.accent, border: "none", color: ac.accentFg, opacity: busy ? 0.75 : 1 }}
          >
            {busy ? (
              <>
                <span className={css({ display: "inline-flex" })} style={{ animation: "admin-spin 0.9s linear infinite" }}>
                  <Icon name="refresh" size={13} strokeWidth={2} />
                </span>
                {busyLabel}
                <style>{`@keyframes admin-spin { to { transform: rotate(360deg) } }`}</style>
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
