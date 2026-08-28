"use client";

// Chart primitives for the admin dashboard — hand-drawn SVG, no chart library.
//
// The rules these follow are the dataviz skill's, and two of them decided the
// shape of this file:
//
//   NO DUAL AXIS. Pageviews (thousands) and stories published (single digits)
//   are different scales, so they are TWO stacked plots sharing one x-axis —
//   never one plot with two y-scales, which invents a correlation the data does
//   not contain. They read as one panel because they share the x labels and the
//   crosshair, not because they share a y.
//
//   ONE SERIES PER PLOT MEANS NO LEGEND. Each plot's heading names what is
//   plotted, so a legend box with a single swatch would only restate it.
//
// Everything else is the standard kit: 2px lines, ~10% area wash, bars capped
// at 24px with a 4px rounded data-end and a 2px surface gap, hairline solid
// gridlines one step off the surface, axis text in ink tokens (never the data
// colour), values direct-labelled only at the endpoint, and a crosshair that
// snaps to the nearest day for both pointer and keyboard.

import { useEffect, useId, useRef, useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import type { DashPoint } from "@/lib/admin/dashboard";

// Gridlines sit one step off the surface and the baseline one step darker —
// both recessive, both solid hairlines (never dashed: dashing reads as
// "projection" when it is only a grid).
const GRID = ac.rowLine;
const AXIS = ac.border;

/** Round a maximum up to a clean 1/2/5×10^n, so the axis reads 0 / 2,000 and
 *  never 0 / 1,873. Guards the empty case, which would divide by zero. */
export function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** A bar with its data-end rounded and its baseline square — never a pill.
 *  `up` draws a column growing from the bottom; otherwise a bar growing right. */
export function barPath(x: number, y: number, w: number, h: number, up = true): string {
  if (w <= 0 || h <= 0) return "";
  if (up) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h} Z`;
  }
  const r = Math.min(4, h / 2, w);
  return `M${x},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x} Z`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** "2026-08-05" -> "5 Aug". Parsed by parts, never `new Date(string)`, whose
 *  bare-date branch is UTC and would shift the label a day in Phnom Penh. */
export function dayLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
}

/** Width of the element, measured. setState fires from the observer callback (a
 *  subscription) rather than synchronously in the effect body, so it does not
 *  trip the repo's set-state-in-effect rule — same shape as ScaledAdFrame. */
function useWidth<T extends HTMLElement>(ref: React.RefObject<T | null>, initial = 640): number {
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/* -------------------------------------------------------------------------- *
 * The trend panel — a smooth pageviews area over a publishing strip, one
 * x-axis, one crosshair.
 *
 * WHY THESE ENCODINGS: both are contiguous, so they fit ANY panel width by
 * construction. Daily bars could not — give them room and they gap into
 * pickets, squeeze them at 90 days and they become slivers (that was v1 of
 * this chart). The strip is one cell per day, cells butting edge-to-edge,
 * intensity = stories published — a day with nothing published is a faint
 * cell, never a hole.
 * -------------------------------------------------------------------------- */

const PAD_L = 46;
const PAD_R = 10;
// The default anatomy. A caller-supplied height scales the plot, the gap and
// the strip PROPORTIONALLY (156:20:24 stays 156:20:24); the axis row is
// fixed — its labels are type, not chart, and must not grow with the plots.
const H_VIEWS = 156;
const H_POSTS = 24; // the publishing strip
const GAP = 20;
const H_AXIS = 20;
const TOTAL_H = H_VIEWS + GAP + H_POSTS + H_AXIS;

/** Monotone cubic curve (Fritsch–Carlson, the d3 curveMonotoneX scheme)
 *  through the points, as an SVG path. Monotone on purpose: it smooths the
 *  RENDERING, never the data — a Catmull-Rom spline can overshoot and invent
 *  peaks that never happened, which on an analytics chart is a lie. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  // Tangent at each point: 0 across a local extremum, weighted harmonic mean
  // of the neighbour slopes elsewhere — the guarantee against overshoot.
  const tan: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tan.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tan.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  tan.push(slope[n - 2]);

  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (tan[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (tan[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

export function TrendPanel({
  series,
  hasViews,
  height = TOTAL_H,
}: {
  series: DashPoint[];
  hasViews: boolean;
  /** Overall SVG height, default 220. Floored at 120 — below that the strip
   *  collapses into the axis labels. */
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const gradId = `${clipId}-grad`;

  const n = series.length;
  const plotW = Math.max(80, width - PAD_L - PAD_R);
  const band = n > 0 ? plotW / n : 0;

  const totalH = Math.max(120, height);
  const scale = (totalH - H_AXIS) / (H_VIEWS + GAP + H_POSTS);
  const hViews = H_VIEWS * scale;
  const hPosts = H_POSTS * scale;

  const maxViews = niceMax(Math.max(...series.map(p => p.views), 0));
  // RAW max, not niceMax: this is the intensity ceiling of the strip, so the
  // busiest real day should hit full strength rather than a rounded-up 10.
  const maxPosts = Math.max(...series.map(p => p.posts), 1);

  // Band centre — the curve's x, and the cell's centre.
  const cx = (i: number) => PAD_L + band * (i + 0.5);
  const yViews = (v: number) => hViews - (v / maxViews) * (hViews - 8);
  const postsTop = hViews + GAP * scale;

  const linePath = monotonePath(series.map((p, i) => ({ x: cx(i), y: yViews(p.views) })));
  const areaPath = n > 0 ? `${linePath} L${cx(n - 1).toFixed(2)},${hViews} L${cx(0).toFixed(2)},${hViews} Z` : "";

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - PAD_L) / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const at = hover ?? n - 1;
    setHover(Math.max(0, Math.min(n - 1, at + (e.key === "ArrowRight" ? 1 : -1))));
  };

  // ~5 evenly spaced date labels, always including the last day.
  const tickEvery = Math.max(1, Math.round(n / 5));
  const last = n - 1;

  return (
    <div ref={wrapRef} className={css({ position: "relative", width: "100%" })}>
      <svg
        width='100%'
        height={totalH}
        viewBox={`0 0 ${Math.max(width, 1)} ${totalH}`}
        role='img'
        tabIndex={0}
        aria-label={`Daily pageviews and stories published over the last ${n} days`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
        className={css({
          display: "block",
          outline: "none",
          _focusVisible: { outline: `2px solid ${ac.data}`, outlineOffset: "2px", borderRadius: "6px" },
        })}>
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD_L} y={0} width={plotW} height={totalH} />
          </clipPath>
          {/* Strong at the curve, gone at the baseline — the fade is what lets
              the fill take the whole plot without weighing it down.
              Lighter than it was (0.26): `data` is now a deeper, less green teal,
              and at the old opacity the wash gained weight the line should be
              carrying. The point of the fill is to say "area under this curve",
              not to be the loudest thing on the panel. */}
          <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor={ac.data} stopOpacity={0.18} />
            <stop offset='1' stopColor={ac.data} stopOpacity={0.015} />
          </linearGradient>
        </defs>

        {/* --- views plot: gridlines, then the wash, then the line --- */}
        {[0, 0.5, 1].map(f => (
          <line
            key={f}
            x1={PAD_L}
            x2={PAD_L + plotW}
            y1={yViews(maxViews * f)}
            y2={yViews(maxViews * f)}
            stroke={f === 0 ? AXIS : GRID}
            strokeWidth={1}
          />
        ))}
        {[maxViews, maxViews / 2].map(v => (
          <text
            key={v}
            x={PAD_L - 8}
            y={yViews(v) + 3.5}
            textAnchor='end'
            fontSize={10.5}
            fill={ac.muted}
            className={css({ fontVariantNumeric: "tabular-nums" })}>
            {fmt(Math.round(v))}
          </text>
        ))}

        {hasViews && n > 0 ? (
          <g clipPath={`url(#${clipId})`}>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill='none' stroke={ac.data} strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' />
            {/* The endpoint is the one direct label — a value on every day would
                go unread. 2px surface ring keeps the dot legible on the line. */}
            <circle cx={cx(last)} cy={yViews(series[last].views)} r={4} fill={ac.data} stroke={ac.surface} strokeWidth={2} />
          </g>
        ) : null}

        {/* --- the publishing strip: one cell per day, intensity = count --- */}
        <text x={PAD_L - 8} y={postsTop + hPosts / 2 + 3.5} textAnchor='end' fontSize={10.5} fill={ac.muted}>
          {fmt(maxPosts)}
        </text>
        <g clipPath={`url(#${clipId})`}>
          {series.map((p, i) => (
            <rect
              key={p.d}
              x={PAD_L + band * i + 0.5}
              y={postsTop}
              width={Math.max(0.5, band - 1)}
              height={hPosts}
              rx={2}
              fill={p.posts > 0 ? ac.data : GRID}
              fillOpacity={p.posts > 0 ? 0.25 + 0.65 * (p.posts / maxPosts) : 1}
              stroke={hover === i ? ac.data : "none"}
              strokeWidth={hover === i ? 1.5 : 0}
            />
          ))}
        </g>

        {/* --- shared x labels --- */}
        {series.map((p, i) =>
          i % tickEvery === 0 || i === last ? (
            <text key={p.d} x={cx(i)} y={totalH - 4} textAnchor='middle' fontSize={10.5} fill={ac.muted}>
              {dayLabel(p.d)}
            </text>
          ) : null,
        )}

        {/* --- the crosshair spans BOTH plots: one pointer, one day --- */}
        {hover !== null && series[hover] ? (
          <line x1={cx(hover)} x2={cx(hover)} y1={0} y2={postsTop + hPosts} stroke={ac.borderStrong} strokeWidth={1} />
        ) : null}
      </svg>

      {hover !== null && series[hover] ? <Tooltip x={cx(hover)} width={width} point={series[hover]} hasViews={hasViews} /> : null}
    </div>
  );
}

/** Value leads, label follows — the reader already knows the series and wants
 *  the number. Line keys rather than filled boxes at this density. */
function Tooltip({ x, width, point, hasViews }: { x: number; width: number; point: DashPoint; hasViews: boolean }) {
  const flip = x > width - 140;
  return (
    <div
      className={css({
        position: "absolute",
        top: "4px",
        pointerEvents: "none",
        borderRadius: "8px",
        padding: "8px 10px",
        fontSize: "12px",
        minWidth: "128px",
        zIndex: 2,
      })}
      style={{
        left: flip ? undefined : `${x + 10}px`,
        right: flip ? `${width - x + 10}px` : undefined,
        background: ac.surface,
        border: `1px solid ${ac.border}`,
        boxShadow: ac.shadowMd,
      }}>
      <div className={css({ fontSize: "11.5px", marginBottom: "5px" })} style={{ color: ac.muted }}>
        {dayLabel(point.d)}
      </div>
      {hasViews ? <TooltipRow value={point.views} label='pageviews' /> : null}
      <TooltipRow value={point.posts} label={point.posts === 1 ? "story" : "stories"} />
    </div>
  );
}

function TooltipRow({ value, label }: { value: number; label: string }) {
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "6px", lineHeight: 1.7 })}>
      <span
        className={css({ width: "10px", height: "2px", borderRadius: "1px", flex: "none" })}
        style={{ background: ac.data }}
      />
      <span className={css({ fontWeight: 600, fontVariantNumeric: "tabular-nums" })}>{fmt(value)}</span>
      <span style={{ color: ac.muted }}>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Sparkline — the shape inside a KPI cell.
 *
 * It repeats the series the big chart plots below it, which the dataviz rules
 * would normally call redundant. It is here because the owner asked for the
 * reference dashboards' KPI anatomy specifically, and it does earn its place at
 * this size: the tile answers "which way, how steadily" at a glance, the panel
 * answers "on which days". Kept deliberately bare — no axis, no labels, no
 * tooltip — so it reads as a shape and never competes with the real chart.
 * -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  width = 118,
  height = 38,
  kind = "line",
}: {
  values: number[];
  width?: number;
  height?: number;
  kind?: "line" | "bars";
}) {
  const n = values.length;
  if (n === 0) return null;
  const max = Math.max(...values, 1);
  const pad = 3;
  const h = height - pad * 2;

  if (kind === "bars") {
    const band = width / n;
    const bw = Math.max(1.5, Math.min(6, band - 2));
    return (
      <svg width={width} height={height} aria-hidden className={css({ display: "block", overflow: "visible" })}>
        {values.map((v, i) => {
          const bh = Math.max(1, (v / max) * h);
          return <path key={i} d={barPath(band * i + (band - bw) / 2, pad + h - bh, bw, bh)} fill={ac.data} fillOpacity={0.85} />;
        })}
      </svg>
    );
  }

  const x = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const y = (v: number) => pad + h - (v / max) * h;
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden className={css({ display: "block", overflow: "visible" })}>
      <path d={`M${x(0)},${height} L${pts.split(" ").join(" L")} L${x(n - 1)},${height} Z`} fill={ac.data} fillOpacity={0.1} />
      <polyline points={pts} fill='none' stroke={ac.data} strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r={3} fill={ac.data} stroke={ac.surface} strokeWidth={2} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- *
 * Rank bars — the author leaderboard.
 * -------------------------------------------------------------------------- */

export function RankBars({ rows }: { rows: { id: number; name: string; count: number }[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef, 300);
  const max = Math.max(...rows.map(r => r.count), 1);
  // Name column, then the track, then room for the value at the tip.
  const nameW = Math.min(132, Math.max(88, width * 0.42));
  const valueW = 30;
  const trackW = Math.max(24, width - nameW - valueW - 12);

  return (
    <div ref={wrapRef} className={css({ display: "flex", flexDirection: "column", gap: "10px" })}>
      {rows.map(r => (
        <div key={r.id} className={css({ display: "flex", alignItems: "center", gap: "10px" })}>
          <div
            className={css({ fontSize: "14px", lineClamp: 1, wordBreak: "break-all", flex: "none" })}
            style={{ width: `${nameW}px` }}
            title={r.name}>
            {r.name || "—"}
          </div>
          <svg width={trackW} height={10} className={css({ flex: "none", display: "block" })} aria-hidden>
            <path d={barPath(0, 1, (r.count / max) * trackW, 8, false)} fill={ac.data} fillOpacity={0.85} />
          </svg>
          <div
            className={css({ fontSize: "12.5px", fontVariantNumeric: "tabular-nums", flex: "none", textAlign: "right" })}
            style={{ width: `${valueW}px`, color: ac.sub }}>
            {r.count}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The proportion rule under a Top-performing row: turns five numbers into a
 *  shape without adding a second chart. */
export function ShareRule({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div
      className={css({ height: "3px", borderRadius: "2px", marginTop: "7px", overflow: "hidden" })}
      style={{ background: ac.rowLine }}
      aria-hidden>
      <div
        className={css({ height: "100%", borderRadius: "2px" })}
        style={{ width: `${pct}%`, background: ac.data, opacity: 0.75 }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Delta — "vs the 7 days before", in words the reader does not have to decode.
 * -------------------------------------------------------------------------- */

export function Delta({ current, previous, label }: { current: number | null; previous: number | null; label: string }) {
  if (current === null || previous === null) {
    return (
      <span className={css({ fontSize: "14px" })} style={{ color: ac.faint }}>
        no comparison yet
      </span>
    );
  }
  if (previous === 0) {
    return (
      <span className={css({ fontSize: "14px" })} style={{ color: ac.muted }}>
        {current === 0 ? `nothing ${label}` : `up from none ${label}`}
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const flat = pct === 0;
  // Colour INFORMS here: up is good on both metrics this is used for. It is
  // never the only channel — the arrow and the sign carry it too.
  const colour = flat ? ac.muted : pct > 0 ? ac.good : ac.warn;
  return (
    <span className={css({ fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "4px" })}>
      <span style={{ color: colour, fontWeight: 600 }}>
        {flat ? "±" : pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
      </span>
      <span style={{ color: ac.muted }}>{label}</span>
    </span>
  );
}
