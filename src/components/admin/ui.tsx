"use client";

import type { CSSProperties, ReactNode } from "react";
import { css, cx } from "@/styled-system/css";
import { ac, statusColors, type Status } from "./tokens";
import { Icon, type IconName } from "./icons";

// Shared admin primitives — the layer every screen inherits, so a change here
// is a change everywhere. That is the point: the restyle replaces THESE, not
// twelve screens one at a time.
//
// The visual language is Aurora's frame with Phoenix's content: generous radii,
// soft elevation and airy card anatomy from the former; dense, businesslike
// tables and controls from the latter. This tool is mostly lists and forms, so
// the working surfaces need to be tight while the shell stays calm.
//
// Structure comes from static `css()`; anything runtime-varying is applied
// inline, because Panda only extracts static css() objects. Since the tokens
// are now CSS variables, inline is no longer a barrier to theming.

/* ========================================================================== *
 * Focus — one ring, everywhere. Offset by 2px so it stays visible even on an
 * accent-filled button, where ring and fill are the same hue.
 * ========================================================================== */

const focusRing = css({
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
});

/* ========================================================================== *
 * Surfaces
 * ========================================================================== */

// FLAT. No radius, no border, no shadow — a surface is a plain block of colour
// that runs to the edges of whatever contains it.
//
// It used to be a 14px rounded card with a hairline and a shadow. The whole
// admin has moved to the panel composition the dashboard uses: panels butt
// straight against each other and against the viewport, and the divisions are
// drawn INSIDE them as rules (see `Cell`). A card border in that layout doubles
// up against its neighbour's, and a radius leaves gaps at every junction. The
// separation you can still see comes from `canvas` vs `surface`, which sit 1.07
// apart on purpose.
const surfaceBase = css({
  background: "var(--colors-admin-surface)",
  overflow: "hidden",
});

// Lift is gone with the shadow — there is nothing left to lift. A hoverable
// surface now just warms its background, which is the only affordance that
// still makes sense on a flat block.
const surfaceHoverable = css({
  transition: "background .14s ease",
  _hover: { background: "var(--colors-admin-surface-hover)" },
});

/** The workhorse container. `hover` adds lift — TRUE for cards you click,
 *  FALSE for cards you work inside (a form lifting under your cursor is
 *  jittery). */
export function Surface({
  children,
  className,
  style,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
}) {
  return (
    <div className={cx(surfaceBase, hover ? surfaceHoverable : undefined, className)} style={style}>
      {children}
    </div>
  );
}

/** Aliases kept so screens still compile while the roll-out proceeds. New code
 *  should use Surface. */
export const BentoCard = Surface;
export const Card = Surface;

/** Card header: title, optional subtitle, optional right-hand actions. The
 *  subtitle is Aurora's move and earns its space — it says what the list or
 *  number actually measures, which a bare title never does. */
export function CardHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        css({ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", padding: "18px 20px 14px" }),
        className,
      )}
    >
      <div className={css({ minWidth: 0 })}>
        <div className={css({ fontSize: "14px", fontWeight: 600, letterSpacing: "-0.01em" })}>{title}</div>
        {sub ? (
          <div className={css({ fontSize: "12.5px", marginTop: "3px" })} style={{ color: ac.muted }}>
            {sub}
          </div>
        ) : null}
      </div>
      {actions ? <div className={css({ display: "flex", alignItems: "center", gap: "8px", flex: "none" })}>{actions}</div> : null}
    </div>
  );
}

/** Page heading used at the top of each screen. */
export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h1 className={css({ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" })}>{title}</h1>
      {sub ? (
        <p className={css({ fontSize: "13px", marginTop: "4px" })} style={{ color: ac.muted }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export interface Crumb {
  label: string;
  /** Omit on the last entry — the page you are on is not a link to itself. */
  href?: string;
}

/** Breadcrumb — the cheapest orientation cue on a screen reached from a grouped
 *  sidebar, which is why Phoenix leads every working page with one. The trail
 *  mirrors the sidebar's groups (Overview / Content / Site), so the first crumb
 *  is a heading rather than a destination and carries no href. */
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={css({ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", marginBottom: "10px", flexWrap: "wrap" })}
    >
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${c.label}-${i}`} className={css({ display: "inline-flex", alignItems: "center", gap: "7px" })}>
            {i > 0 ? <Icon name="chevronRight" size={12} strokeWidth={2} style={{ color: ac.faint }} /> : null}
            {c.href && !last ? (
              <a href={c.href} className={css({ _hover: { textDecoration: "underline" } })} style={{ color: ac.muted }}>
                {c.label}
              </a>
            ) : (
              <span style={{ color: last ? ac.text : ac.muted }}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** The top of a screen: trail, title + subtitle, right-hand actions. One
 *  definition so the vertical rhythm cannot drift between screens. */
export function PageHeader({
  trail,
  title,
  sub,
  actions,
}: {
  trail?: Crumb[];
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  // This is the panel's top cell, not a bare fragment. With page padding gone,
  // the header owns its own gutter and closes with a rule — which is what makes
  // every screen open the same way the dashboard does, without each one
  // re-deriving the spacing.
  return (
    <div className={cx(panelClass, css({ padding: "20px 22px" }))} style={{ borderBottom: `1px solid ${ac.border}` }}>
      {trail?.length ? <Breadcrumb trail={trail} /> : null}
      <div className={css({ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" })}>
        <PageTitle title={title} sub={sub} />
        {actions ? (
          <div className={css({ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" })}>{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Diagonal-stripe placeholder standing in for real media. */
export function SkelTile({
  radius = "8px",
  className,
  style,
  children,
}: {
  radius?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={className}
      style={{
        background: ac.skeleton,
        borderRadius: radius,
        border: `1px solid ${ac.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ========================================================================== *
 * Buttons
 * ========================================================================== */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const buttonBase = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  borderRadius: "9px",
  fontWeight: 500,
  whiteSpace: "nowrap",
  cursor: "pointer",
  border: "1px solid transparent",
  transition: "background .13s ease, border-color .13s ease, color .13s ease, opacity .13s",
  _disabled: { opacity: 0.5, cursor: "not-allowed" },
});

const SIZES: Record<ButtonSize, string> = {
  sm: css({ height: "30px", padding: "0 11px", fontSize: "12.5px" }),
  md: css({ height: "36px", padding: "0 14px", fontSize: "13px" }),
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: css({
    background: "var(--colors-admin-accent)",
    color: "var(--colors-admin-accent-fg)",
    _hover: { background: "var(--colors-admin-accent-hover)" },
  }),
  secondary: css({
    background: "var(--colors-admin-surface)",
    color: "var(--colors-admin-text)",
    borderColor: "var(--colors-admin-border)",
    _hover: { background: "var(--colors-admin-surface-hover)", borderColor: "var(--colors-admin-border-strong)" },
  }),
  ghost: css({
    background: "transparent",
    color: "var(--colors-admin-sub)",
    _hover: { background: "var(--colors-admin-surface-hover)", color: "var(--colors-admin-text)" },
  }),
  danger: css({
    background: "var(--colors-admin-danger-fill)",
    color: "#FFFFFF",
    _hover: { filter: "brightness(1.1)" },
  }),
};

/** The button's classes without the <button>. For things that must be a real
 *  link — next/link, an <a download> — so navigation keeps working (middle
 *  click, open in new tab) while looking identical. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string): string {
  return cx(buttonBase, SIZES[size], VARIANTS[variant], focusRing, extra);
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  className,
  ...rest
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx(buttonBase, SIZES[size], VARIANTS[variant], focusRing, className)} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 13 : 14} strokeWidth={2} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 13 : 14} strokeWidth={2} /> : null}
    </button>
  );
}

/** Square icon-only button — row actions, card overflow menus. */
export function IconButton({
  name,
  label,
  size = "md",
  variant = "ghost",
  className,
  ...rest
}: {
  name: IconName;
  /** Required: an icon with no text needs an accessible name. */
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const px = size === "sm" ? "30px" : "36px";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(buttonBase, VARIANTS[variant], focusRing, css({ padding: 0, flex: "none" }), className)}
      style={{ width: px, height: px }}
      {...rest}
    >
      <Icon name={name} size={size === "sm" ? 15 : 16} strokeWidth={1.9} />
    </button>
  );
}

/* ========================================================================== *
 * Form controls
 * ========================================================================== */

/** Controls are identified by their FILL against the canvas rather than a heavy
 *  border — which is what lets the border stay a hairline without failing the
 *  "can you tell this is a control" test. The focus ring does the rest. */
const controlBase = css({
  width: "100%",
  height: "36px",
  padding: "0 12px",
  borderRadius: "9px",
  fontSize: "13px",
  fontFamily: "inherit",
  color: "var(--colors-admin-text)",
  background: "var(--colors-admin-surface-sunken)",
  border: "1px solid var(--colors-admin-border)",
  transition: "border-color .13s ease, background .13s ease",
  _hover: { borderColor: "var(--colors-admin-border-strong)" },
  _placeholder: { color: "var(--colors-admin-faint)" },
  _disabled: { opacity: 0.55, cursor: "not-allowed" },
});

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlBase, focusRing, className)} {...rest} />;
}

export function Textarea({ className, rows = 4, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cx(controlBase, focusRing, css({ height: "auto", padding: "10px 12px", lineHeight: 1.6, resize: "vertical" }), className)}
      {...rest}
    />
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx(css({ display: "block" }), className)}>
      <div className={css({ fontSize: "12.5px", fontWeight: 500, marginBottom: "6px" })} style={{ color: ac.sub }}>
        {label}
      </div>
      {children}
      {hint ? (
        <div className={css({ fontSize: "11.5px", marginTop: "5px" })} style={{ color: ac.muted }}>
          {hint}
        </div>
      ) : null}
    </label>
  );
}

/** A form section: titled band, hairline, padded body. This is the Settings
 *  anatomy, extracted — it was copied by hand into Settings, Profile and the
 *  program forms, which is three chances for the padding to drift. */
export function FormCard({
  title,
  sub,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Surface className={className} style={{ overflow: "hidden" }}>
      <CardHeader
        title={title}
        sub={sub}
        actions={actions}
        className={css({ borderBottom: "1px solid var(--colors-admin-border)", padding: "14px 20px" })}
      />
      <div className={cx(css({ padding: "20px" }), bodyClassName)}>{children}</div>
    </Surface>
  );
}

/** Fields side by side. Collapses to one column on narrow viewports, because two
 *  inputs sharing 520px is where labels start wrapping. Static classes rather
 *  than an inline grid-template: an inline value would beat the media query. */
const FORM_GRID: Record<2 | 3, string> = {
  2: css({ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", "@media (max-width: 560px)": { gridTemplateColumns: "1fr" } }),
  3: css({ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", "@media (max-width: 760px)": { gridTemplateColumns: "1fr" } }),
};

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={FORM_GRID[cols]}>{children}</div>;
}

export interface SaveMessage {
  kind: "ok" | "err";
  text: string;
}

/** The commit row under a form: one primary action and the result of the last
 *  attempt, in place. The message is `role="status"` so a save that succeeds
 *  without moving anything on screen is still announced. */
export function SaveBar({
  busy,
  onSave,
  message,
  label = "Save changes",
  busyLabel = "Saving…",
  children,
}: {
  busy: boolean;
  onSave: () => void;
  message?: SaveMessage | null;
  label?: string;
  busyLabel?: string;
  /** Extra controls that belong beside the primary action (e.g. Cancel). */
  children?: ReactNode;
}) {
  return (
    <div className={css({ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" })}>
      <Button variant="primary" disabled={busy} onClick={onSave}>
        {busy ? busyLabel : label}
      </Button>
      {children}
      {message ? (
        <span role="status" className={css({ fontSize: "12.5px" })} style={{ color: message.kind === "err" ? ac.danger : ac.good }}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

/** A real checkbox, restyled — not a div pretending to be one. Keyboard,
 *  indeterminate and form semantics come free that way. */
export function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  /** A box the user must not tick right now — WordPress refusing sticky while a
   *  password is set, say. Greyed and inert, but still announced, so the reason
   *  beside it has something to refer to. */
  disabled?: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — visually hidden in table headers and rows. */
  label: string;
  className?: string;
}) {
  const marked = checked || indeterminate;
  return (
    <span className={cx(css({ display: "inline-flex", alignItems: "center", position: "relative", flex: "none" }), className)}>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked;
        }}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className={cx(
          focusRing,
          css({
            appearance: "none",
            width: "16px",
            height: "16px",
            borderRadius: "5px",
            cursor: "pointer",
            margin: 0,
            border: "1px solid var(--colors-admin-border-strong)",
            background: "var(--colors-admin-surface)",
            transition: "background .12s, border-color .12s",
            _checked: { background: "var(--colors-admin-accent)", borderColor: "var(--colors-admin-accent)" },
            _indeterminate: { background: "var(--colors-admin-accent)", borderColor: "var(--colors-admin-accent)" },
            _disabled: { opacity: 0.45, cursor: "not-allowed" },
          }),
        )}
      />
      {marked ? (
        <span
          className={css({ position: "absolute", left: 0, top: 0, width: "16px", height: "16px", display: "grid", placeItems: "center", pointerEvents: "none" })}
        >
          <Icon name={indeterminate && !checked ? "minus" : "check"} size={11} strokeWidth={3} style={{ color: ac.accentFg }} />
        </span>
      ) : null}
    </span>
  );
}

/** Segmented control — the established pattern, re-tokenised. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
  stretch = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: ButtonSize;
  ariaLabel: string;
  /** Fill the container and split evenly, instead of sizing to the labels.
   *  For the sidebar foot, where the control should span the rail. */
  stretch?: boolean;
}) {
  const h = size === "sm" ? "26px" : "30px";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        css({ padding: "3px", borderRadius: "10px", gap: "2px" }),
        stretch ? css({ display: "flex", width: "100%" }) : css({ display: "inline-flex", flex: "none" }),
      )}
      style={{ background: ac.surfaceSunken }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              focusRing,
              css({ padding: "0 11px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 500, cursor: "pointer", border: "none", transition: "background .12s, color .12s" }),
              stretch ? css({ flex: "1", minWidth: 0 }) : undefined,
            )}
            style={
              active
                ? { height: h, background: ac.surface, color: ac.text, boxShadow: ac.shadowSm }
                : { height: h, background: "transparent", color: ac.muted }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ========================================================================== *
 * Data display
 * ========================================================================== */

/** A status chip. Colour carries meaning, never decoration. */
export function StatusPill({ status }: { status: Status }) {
  const c = statusColors(status);
  return (
    <span
      className={css({ fontSize: "11px", fontWeight: 500, padding: "3px 9px", borderRadius: "99px", whiteSpace: "nowrap", flex: "none" })}
      style={{ color: c.fg, background: c.bg }}
    >
      {status}
    </span>
  );
}

export type BadgeTone = "neutral" | "good" | "warn" | "danger" | "data";

const BADGE_TONES: Record<BadgeTone, { fg: string; bg: string }> = {
  neutral: { fg: ac.sub, bg: ac.neutralTint },
  good: { fg: ac.good, bg: ac.goodTint },
  warn: { fg: ac.warn, bg: ac.warnTint },
  danger: { fg: ac.danger, bg: ac.dangerTint },
  data: { fg: ac.data, bg: ac.dataSoft },
};

export function Badge({ children, tone = "neutral", icon }: { children: ReactNode; tone?: BadgeTone; icon?: IconName }) {
  const c = BADGE_TONES[tone];
  return (
    <span
      className={css({ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 500, padding: "3px 8px", borderRadius: "6px", whiteSpace: "nowrap", flex: "none" })}
      style={{ color: c.fg, background: c.bg }}
    >
      {icon ? <Icon name={icon} size={11} strokeWidth={2.2} /> : null}
      {children}
    </span>
  );
}

/* ========================================================================== *
 * Panels — the admin's layout unit
 * ========================================================================== */

/** One surface, edge to edge, divided by rules rather than gutters.
 *
 *  This is the composition the whole tool uses: no page padding, no gaps
 *  between panels, no radius. Breathing room lives INSIDE, in each `Cell`.
 *  Originally private to DashboardScreen; promoted here so there is one
 *  implementation and changing gutters is a one-line change again. */
export const panelClass = css({ background: "var(--colors-admin-surface)", overflow: "hidden", minWidth: 0 });

export function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx(panelClass, className)} style={style}>
      {children}
    </div>
  );
}

/** A cell inside a `Panel`.
 *
 *  `right`/`bottom` draw the dividing rules, and you set them only where a
 *  neighbour actually sits — that is what stops a panel drawing a rule against
 *  its own outer edge, which is the thing that makes a gutterless grid look
 *  like a mistake rather than a decision.
 *
 *  `padded={false}` for cells that hold something which owns its own padding —
 *  a `Table`, a chart, a scrolling list. */
export function Cell({
  children,
  right = false,
  bottom = false,
  span,
  className,
  style,
  padded = true,
}: {
  children: ReactNode;
  right?: boolean;
  bottom?: boolean;
  span?: string;
  className?: string;
  style?: CSSProperties;
  padded?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        gridColumn: span,
        padding: padded ? "20px 22px" : undefined,
        borderRight: right ? `1px solid ${ac.border}` : undefined,
        borderBottom: bottom ? `1px solid ${ac.border}` : undefined,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Table shell. Hairline row rules; the header is unfilled and marked out by
 *  the rule beneath it. Sits in a `Cell` with `padded={false}`. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx(css({ width: "100%", overflowX: "auto" }), className)}>
      <table className={css({ width: "100%", borderCollapse: "collapse", fontSize: "13px" })}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  width,
  align = "left",
  className,
}: {
  children?: ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={cx(
        css({ fontSize: "11px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", padding: "12px 22px", whiteSpace: "nowrap" }),
        className,
      )}
      // NO FILL. The header used to be a recessed grey band with `muted` labels
      // on it — grey ink on a grey ground, which is why it was hard to read at
      // 11px. It now sits on the same surface as the rows, marked out by the
      // rule beneath it and by `sub` ink, which is a step darker than `muted`
      // and clears 7.7:1 instead of 5.3:1.
      style={{ width, textAlign: align, color: ac.sub, borderBottom: `1px solid ${ac.border}` }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  style,
  colSpan,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  style?: CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      // 22px horizontal to match `Th` and the panel's own gutter — with the page
      // padding gone, a 14px cell would leave the first column almost touching
      // the sidebar.
      className={cx(css({ padding: "12px 22px", verticalAlign: "middle" }), className)}
      style={{ textAlign: align, borderTop: `1px solid ${ac.rowLine}`, ...style }}
    >
      {children}
    </td>
  );
}

const rowHover = css({
  transition: "background .1s",
  _hover: { background: "var(--colors-admin-surface-hover)" },
});

export function Tr({ children, selected = false, className }: { children: ReactNode; selected?: boolean; className?: string }) {
  return (
    <tr className={cx(rowHover, className)} style={selected ? { background: ac.accentTint } : undefined}>
      {children}
    </tr>
  );
}

/** Empty state — says what is missing and what to do, never just "No data". */
export function EmptyState({
  icon = "list",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={css({ padding: "52px 24px", textAlign: "center" })}>
      <Icon name={icon} size={26} strokeWidth={1.4} style={{ color: ac.faint }} />
      <div className={css({ fontSize: "14px", fontWeight: 600, marginTop: "12px" })}>{title}</div>
      {body ? (
        <div className={css({ fontSize: "13px", marginTop: "6px", maxWidth: "380px", marginInline: "auto", lineHeight: 1.6 })} style={{ color: ac.muted }}>
          {body}
        </div>
      ) : null}
      {action ? <div className={css({ marginTop: "16px" })}>{action}</div> : null}
    </div>
  );
}

/** The band under a table: count on the left, pager on the right. */
export function TableFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 22px", fontSize: "12.5px", flexWrap: "wrap" })}
      // Unfilled for the same reason as `Th` — the rule carries the boundary.
      style={{ borderTop: `1px solid ${ac.border}`, color: ac.muted }}
    >
      {children}
    </div>
  );
}
