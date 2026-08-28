import type { CSSProperties } from "react";

// A tiny line-icon set for the admin tool. Each entry is a single SVG path `d`
// string (multiple sub-paths are joined with a space, which one <path> renders
// fine). No hooks or client APIs, so this stays usable from both Server and
// Client Components. Stroke-based, 24×24 grid, to match the mock.
export const ICONS = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  articles: "M6 2h9l5 5v15H6z M15 2v5h5",
  media: "M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 5",
  programs: "M3 6h18v12H3z M10 9l5 3-5 3z",
  users: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7",
  settings: "M4 6h16 M4 12h16 M4 18h16 M9 4v4 M15 10v4 M8 16v4",
  list: "M8 6h13 M8 12h13 M8 18h13 M4 6h.01 M4 12h.01 M4 18h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  plus: "M12 5v14 M5 12h14",
  x: "M18 6L6 18 M6 6l12 12",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 17v3h16v-3",
  back: "M19 12H5 M12 19l-7-7 7-7",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  play: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M10 8l6 4-6 4z",
  music: "M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  arrowUp: "M12 19V5 M5 12l7-7 7 7",
  arrowDown: "M12 5v14 M19 12l-7 7-7-7",
  check: "M20 6 9 17l-5-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2",
  pencil: "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  comment: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6",
  trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
  // Body-editor toolbar
  bold: "M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7z M7 12h7a3.75 3.75 0 0 1 0 7.5H7z",
  italic: "M19 4h-9 M14 20H5 M15 4L9 20",
  strike: "M16 4H9a3 3 0 0 0-2.8 4 M14 12a4 4 0 0 1 0 8H6 M4 12h16",
  quote: "M4 17c2.5-.5 4-2 4-5V7H4v5h4 M13 17c2.5-.5 4-2 4-5V7h-4v5h4",
  orderedList: "M10 6h11 M10 12h11 M10 18h11 M4 6h2v4 M4 10h2 M4 15.5c0-1 2-1.5 2-.5 0 .8-2 1.5-2 3h2",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  undo: "M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13",
  redo: "M21 7v6h-6 M3 17a9 9 0 0 1 15-6.7L21 13",
  // Preview widths + open-in-new-tab
  monitor: "M3 4h18v12H3z M9 20h6 M12 16v4",
  tablet: "M6 2h12v20H6z M11 18.5h2",
  phone: "M8 2h8v20H8z M11 18.5h2",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",

  // Added with the design-system restyle: the chrome (top bar, grouped
  // sidebar, theme toggle) and the table primitives need these.
  minus: "M5 12h14",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronsLeft: "M11 6l-6 6 6 6 M18 6l-6 6 6 6",
  chevronsRight: "M13 6l6 6-6 6 M6 6l6 6-6 6",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  filter: "M3 5h18 M7 12h10 M10 19h4",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  tag: "M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01",
  folder: "M3 6h6l2 2h10v12H3z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
