"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";

// Section tabs for the Articles area: the list plus its taxonomy managers, kept
// together rather than dumped in Settings. Rendered by the list / categories /
// tags pages (NOT the editor). Flat sidebar stays a single "Articles" item.
const TABS = [
  { label: "Articles", href: "/admin/articles" },
  { label: "Categories", href: "/admin/articles/categories" },
  { label: "Tags", href: "/admin/articles/tags" },
];

/** @param trailing Controls parked at the right-hand end of the tab strip —
 *  the list screen puts its search and filters there so the two share one row
 *  instead of stacking. The rule under the strip then spans both, which is what
 *  makes the row read as the table's header rather than as two separate bars. */
export default function ArticlesTabs({ trailing }: { trailing?: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin/articles" ? pathname === href : pathname.startsWith(href);

  return (
    // 22px gutter to line up with the table cells below — with page padding
    // gone, a flush tab strip would sit hard against the sidebar.
    <div
      className={css({ display: "flex", alignItems: "center", gap: "16px", padding: "0 22px", flexWrap: "wrap" })}
      style={{ borderBottom: `1px solid ${ac.border}` }}
    >
      <div className={css({ display: "flex", flex: "none" })}>
        {TABS.map((t) => {
          const on = active(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={css({ padding: "13px 2px", marginRight: "22px", fontSize: "14px", cursor: "pointer" })}
              style={{ color: on ? ac.text : ac.muted, fontWeight: on ? 500 : 400, borderBottom: `2px solid ${on ? ac.accent : "transparent"}`, marginBottom: "-1px" }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {trailing ? (
        <>
          <div className={css({ flex: 1 })} />
          <div className={css({ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingBlock: "8px" })}>{trailing}</div>
        </>
      ) : null}
    </div>
  );
}
