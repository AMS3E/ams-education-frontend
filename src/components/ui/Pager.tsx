import Link from "next/link";
import { css } from "@/styled-system/css";

/** How many numbered pages the strip shows at once. */
const WINDOW = 3;

/** The numbered pages to show: a window of `size` centred on `page`, pushed back
 *  inside [1, totalPages] at both ends so page 1 reads 1·2·3 and the last page
 *  reads 159·160·161 rather than running off the edge. Shrinks to fit a feed
 *  with fewer pages than the window. */
function pageWindow(page: number, totalPages: number, size = WINDOW): number[] {
  const span = Math.max(1, Math.min(size, totalPages));
  const start = Math.min(Math.max(1, page - Math.floor(span / 2)), totalPages - span + 1);
  return Array.from({ length: span }, (_, i) => start + i);
}

// Idle / current / disabled are three COMPLETE classes, exactly one applied per
// cell — never cx(cell, current). cx only concatenates class strings; it does
// not merge conflicting atomic properties, so layering an override lets the
// base's `background:none` win by source order (same trap as SeasonTabs).
const cellBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "30px",
  height: "30px",
  padding: "0 7px",
  fontFamily: "inherit",
  fontSize: "13px",
  lineHeight: 1,
  borderRadius: "3px",
  borderWidth: "1px",
  borderStyle: "solid",
  textDecoration: "none",
  transition: "color .2s, background .2s, border-color .2s",
} as const;

const cellIdle = css({
  ...cellBase,
  background: "none",
  borderColor: "divider",
  color: "muted",
  _hover: { color: "text", borderColor: "muted" },
});

// The brand blue the day tabs used for their active label, so the control that
// replaced them reads as the same piece of furniture.
const cellCurrent = css({
  ...cellBase,
  background: "#00208c",
  borderColor: "#00208c",
  color: "#fff",
  fontWeight: 600,
});

const cellOff = css({
  ...cellBase,
  background: "none",
  borderColor: "divider",
  color: "divider",
  cursor: "default",
});

const pagerRow = css({ display: "flex", alignItems: "center", gap: "5px" });

/** One step/jump arrow. Renders a plain <span> at the ends rather than a link to
 *  the page you are already on — a disabled control should not be focusable. */
function Arrow({ to, label, glyph, enabled, href }: { to: number; label: string; glyph: string; enabled: boolean; href: (p: number) => string }) {
  if (!enabled) {
    return (
      <span aria-hidden className={cellOff}>
        {glyph}
      </span>
    );
  }
  return (
    <Link href={href(to)} aria-label={label} scroll={false} className={cellIdle}>
      {glyph}
    </Link>
  );
}

/**
 * First · prev · a sliding window of page numbers · next · last.
 *
 * A server component: every page is a real <Link>, so the pages are crawlable
 * and shareable, and no client JS runs to change pages.
 *
 * Paging does not move the viewport. The links carry no `#section` hash — that
 * made the browser jump to the section on every click — and `scroll={false}`
 * covers the other half: Link's default is to keep your scroll position only
 * while the page element stays in view, and to jump to the top otherwise. The
 * reader stays exactly where they were and the cards change under them.
 */
export default function Pager({
  page,
  totalPages,
  basePath = "/",
  pageStyle = "query",
}: {
  page: number;
  totalPages: number;
  basePath?: string;
  /** How page 2+ is addressed. "query" (`/x?page=2`) is what the landing
   *  sections use. "segment" (`/x/page/2`) is the shape the category and author
   *  archives already mint, and the homepage moved to it so that `/` reads no
   *  request-time API and can be prerendered — see HomeView. */
  pageStyle?: "query" | "segment";
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    if (p === 1) return basePath;
    // "/" would otherwise build "//page/2".
    if (pageStyle === "segment") return `${basePath === "/" ? "" : basePath}/page/${p}`;
    return `${basePath}?page=${p}`;
  };

  return (
    <nav aria-label="ទំព័រ" className={pagerRow}>
      <Arrow to={1} label="ទំព័រដំបូង" glyph="|◀" enabled={page > 1} href={href} />
      <Arrow to={page - 1} label="ទំព័រមុន" glyph="◀" enabled={page > 1} href={href} />

      {pageWindow(page, totalPages).map((p) =>
        p === page ? (
          <span key={p} aria-current="page" className={cellCurrent}>
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)} scroll={false} className={cellIdle}>
            {p}
          </Link>
        ),
      )}

      <Arrow to={page + 1} label="ទំព័របន្ទាប់" glyph="▶" enabled={page < totalPages} href={href} />
      <Arrow to={totalPages} label="ទំព័រចុងក្រោយ" glyph="▶|" enabled={page < totalPages} href={href} />
    </nav>
  );
}
