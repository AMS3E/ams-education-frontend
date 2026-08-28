"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { css, cx } from "@/styled-system/css";
import { ac } from "./tokens";
import { ADMIN_FONT_STACK, adminFont } from "./font";
import { Icon } from "./icons";

export interface Option {
  label: string;
  value: string;
}

/** Where an open menu is drawn, in VIEWPORT coordinates — the menu is
 *  `position: fixed` inside a portal, so these are the final numbers. */
interface MenuBox {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
  maxWidth: number;
}

const GAP = 6; // menu ↔ trigger
const EDGE = 12; // menu ↔ viewport edge
const MIN_PANEL = 160; // below this, opening downwards isn't worth it
const MAX_PANEL = 420; // a menu the full height of the screen reads as a page

/**
 * Position the menu against the trigger's rect.
 *
 * Both axes are solved here rather than in CSS, because the menu can no longer
 * be laid out relative to the button: it renders in a portal (see below).
 * Vertically it flips above the trigger when there is more room there, and
 * always carries a max-height, so a 26-category / 30-author list scrolls inside
 * itself instead of running off the screen. Horizontally it anchors to
 * whichever edge lets it GROW inwards — left-anchored grows right,
 * right-anchored grows left — and `maxWidth` caps it at the far edge, so a long
 * Khmer label wraps rather than pushing the menu past the viewport.
 */
function place(r: DOMRect, align: "left" | "right", minWidth: number): MenuBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const below = vh - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  const up = below < MIN_PANEL && above > below;

  const roomRight = vw - r.left - EDGE;
  const roomLeft = r.right - EDGE;
  // Honour the requested side when it fits; otherwise take the side that does.
  const anchorRight = align === "right" ? roomLeft >= minWidth : roomRight < minWidth;

  return {
    ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
    ...(anchorRight ? { right: vw - r.right } : { left: r.left }),
    maxHeight: Math.min(MAX_PANEL, Math.max(MIN_PANEL, up ? above : below)),
    maxWidth: Math.max(minWidth, anchorRight ? roomLeft : roomRight),
  };
}

// A controlled filter/select dropdown. Open state is owned by the parent so that
// only one menu is open at a time across a toolbar. An invisible fixed backdrop
// closes the menu on any outside click — no document listener for that, so
// nothing runs in an effect (the repo's React-compiler lint forbids sync
// setState in effects).
//
// The MENU IS A PORTAL, not an absolutely-positioned child. Every screen puts
// its filters inside a `Surface`, which is `overflow: hidden`, so an in-flow
// menu was clipped at the panel's edge — the Category and Author lists lost
// their bottom half, and the right-most filter lost its right edge to the
// viewport. Nothing drawn OVER the page can be laid out INSIDE it.
export function Dropdown({
  label,
  hasValue = false,
  open,
  onToggle,
  onClose,
  options,
  selected,
  onSelect,
  minWidth = 180,
  align = "left",
  variant = "control",
  className,
}: {
  label: string;
  hasValue?: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  options: Option[];
  selected?: string;
  onSelect: (value: string) => void;
  minWidth?: number;
  align?: "left" | "right";
  /** How the TRIGGER draws. "control" is the boxed 36px select every filter
   *  toolbar uses. "link" is the bare accent-coloured value the article
   *  editor's summary rows use (Status reads "Draft", not a boxed select) —
   *  same menu, same portal, same keyboard behaviour, just no chrome, for
   *  putting a real chooser in a label-left / value-right row. */
  variant?: "control" | "link";
  /** Merged onto the trigger's wrapper. The article editor needs `minWidth: 0`
   *  on it so a long label ellipsises inside the 320px rail instead of widening
   *  the row — a flex item will not shrink below its content without it. */
  className?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<MenuBox | null>(null);

  // Measured on the click that opens it — an event handler, not an effect.
  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setBox(place(r, align, minWidth));
    onToggle();
  };

  // A fixed menu cannot follow the page, so anything that moves the trigger out
  // from under it closes it. Scrolling INSIDE the menu is exempt: that is the
  // whole point of the capped height.
  useEffect(() => {
    if (!open) return;
    const bail = (e: Event) => {
      if (e.type === "scroll" && menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("scroll", bail, true);
    window.addEventListener("resize", bail);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", bail, true);
      window.removeEventListener("resize", bail);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const menu =
    open && box ? (
      <>
        {/* Above the modals a Dropdown can appear inside (100 / 120 / 1000) and
            above Gutenberg's own popovers (1000001); below the media dialog and
            the editor's toast, which must never be covered. */}
        <div onClick={onClose} className={css({ position: "fixed", inset: 0, zIndex: 1000010 })} />
        <div
          ref={menuRef}
          role="listbox"
          aria-label={label}
          // THE MENU IS A PORTAL INTO <body>, so it renders OUTSIDE the admin
          // shell — and the shell is where `--font-admin` is declared
          // (adminFont.variable sits on that one div). Every menu was therefore
          // resolving `var(--font-admin)` to nothing and falling through to
          // `var(--font-battambang)`, which IS in scope because the root layout
          // puts it on <html>: the option list was being set in a Khmer display
          // face. Re-declaring the variable here and naming the stack puts the
          // menu back on Plus Jakarta Sans — without losing the per-glyph Khmer
          // fallback that article titles in these menus depend on.
          className={cx(adminFont.variable, css({ position: "fixed", zIndex: 1000011, padding: "6px", borderRadius: "10px", overflowY: "auto", overscrollBehavior: "contain" }))}
          style={{
            fontFamily: ADMIN_FONT_STACK,
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            maxHeight: box.maxHeight,
            maxWidth: box.maxWidth,
            // min-width beats max-width in CSS, so it is clamped here instead
            // of letting a narrow viewport hand back a menu that overflows.
            minWidth: Math.min(minWidth, box.maxWidth),
            background: ac.surface,
            border: `1px solid ${ac.border}`,
            boxShadow: ac.shadowMd,
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={selected === o.value}
              onClick={() => {
                onSelect(o.value);
                onClose();
              }}
              className={css({ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: "7px", cursor: "pointer", fontSize: "13px", lineHeight: 1.5, border: "none", background: "transparent", fontFamily: "inherit", _hover: { background: ac.surfaceHover }, _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "-2px" } })}
              style={{ color: selected === o.value ? ac.text : ac.sub }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </>
    ) : null;

  return (
    <div className={cx(css({ position: "relative" }), className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          variant === "link"
            ? css({ fontSize: "12.5px", fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", padding: "2px 0", display: "flex", alignItems: "center", gap: "4px", maxWidth: "100%", _hover: { textDecoration: "underline" } })
            : css({
          height: "36px",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          borderRadius: "8px",
          fontSize: "13px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "border-color .12s, background .12s",
          _hover: { borderColor: ac.borderStrong },
        })
        }
        style={
          variant === "link"
            ? { color: hasValue ? ac.accentText : ac.muted }
            : { background: ac.surface, border: `1px solid ${ac.border}`, color: hasValue ? ac.text : ac.muted }
        }
      >
        {/* The label truncates rather than widening the row: template names run
            to ~30 characters and the editor rail is 320px. */}
        <span className={variant === "link" ? css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) : undefined}>
          {label}
        </span>
        <Icon name="chevronDown" size={12} style={{ color: ac.muted, flex: "none" }} />
      </button>

      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

// A search input with a leading magnifier. Two modes, because the screens want
// different things: pass `name`/`defaultValue` to let a wrapping <form> drive it
// (uncontrolled) — how Articles, Users and Media push the query into the URL on
// submit — or pass `value`/`onValueChange` for the screens that filter a
// list already in memory and so have nothing to submit (Programs, Menus).
export function SearchInput({
  placeholder,
  width,
  name,
  defaultValue,
  value,
  onValueChange,
}: {
  placeholder: string;
  width?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  return (
    <div className={css({ position: "relative", flex: 1 })} style={{ maxWidth: width }}>
      <Icon name="search" size={15} style={{ position: "absolute", left: 12, top: 10, color: ac.faint }} />
      <input
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onValueChange ? (e) => onValueChange(e.target.value) : undefined}
        placeholder={placeholder}
        type="search"
        className={css({
          width: "100%",
          height: "36px",
          padding: "0 12px 0 36px",
          borderRadius: "8px",
          fontSize: "13.5px",
          _placeholder: { color: "var(--colors-admin-faint)" },
          _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
        })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text }}
      />
    </div>
  );
}

// The single red primary button — new article, upload, add user, etc. Pass
// `href` to render it as a navigation link (e.g. into a create flow).
export function PrimaryButton({ label, icon = "plus" as const, href }: { label: string; icon?: "plus" | "upload"; href?: string }) {
  const cls = css({ height: "36px", padding: "0 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", border: "none", color: "var(--colors-admin-accent-fg)", transition: "background .12s, box-shadow .12s", boxShadow: ac.shadowSm, _hover: { background: ac.accentHover } });
  const inner = (
    <>
      <Icon name={icon} size={13} strokeWidth={2} />
      {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} style={{ background: ac.accent }}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} style={{ background: ac.accent }}>
      {inner}
    </button>
  );
}
