import Link from "next/link";
import { css, cx } from "@/styled-system/css";

const btn = css({
  minWidth: "34px",
  height: "34px",
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "13px",
  textDecoration: "none",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "divider",
  color: "text",
  transition: "background .2s, color .2s",
  _hover: { background: "rgba(127,127,140,0.08)" },
});

const active = css({
  background: "brand.blue",
  borderColor: "brand.blue",
  color: "#fff",
  _hover: { background: "brand.blue" },
});

const gap = css({ color: "muted", padding: "0 2px" });

/** Page 1 lives at the category's own URL, deeper pages at `.../page/N` — which
 *  matches WordPress and, more importantly, keeps page 1 statically prerendered.
 *  A `?page=` search param would opt the entire route out of prerendering and
 *  drop every category page onto the slow uncached path. */
export const pageHref = (basePath: string, page: number) => (page <= 1 ? basePath : `${basePath}/page/${page}`);

/** first … a window around the current page … last */
function pageNumbers(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const window = [page - 1, page, page + 1].filter(n => n > 1 && n < totalPages);
  const out: (number | "gap")[] = [1];
  if (window[0] > 2) out.push("gap");
  out.push(...window);
  if (window[window.length - 1] < totalPages - 1) out.push("gap");
  out.push(totalPages);
  return out;
}

/** Numbered pager. Previously every control was a <span> — it looked clickable
 *  and did nothing. */
export default function Pagination({ page, totalPages, basePath }: { page: number; totalPages: number; basePath: string }) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label='ទំព័រ'
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
        marginTop: "36px",
        width: "100%",
        justifyContent: "center",
      })}>
      {page > 1 && (
        <Link href={pageHref(basePath, page - 1)} rel='prev' className={cx(btn, css({ fontWeight: 600 }))}>
          ◂ ទំព័រមុន
        </Link>
      )}

      {pageNumbers(page, totalPages).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className={gap}>
            …
          </span>
        ) : n === page ? (
          // The current page is where you already are — a span, not a self-link
          // (matches live, and spares crawlers the circular hop).
          <span key={n} aria-current='page' className={cx(btn, active)}>
            {n.toLocaleString("en-US")}
          </span>
        ) : (
          <Link key={n} href={pageHref(basePath, n)} className={btn}>
            {n.toLocaleString("en-US")}
          </Link>
        ),
      )}

      {page < totalPages && (
        <Link href={pageHref(basePath, page + 1)} rel='next' className={cx(btn, css({ fontWeight: 600 }))}>
          ទំព័របន្ទាប់ ▸
        </Link>
      )}
    </nav>
  );
}
