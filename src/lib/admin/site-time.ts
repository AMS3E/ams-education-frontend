// Site-local time for the article editor and the Articles list.
//
// WordPress runs this site in Asia/Phnom_Penh and its REST API reads and
// writes `date` as that wall clock with NO zone suffix ("2026-09-16T13:00:00").
// Every helper here keeps to that exact string shape, so nothing on this side
// ever converts between zones — the one place that maths was attempted (the
// old scheduler) published things seven hours early. Client-safe: no server
// imports.

export const SITE_TZ = "Asia/Phnom_Penh";

export interface SiteDateParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number;
  second: number;
}

export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Now, on the site's wall clock, in WordPress's own `date` shape. */
export function siteNowIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/** "2026-09-16T13:00:00" (seconds optional) → parts, or null when it is not
 *  a date in that shape. */
export function parseSiteDate(iso: string): SiteDateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: m[6] ? +m[6] : 0 };
}

export function formatSiteIso(p: SiteDateParts): string {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Pull every field into range — the day last, against the month it ends up in. */
export function clampSiteDate(p: SiteDateParts): SiteDateParts {
  const year = Math.min(9999, Math.max(1970, Math.trunc(p.year)));
  const month = Math.min(12, Math.max(1, Math.trunc(p.month)));
  const day = Math.min(daysInMonth(year, month), Math.max(1, Math.trunc(p.day)));
  const hour = Math.min(23, Math.max(0, Math.trunc(p.hour)));
  const minute = Math.min(59, Math.max(0, Math.trunc(p.minute)));
  const second = Math.min(59, Math.max(0, Math.trunc(p.second)));
  return { year, month, day, hour, minute, second };
}

/** Both strings are the same wall clock (Cambodia has no DST), so reading them
 *  as if they were UTC gives an exact difference in seconds. */
function wallClockEpoch(iso: string): number | null {
  const p = parseSiteDate(iso);
  if (!p) return null;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
}

/** Whether `iso` lies at least `marginSeconds` ahead of the site's now. The
 *  default margin is WordPress's own: on save it treats a date less than a
 *  minute ahead as "now" and publishes instead of scheduling. */
export function isFutureSiteDate(iso: string, marginSeconds = 60): boolean {
  const then = wallClockEpoch(iso);
  const now = wallClockEpoch(siteNowIso());
  if (then === null || now === null) return false;
  return then - now >= marginSeconds;
}

/** Whether `iso` is a site date that has already passed. False for anything
 *  that does not parse — a row with an unreadable date must not be flagged. */
export function isPastSiteDate(iso: string): boolean {
  const then = wallClockEpoch(iso);
  const now = wallClockEpoch(siteNowIso());
  return then !== null && now !== null && then < now;
}

/** Now to the minute — what a fresh "Scheduled" starts from, as wp-admin's
 *  own picker does (owner's call, 2026-09-16). The editor says out loud when
 *  that moment has already passed, so leaving it untouched publishes on save
 *  knowingly rather than by accident. */
export function siteNowMinuteIso(): string {
  return formatSiteIso({ ...parseSiteDate(siteNowIso())!, second: 0 });
}

/** "1:00 pm" — the time alone, for a list cell that already shows the day. */
export function formatSiteTime(iso: string): string {
  const p = parseSiteDate(iso);
  if (!p) return "";
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)} ${p.hour >= 12 ? "pm" : "am"}`;
}

/** "16 Sep 2026, 1:00 pm" — how the sidebar and the list read a date back. */
export function formatSiteDateLong(iso: string): string {
  const p = parseSiteDate(iso);
  if (!p) return iso;
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}, ${h12}:${pad(p.minute)} ${p.hour >= 12 ? "pm" : "am"}`;
}
