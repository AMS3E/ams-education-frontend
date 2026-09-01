"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { Icon } from "./icons";
import { logoutAction } from "@/lib/auth/actions";
import { fetchMyChip } from "@/lib/admin/screen-actions";

export interface AccountUser {
  name: string;
  initials: string;
  roleLabel: string;
}

/** What the chip fetches after paint: the picture and the live role label.
 *  `null` in either slot means "use the fallback" — initials, or the role the
 *  session cookie recorded at login. */
export interface ChipData {
  url: string | null;
  roleLabel: string | null;
}

/** Query key shared with ProfileForm, which pushes the new picture URL into
 *  the cache when it changes — that's what updates this chip without a reload. */
export const MY_CHIP_QUERY_KEY = ["my-chip"] as const;

/** Identity and sign-out, at the foot of the sidebar.
 *
 *  This lived in AdminTopBar until that bar was removed. The one real change is
 *  direction: the menu opens UPWARD, because the trigger now sits at the bottom
 *  of the rail and a downward menu would open off the end of the screen. */
export default function AccountMenu({ user }: { user: AccountUser }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The layout's session cookie carries no avatar and only the login-time role
  // (it's written once at login), so both are fetched client-side after paint.
  // staleTime Infinity: the chip mounts once per hard load, and the only thing
  // that changes the answer mid-session is the profile screen — which updates
  // this cache directly.
  const { data: chip } = useQuery<ChipData>({
    queryKey: MY_CHIP_QUERY_KEY,
    queryFn: () => fetchMyChip(),
    staleTime: Infinity,
  });

  // Close on an outside click or Escape. Both listeners are subscriptions, so
  // nothing here sets state synchronously inside the effect body.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={css({ position: "relative" })}>
      <button
        type='button'
        onClick={() => setOpen(v => !v)}
        aria-haspopup='menu'
        aria-expanded={open}
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "9px",
          width: "100%",
          padding: "7px 8px",
          borderRadius: "9px",
          cursor: "pointer",
          border: "1px solid transparent",
          background: "transparent",
          textAlign: "left",
          fontFamily: "inherit",
          transition: "background .12s, border-color .12s",
          _hover: { background: "var(--colors-admin-surface-hover)", borderColor: "var(--colors-admin-border)" },
          _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
        })}>
        {chip?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chip.url}
            alt=""
            className={css({ width: "30px", height: "30px", borderRadius: "9px", objectFit: "cover", flex: "none" })}
            style={{ background: ac.accentTint }}
          />
        ) : (
          <span
            className={css({ width: "30px", height: "30px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700, flex: "none" })}
            // An avatar is identity, not a link — it takes the tint without the
            // accent ink.
            style={{ background: ac.accentTint, color: ac.text }}>
            {user.initials}
          </span>
        )}
        <span className={css({ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.25, minWidth: 0, flex: 1 })}>
          <span className={css({ fontSize: "13px", fontWeight: 500, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
            {user.name}
          </span>
          <span className={css({ fontSize: "11px" })} style={{ color: ac.muted }}>
            {chip?.roleLabel ?? user.roleLabel}
          </span>
        </span>
        <Icon name='chevronDown' size={14} strokeWidth={2} style={{ color: ac.faint, flex: "none", transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open ? (
        <div
          role='menu'
          className={css({
            position: "absolute",
            // Upward, from the foot of the rail.
            bottom: "calc(100% + 8px)",
            left: 0,
            right: 0,
            padding: "6px",
            borderRadius: "12px",
            zIndex: 40,
          })}
          style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}>
          <Link
            href='/admin/profile'
            onClick={() => setOpen(false)}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "9px",
              padding: "9px 10px",
              borderRadius: "8px",
              fontSize: "13px",
              cursor: "pointer",
              _hover: { background: "var(--colors-admin-surface-hover)" },
            })}>
            <Icon name='users' size={15} strokeWidth={1.7} style={{ color: ac.muted }} />
            My profile
          </Link>
          <div style={{ height: 1, background: ac.border, margin: "5px 0" }} />
          <form action={logoutAction}>
            <button
              type='submit'
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "9px",
                width: "100%",
                textAlign: "left",
                padding: "9px 10px",
                borderRadius: "8px",
                fontSize: "13px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                fontFamily: "inherit",
                _hover: { background: "var(--colors-admin-danger-tint)", color: "var(--colors-admin-danger)" },
              })}
              style={{ color: ac.sub }}>
              <Icon name='logout' size={15} strokeWidth={1.7} />
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
