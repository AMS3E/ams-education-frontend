"use client";

// The newsroom's morning screen, on Aurora's composition.
//
// LAYOUT: one full-bleed panel whose cells butt against each other, separated
// by 1px rules rather than floating on gutters. That is the single biggest
// reason the reference dashboards read as an instrument panel and our previous
// version read as a content page, and it is what the owner asked for.
//
// The cells, left to right, top to bottom:
//   1. the greeting — the day, then the Needs-you queue as openable work
//      (Aurora's move: the greeting earns its cell by carrying the queue,
//      not just a hello)
//   2. two KPI cells — number, delta vs the previous period, sparkline —
//      stacked in one column, splitting the greeting cell's height — then
//      Today so far closing the row: the only panel about the CURRENT day
//      (views since midnight vs yesterday at the same clock time, stories
//      filed today, most-read of the last hour — fast-api 1.8.0)
//   3. the trend panel — pageviews over stories published, one shared x-axis
//   4. top performing + trending now, half and half: standing over the selected
//      range beside momentum over a fixed 24 hours
//
// Who's publishing and Recent activity were cut from the screen (owner
// decisions, Session 31+) — both still arrive in the payload, so restoring
// either is a UI-only change.
//
// The CONTENT is unchanged from the rebuild that preceded the restyle: an
// editor's three morning questions, answered with real newsroom data rather
// than four counters scoped to the reader's own authorship (which measured
// 0 / 0 / 0 / 1 for the administrator account against a newsroom publishing
// ~4 stories a day).
//
// Scope is `edit_others_posts`, decided server-side. The range control scopes
// every dated view below it; the two KPI cells are pinned to 7-vs-prior-7 and
// say so, because a 90-day comparison would need 180 days of WPP's summary
// table and a 365-day aggregate of it measured 57 seconds live.

import Link from "next/link";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { Icon, type IconName } from "./icons";
import { Cell, Segmented, buttonClass, panelClass } from "./ui";
import { Bar, SkeletonKeyframes } from "./Skeleton";
import RefreshButton from "./RefreshButton";
import { TrendPanel, ShareRule, Sparkline, Delta } from "./charts";
import { useDashboard, useScreenRefresh, adminKeys } from "@/lib/admin/queries";
// Values from constants (client-safe); the data SHAPES stay type-only imports.
import {
  DASH_RANGES,
  DASH_DATE_RE,
  isCustomRange,
  type DashRange,
  type DashRangeSpec,
  type DashCustomRange,
} from "@/lib/admin/constants";
import type { TopPost } from "@/lib/admin/dashboard";

const QUICK = [
  { label: "New Article", href: "/admin/articles/new", icon: "plus" as const, primary: true },
  { label: "New Program", href: "/admin/programs/new", icon: "plus" as const },
  { label: "Upload media", href: "/admin/media", icon: "upload" as const },
];

/** Trend chart height. TrendPanel scales its two plots proportionally from
 *  this; the loading skeleton reads it too so the panel never jumps. */
const TREND_H = 320;

/** Whole days between an ISO site-local stamp and now. Parsed by parts: a bare
 *  date string handed to `new Date()` is treated as UTC, which would shift the
 *  answer by a day in Phnom Penh. */
function daysSince(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - then.getTime()) / 86400000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The "Custom" trigger beside the range presets, and its little popover: two
 *  date inputs, Apply, Cancel — the WPP stats screen's shape, in this admin's
 *  language. The PLUGIN is the authority on clamping (to <= today, span <= 90
 *  days); this control only refuses shapes that could never be a window. */
function CustomRangeControl({
  value,
  onApply,
}: {
  value: DashCustomRange | null;
  onApply: (r: DashCustomRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const valid = DASH_DATE_RE.test(from) && DASH_DATE_RE.test(to) && from <= to;

  const toggle = () => {
    setFrom(value?.from ?? "");
    setTo(value?.to ?? "");
    setOpen(o => !o);
  };

  return (
    <div className={css({ position: "relative" })}>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        className={css({ fontSize: "12.5px", fontWeight: 600, padding: "6px 12px", borderRadius: "10px", cursor: "pointer" })}
        style={{
          border: `1px solid ${value ? ac.borderStrong : ac.border}`,
          background: value ? ac.neutralTint : "transparent",
          color: value ? undefined : ac.muted,
        }}>
        {value ? `${fmtDay(value.from)} – ${fmtDay(value.to)}` : "Custom"}
      </button>
      {open ? (
        <div
          className={css({ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, padding: "16px", width: "380px", maxWidth: "calc(100vw - 48px)" })}
          style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}>
          {/* 380px on purpose: a type=date input will not shrink below its
              intrinsic ~160px, so two side by side need the room or they
              overflow the popover. */}
          <div className={css({ display: "flex", gap: "12px", flexWrap: "wrap" })}>
            <label className={css({ flex: 1, minWidth: "150px", fontSize: "14px", fontWeight: 600 })} style={{ color: ac.muted }}>
              Start date
              <input
                type='date'
                value={from}
                max={to || undefined}
                onChange={e => setFrom(e.target.value)}
                className={css({ display: "block", width: "100%", marginTop: "5px", fontSize: "14px", padding: "7px 9px", background: "transparent", color: "inherit", fontWeight: 400 })}
                style={{ border: `1px solid ${ac.border}` }}
              />
            </label>
            <label className={css({ flex: 1, minWidth: "150px", fontSize: "14px", fontWeight: 600 })} style={{ color: ac.muted }}>
              End date
              <input
                type='date'
                value={to}
                min={from || undefined}
                onChange={e => setTo(e.target.value)}
                className={css({ display: "block", width: "100%", marginTop: "5px", fontSize: "14px", padding: "7px 9px", background: "transparent", color: "inherit", fontWeight: 400 })}
                style={{ border: `1px solid ${ac.border}` }}
              />
            </label>
          </div>
          <div className={css({ fontSize: "14px", marginTop: "10px" })} style={{ color: ac.faint }}>
            Up to 90 days, ending today at the latest.
          </div>
          <div className={css({ display: "flex", gap: "8px", marginTop: "12px" })}>
            <button
              type='button'
              disabled={!valid}
              onClick={() => {
                onApply({ from, to });
                setOpen(false);
              }}
              className={buttonClass("primary")}
              style={!valid ? { opacity: 0.5, cursor: "default" } : undefined}>
              Apply
            </button>
            <button type='button' onClick={() => setOpen(false)} className={buttonClass("secondary")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "2026-07-18" -> "18 Jul" — the compact form the custom-range label uses. */
function fmtDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : ymd;
}

function ago(iso: string): string {
  const d = daysSince(iso);
  if (d === null) return "";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const months = Math.round(d / 30);
  return months <= 1 ? "a month ago" : `${months} months ago`;
}

/* -------------------------------------------------------------------------- *
 * The panel. One surface, cells divided by rules — no gutters.
 * -------------------------------------------------------------------------- */

// `panel` and `Cell` used to be defined here. They are the layout unit for the
// WHOLE admin now, not just this screen, so they live in ui.tsx — same values,
// one definition. `panel` is re-aliased rather than renamed at every call site.
const panel = panelClass;

export default function DashboardScreen({ firstName }: { firstName: string }) {
  const [range, setRange] = useState<DashRangeSpec>(30);
  const dashboard = useDashboard(range);
  const { refreshing, refresh } = useScreenRefresh("dashboard", [adminKeys.dashboardRoot]);

  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const data = dashboard.data;
  const loading = dashboard.isPending;
  // keepPreviousData: true only while a range flip is in flight. Scoped to the
  // range-driven views (the trend chart, mainly) rather than dimming the whole
  // screen — the queue, KPIs and Today cells do not change with the range.
  const stale = dashboard.isPlaceholderData;

  const queue = data?.queue;
  const kpi = data?.kpi;
  const series = data?.series ?? null;
  // Optimistic while loading: deciding the leaderboard cell only once `data`
  // lands would reflow the whole bottom band.
  const newsroom = data ? data.scope === "all" : true;
  const custom = isCustomRange(range) ? range : null;
  const rangeLabel = custom ? `${fmtDay(custom.from)} – ${fmtDay(custom.to)}` : `last ${range} days`;

  // The sparklines show the last 14 days — the window the KPI delta compares —
  // rather than the whole selected range, so tile and delta describe the same
  // stretch of time. On a CUSTOM window the series is the selected slice of
  // the past, not the KPI's window, so the tiles drop their sparklines rather
  // than draw a shape that contradicts the number beside it.
  const sparkViews = series && !custom ? series.slice(-14).map(p => p.views) : [];
  const sparkPosts = series && !custom ? series.slice(-14).map(p => p.posts) : [];

  return (
    <div className={css({})}>
      {dashboard.isError ? (
        <div
          className={css({ marginBottom: "16px", padding: "16px 20px", borderRadius: "12px", fontSize: "13px" })}
          style={{ background: ac.dangerTint, border: `1px solid ${ac.danger}`, color: ac.danger }}>
          Couldn&rsquo;t load the dashboard from WordPress. Use Refresh to try again.
        </div>
      ) : null}

      <div>
        {/* ========= panel 1: greeting+queue · stacked KPIs · today so far ========= */}
        <div
          className={cx2(panel, css({ display: "grid" }))}
          style={{ gridTemplateColumns: "minmax(300px,1.3fr) minmax(240px,1fr) minmax(280px,1.1fr)" }}>
          {/* greeting, carrying the queue — the day, then what it asks of you */}
          <Cell right>
            <div className={css({ fontSize: "16px" })} style={{ color: ac.muted }}>
              {dateLabel}
            </div>
            <div
              className={css({
                fontSize: "21px",
                fontWeight: 600,
                marginTop: "6px",
                lineHeight: 1.25,
              })}>
              Good morning, {firstName}
            </div>
            <div style={{ height: 1, background: ac.border, margin: "16px 0 12px" }} />
            <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" })}>
              <span className={css({ fontSize: "13.5px", fontWeight: 600 })}>Needs you</span>
              <Link
                href='/admin/articles?status=pending'
                className={css({ fontSize: "12px", display: "flex", alignItems: "center", gap: "3px" })}
                style={{ color: ac.muted }}>
                Review <Icon name='arrowRight' size={12} strokeWidth={2} />
              </Link>
            </div>
            <div className={css({ display: "flex", flexDirection: "column", gap: "2px", marginTop: "10px" })}>
              {loading || !queue ? (
                <>
                  <Bar w='100%' h={46} r={10} />
                  <Bar w='100%' h={46} r={10} />
                </>
              ) : queue.pending === 0 && queue.drafts === 0 && queue.scheduled === 0 ? (
                <div className={css({ fontSize: "13px", padding: "12px 0" })} style={{ color: ac.muted }}>
                  Nothing waiting. The queue is clear.
                </div>
              ) : (
                <>
                  {queue.pending > 0 ? (
                    <QueueRow
                      icon='clock'
                      href='/admin/articles?status=pending'
                      count={queue.pending}
                      label={queue.pending === 1 ? "story in review" : "stories in review"}
                      note={
                        queue.oldest
                          ? `oldest ${ago(queue.oldest.date)}${queue.oldest.authorName ? ` · ${queue.oldest.authorName}` : ""}`
                          : undefined
                      }
                      warn={queue.oldest ? (daysSince(queue.oldest.date) ?? 0) >= 2 : false}
                    />
                  ) : null}
                  {queue.drafts > 0 ? (
                    <QueueRow
                      icon='pencil'
                      href='/admin/articles?status=draft'
                      count={queue.drafts}
                      label={newsroom ? "drafts in the pipeline" : "of your drafts"}
                      note={queue.draftsStale > 0 ? `${queue.draftsStale} untouched for 30 days` : undefined}
                    />
                  ) : null}
                  {/* Only when it bites: this server's loopback is broken, so
                      WP-Cron never fires and a scheduled post never publishes. */}
                  {queue.scheduled > 0 ? (
                    <QueueRow
                      icon='calendar'
                      href='/admin/articles?status=future'
                      count={queue.scheduled}
                      label={queue.scheduled === 1 ? "scheduled story is stuck" : "scheduled stories are stuck"}
                      note='this server never publishes them — WP-Cron is broken'
                      warn
                    />
                  ) : null}
                  {/* Comments-awaiting-moderation row — PARKED by owner decision
                      (2026-08-16). The data still arrives as `queue.comments`
                      (plugin 1.8.0, moderate_comments-gated), so re-enabling is
                      uncommenting this block and adding `queue.comments === 0`
                      back to the all-clear condition above. Moderation itself
                      lives in wp-admin.
                  {queue.comments > 0 ? (
                    <QueueRow
                      icon='comment'
                      href='https://education.ams.com.kh/wp-admin/edit-comments.php?comment_status=moderated'
                      count={queue.comments}
                      label={queue.comments === 1 ? "comment awaiting moderation" : "comments awaiting moderation"}
                      note='opens wp-admin'
                    />
                  ) : null}
                  */}
                </>
              )}
            </div>
          </Cell>

          {/* The two KPIs stack and SPLIT the greeting cell's height — the
              queue made that cell ~2 KPI cells tall, and 1fr/1fr rows are what
              keep the pair from stretching around whitespace. */}
          <div
            className={css({ display: "grid", gridTemplateRows: "1fr 1fr", minWidth: 0 })}
            style={{ borderRight: `1px solid ${ac.border}` }}>
            {/* KPI: pageviews */}
            <Cell bottom>
              <KpiCell
                label='Pageviews'
                sub='last 7 days'
                value={kpi?.views7 ?? null}
                loading={loading || !kpi}
                unavailable='Needs the fast read path'
                delta={kpi ? <Delta current={kpi.views7} previous={kpi.viewsPrev7} label='vs prior 7 days' /> : null}
                spark={sparkViews}
                kind='line'
              />
            </Cell>

            {/* KPI: published */}
            <Cell>
              <KpiCell
                label={newsroom ? "Stories published" : "You published"}
                sub='last 7 days'
                value={kpi?.published7 ?? null}
                loading={loading || !kpi}
                delta={kpi ? <Delta current={kpi.published7} previous={kpi.publishedPrev7} label='vs prior 7 days' /> : null}
                spark={sparkPosts}
                kind='bars'
              />
            </Cell>
          </div>

          {/* today so far — the one panel about the CURRENT day. The delta is
              honest by construction: since-midnight vs yesterday UP TO THE
              SAME CLOCK TIME, computed on the plugin's 120s memo (1.8.0).
              Everything else on this screen describes the past. */}
          <Cell>
            <div className={css({ fontSize: "21px", fontWeight: 600 })}>Today so far</div>
            <div className={css({ fontSize: "14px", marginTop: "3px" })} style={{ color: ac.muted }}>
              Since midnight · Phnom Penh time
            </div>
            {loading ? (
              <div className={css({ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" })} aria-busy>
                <Bar w={130} h={30} />
                <Bar w='70%' h={14} />
                <Bar w='55%' h={14} />
              </div>
            ) : !data?.today ? (
              <div className={css({ fontSize: "13px", marginTop: "16px", lineHeight: 1.6 })} style={{ color: ac.faint }}>
                Needs fast-api 1.8.0 — only the fast read path can compare today against yesterday at the same clock
                time.
              </div>
            ) : (
              <>
                <div className={css({ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "14px" })}>
                  <span className={css({ fontSize: "28px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 })}>
                    {data.today.views === null ? "—" : data.today.views.toLocaleString("en-US")}
                  </span>
                  <span className={css({ fontSize: "13px" })} style={{ color: ac.muted }}>
                    pageviews
                  </span>
                </div>
                {data.today.views !== null && data.today.viewsPrevSameTime !== null ? (
                  <div className={css({ marginTop: "8px" })}>
                    <Delta
                      current={data.today.views}
                      previous={data.today.viewsPrevSameTime}
                      label='vs yesterday by this time'
                    />
                  </div>
                ) : null}
                <div style={{ height: 1, background: ac.border, margin: "14px 0 12px" }} />
                <div className={css({ fontSize: "13.5px" })}>
                  <span className={css({ fontWeight: 600 })}>{data.today.posts.toLocaleString("en-US")}</span>{" "}
                  <span style={{ color: ac.sub }}>
                    {data.today.posts === 1
                      ? newsroom
                        ? "story published today"
                        : "story of yours published today"
                      : newsroom
                        ? "stories published today"
                        : "of your stories published today"}
                  </span>
                </div>
                <div className={css({ fontSize: "12.5px", marginTop: "12px" })} style={{ color: ac.muted }}>
                  Most read this hour
                </div>
                {data.today.topHour ? (
                  <Link
                    href={`/admin/articles/${data.today.topHour.id}`}
                    className={css({
                      display: "block",
                      fontSize: "13.5px",
                      marginTop: "3px",
                      lineClamp: 1,
                      _hover: { textDecoration: "underline" },
                    })}>
                    {data.today.topHour.title}{" "}
                    <span style={{ color: ac.faint }}>· {data.today.topHour.views.toLocaleString("en-US")} views</span>
                  </Link>
                ) : (
                  <div className={css({ fontSize: "13px", marginTop: "3px" })} style={{ color: ac.faint }}>
                    A quiet hour so far.
                  </div>
                )}
              </>
            )}
          </Cell>
        </div>

        {/* ================= panel 2: the trend ============================== */}
        <div
          className={cx2(
            panel,
            css({
              borderTop: "1px solid var(--colors-admin-border)",
              borderBottom: "1px solid var(--colors-admin-border)",
            }),
          )}>
          <div
            className={css({
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              padding: "18px 22px 4px",
              flexWrap: "wrap",
              marginBottom: "10px",
            })}>
            <div>
              <div className={css({ fontSize: "21px", fontWeight: 600, letterSpacing: "-0.01em" })}>Traffic &amp; publishing</div>
              <div className={css({ fontSize: "14px", marginTop: "3px" })} style={{ color: ac.muted }}>
                Daily pageviews over stories published · {rangeLabel}
              </div>
            </div>
            <div className={css({ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" })}>
              <Segmented
                ariaLabel='Date range'
                value={isCustomRange(range) ? -1 : range}
                onChange={v => setRange(v as DashRange)}
                options={DASH_RANGES.map(r => ({ value: r as number, label: `${r} days` }))}
              />
              <CustomRangeControl value={custom} onApply={r => setRange(r)} />
            </div>
          </div>
          {/* Only the range-driven chart dims while a range flip is in flight —
              the rest of the screen keeps its (range-independent) data live. */}
          <div className={css({ padding: "0 22px 14px" })} style={{ opacity: stale ? 0.55 : 1, transition: "opacity .15s" }}>
            {loading ? (
              <Bar w='100%' h={TREND_H} r={10} />
            ) : !series ? (
              <ChartEmpty text='Trend data needs the fast read path. WordPress REST exposes per-story totals and a top-five, but no daily timeline — so nothing is drawn rather than a flat line that would read as real.' />
            ) : (
              <>
                <TrendPanel series={series} hasViews={data?.hasViews ?? false} height={TREND_H} />
                {!data?.hasViews ? (
                  <div className={css({ fontSize: "11.5px", marginTop: "6px" })} style={{ color: ac.faint }}>
                    Pageviews unavailable — the analytics table is missing. Publishing volume is real.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* ================= panel 3: what is working ======================== */}
        <div className={cx2(panel, css({ display: "grid" }))} style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <Cell right padded={false}>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px 12px",
              })}>
              <div>
                <div className={css({ fontSize: "21px", fontWeight: 600 })}>Top performing</div>
                <div className={css({ fontSize: "14px", marginTop: "3px" })} style={{ color: ac.muted }}>
                  Most-read stories · {rangeLabel}
                </div>
              </div>
              <Link
                href='/admin/articles'
                className={css({ fontSize: "12px", display: "flex", alignItems: "center", gap: "3px" })}
                style={{ color: ac.muted }}>
                View all <Icon name='arrowRight' size={12} strokeWidth={2} />
              </Link>
            </div>
            <RankedRows loading={loading} rows={data ? data.top : null} />
          </Cell>

          {/* Momentum, not standing: a fixed 24-hour window that deliberately
              ignores the range control, so flipping 30→90 days never changes
              what "now" means. The two lists may overlap — that is signal. */}
          <Cell padded={false}>
            <div className={css({ padding: "18px 22px 12px" })}>
              <div className={css({ fontSize: "21px", fontWeight: 600 })}>Trending now</div>
              <div className={css({ fontSize: "14px", marginTop: "3px" })} style={{ color: ac.muted }}>
                Most-read · last 24 hours
              </div>
            </div>
            <RankedRows loading={loading} rows={data ? data.trending : null} />
          </Cell>
        </div>
      </div>
      <SkeletonKeyframes />
    </div>
  );
}

/** Local class-joiner — `cx` from Panda is imported by ui.tsx, and pulling the
 *  whole styled-system helper in here for two joins is not worth it. */
function cx2(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** KPI cell: label + period, big number, delta, sparkline. */
function KpiCell({
  label,
  sub,
  value,
  delta,
  spark,
  kind,
  loading,
  unavailable,
}: {
  label: string;
  sub: string;
  value: number | null;
  delta: React.ReactNode;
  spark: number[];
  kind: "line" | "bars";
  loading: boolean;
  unavailable?: string;
}) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", height: "100%" })}>
      <div className={css({ fontSize: "21px", fontWeight: 600 })}>{label}</div>
      <div className={css({ fontSize: "14px", marginTop: "2px" })} style={{ color: ac.muted }}>
        {sub}
      </div>
      {loading ? (
        <div className={css({ marginTop: "14px" })}>
          <Bar w={100} h={30} />
        </div>
      ) : value === null ? (
        <div className={css({ fontSize: "13px", marginTop: "14px", lineHeight: 1.5 })} style={{ color: ac.faint }}>
          {unavailable ?? "Unavailable"}
        </div>
      ) : (
        <>
          <div
            className={css({
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: "12px",
              marginTop: "12px",
            })}>
            <span className={css({ fontSize: "28px", fontWeight: 600, lineHeight: 1.1 })}>{value.toLocaleString("en-US")}</span>
            {spark.length ? <Sparkline values={spark} kind={kind} /> : null}
          </div>
          <div className={css({ marginTop: "10px" })}>{delta}</div>
        </>
      )}
    </div>
  );
}

/** The most-read list Top performing and Trending now share: rank, title,
 *  views, share rule, then author · desk · age. `rows` is null while data is
 *  absent; the share rule is relative to each list's own leader. */
function RankedRows({ rows, loading }: { rows: TopPost[] | null; loading: boolean }) {
  if (loading) return <SkeletonRows count={5} />;
  if (!rows || rows.length === 0) return <EmptyRow text='No view data yet.' />;
  return (
    <>
      {rows.map((a, i) => (
        <Link
          key={a.id}
          href={`/admin/articles/${a.id}`}
          className={css({
            display: "block",
            padding: "11px 22px",
            cursor: "pointer",
            _hover: { background: "var(--colors-admin-surface-hover)" },
          })}
          style={{ borderTop: `1px solid ${ac.rowLine}` }}>
          <div className={css({ display: "flex", alignItems: "center", gap: "14px" })}>
            <div
              className={css({ fontSize: "16px", fontWeight: 600, width: "16px", flex: "none", textAlign: "center" })}
              style={{ color: ac.faint }}>
              {i + 1}
            </div>
            <div className={css({ flex: 1, minWidth: 0, fontSize: "16px", lineHeight: 1.5, lineClamp: 1 })}>{a.title}</div>
            <div
              className={css({ fontSize: "13px", fontVariantNumeric: "tabular-nums", flex: "none" })}
              style={{ color: ac.sub }}>
              {a.views.toLocaleString("en-US")} <span style={{ color: ac.faint }}>views</span>
            </div>
          </div>
          <div className={css({ display: "flex", gap: "16px" })}>
            <div className={css({ width: "16px", flex: "none" })} />
            <div className={css({ flex: 1, minWidth: 0 })}>
              <ShareRule value={a.views} max={rows[0].views} />
              {a.authorName || a.categoryNames.length ? (
                <div className={css({ fontSize: "12px", marginTop: "6px", lineClamp: 1 })} style={{ color: ac.muted }}>
                  {[a.authorName, a.categoryNames[0], a.date ? ago(a.date) : ""].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={css({ display: "flex", alignItems: "center", gap: "14px", padding: "12px 22px" })}
          style={{ borderTop: `1px solid ${ac.rowLine}` }}>
          <Bar w={i % 2 ? "52%" : "40%"} h={14} />
          <div className={css({ flex: 1 })} />
          <Bar w={70} h={13} />
        </div>
      ))}
    </div>
  );
}

function QueueRow({
  icon,
  count,
  label,
  href,
  note,
  warn = false,
}: {
  icon: IconName;
  count: number;
  label: string;
  href: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={css({
        display: "flex",
        alignItems: "flex-start",
        gap: "11px",
        padding: "10px",
        borderRadius: "10px",
        cursor: "pointer",
        transition: "background .12s",
        _hover: { background: "var(--colors-admin-surface-hover)" },
      })}>
      <span
        className={css({
          width: "28px",
          height: "28px",
          borderRadius: "9px",
          display: "grid",
          placeItems: "center",
          flex: "none",
        })}
        style={{ background: warn ? ac.warnTint : ac.neutralTint, color: warn ? ac.warn : ac.muted }}>
        <Icon name={icon} size={15} strokeWidth={1.9} />
      </span>
      <span className={css({ flex: 1, minWidth: 0 })}>
        <span className={css({ display: "block", fontSize: "14px" })}>
          <span className={css({ fontWeight: 600 })}>{count.toLocaleString("en-US")}</span>{" "}
          <span className={css({ fontSize: "13px" })} style={{ color: ac.sub }}>
            {label}
          </span>
        </span>
        {note ? (
          <span
            className={css({ display: "block", fontSize: "12px", marginTop: "3px", lineHeight: 1.45 })}
            style={{ color: warn ? ac.warn : ac.muted }}>
            {note}
          </span>
        ) : null}
      </span>
      <Icon name='arrowRight' size={13} strokeWidth={2} style={{ color: ac.faint, flex: "none", marginTop: "6px" }} />
    </Link>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div
      className={css({
        padding: "46px 24px",
        fontSize: "12.5px",
        textAlign: "center",
        lineHeight: 1.6,
        maxWidth: "460px",
        marginInline: "auto",
      })}
      style={{ color: ac.muted }}>
      {text}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      className={css({ padding: "22px", fontSize: "13px", textAlign: "center" })}
      style={{ color: ac.muted, borderTop: `1px solid ${ac.rowLine}` }}>
      {text}
    </div>
  );
}
