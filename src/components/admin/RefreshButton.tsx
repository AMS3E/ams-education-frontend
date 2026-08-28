"use client";

import { useEffect, useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { Icon } from "./icons";

/** "updated Xm ago" from the BFF's fetchedAt (when WordPress was actually
 *  asked — dataUpdatedAt alone would read "just now" on a warm server hit). */
function agoLabel(fetchedAt: number, now: number): string {
  const mins = Math.floor((now - fetchedAt) / 60_000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  return `updated ${Math.floor(mins / 60)}h ago`;
}

/** The per-page "Refresh · updated Xm ago" header button every converted
 *  admin screen shows — the user-facing escape hatch from the 30min caches
 *  (pair with useScreenRefresh in @/lib/admin/queries). */
export default function RefreshButton({
  fetchedAt,
  refreshing,
  onRefresh,
}: {
  /** When the shown data was pulled from WordPress; absent until loaded. */
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  // Minute tick so the label advances while the tab sits open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      title="Pull fresh data from WordPress"
      className={css({ display: "flex", alignItems: "center", gap: "7px", height: "36px", padding: "0 13px", borderRadius: "8px", fontSize: "12.5px", whiteSpace: "nowrap", transition: "border-color .12s", _hover: { borderColor: ac.borderStrong } })}
      style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: refreshing ? ac.faint : ac.muted, cursor: refreshing ? "default" : "pointer" }}
    >
      <span style={refreshing ? { display: "flex", animation: "admin-spin 0.9s linear infinite" } : { display: "flex" }}>
        <Icon name="refresh" size={13} strokeWidth={1.8} />
      </span>
      {refreshing ? "Refreshing…" : fetchedAt ? `Refresh · ${agoLabel(fetchedAt, now)}` : "Refresh"}
      <style>{`@keyframes admin-spin { to { transform: rotate(360deg) } }`}</style>
    </button>
  );
}
