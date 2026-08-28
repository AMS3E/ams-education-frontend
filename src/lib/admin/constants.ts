// Client-safe admin constants — NO server imports (next/headers etc.), so both
// the server data layer and Client Components can import the values here.

/** Statuses the article list shows by default (skips private/trash).
 *
 *  `future` is IN, and was missing: MEASURED 2026-08-11, a post scheduled from
 *  wp-admin appeared under `?status=future` but was absent from this list
 *  entirely, so a scheduled article was invisible in the tool that is supposed
 *  to be the newsroom's view of its own queue. Now that the scheduler actually
 *  publishes them (lib/admin/scheduler.ts), being able to see what is queued
 *  is the whole point. */
export const DEFAULT_STATUSES = "publish,future,draft,pending";

/** The WordPress menu behind the public site's program-icon strip
 *  (មាតិកាឌីជីថល). Its SLUG, not its id — ids differ between environments.
 *  Lives here rather than in lib/admin/menus.ts because the Menus screen is a
 *  Client Component: value-importing it from that module would pull adminFetch
 *  (and next/headers with it) into the browser bundle. */
export const PROGRAM_ICON_MENU = "ams-infotainment-third-menu";

/** Windows the dashboard's range control offers, and the ceiling on what the
 *  fast path will aggregate. A 365-day roll-up of WordPress Popular Posts'
 *  summary table measured 57 SECONDS live (30 and 90 days are fine), so this
 *  list is a measurement, not a preference.
 *
 *  Here rather than in lib/admin/dashboard.ts for the same reason as
 *  PROGRAM_ICON_MENU above: DashboardScreen is a Client Component, and
 *  value-importing these from that module would pull adminFetch — and
 *  next/headers with it — into the browser bundle. (Types may still be
 *  imported from there; `import type` is erased.) */
export const DASH_RANGES = [7, 30, 90] as const;
export type DashRange = (typeof DASH_RANGES)[number];

/** A custom chart window (fast-api 1.8.0): site-local Y-m-d, INCLUSIVE both
 *  ends. The plugin clamps `to` at today and the span at 90 days — the same
 *  57-second measurement that pinned DASH_RANGES. */
export interface DashCustomRange {
  from: string;
  to: string;
}

/** What the dashboard's range control can hold: a preset or a custom window. */
export type DashRangeSpec = DashRange | DashCustomRange;

export function isCustomRange(r: DashRangeSpec): r is DashCustomRange {
  return typeof r !== "number";
}

/** Y-m-d, the only shape the BFF forwards to the plugin. */
export const DASH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function clampRange(raw: unknown): DashRange {
  const n = Number(raw);
  return (DASH_RANGES as readonly number[]).includes(n) ? (n as DashRange) : 30;
}
