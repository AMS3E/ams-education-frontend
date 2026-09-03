"use client";

import { useState } from "react";
import { css, cx } from "@/styled-system/css";
import MiniRow from "@/components/ui/MiniRow";
import type { NamedList } from "@/lib/articles";

const tabStyle = css({
  background: "none",
  border: "none",
  padding: 0,
  fontFamily: "inherit",
  fontSize: "18px",
  fontWeight: 500,
  color: "muted",
  cursor: "pointer",
  transition: "color .2s",
  _hover: { color: "text" },
});

const tabActive = css({ color: "text", fontWeight: 700 });

/** ព័ត៌មានជាតិ / ព័ត៌មានអន្តរជាតិ — the article sidebar's tabbed widget,
 *  matching the live WordPress theme's version: two labels side by side,
 *  the inactive one greyed out, switching a list of thumbnailed rows below. */
export default function NationalInternationalTabs({ national, international }: { national: NamedList; international: NamedList }) {
  const [active, setActive] = useState(0);
  const tabs = [national, international];

  return (
    <div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "18px",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "divider",
          paddingBottom: "12px",
        })}
      >
        {tabs.map((t, i) => (
          <div key={t.heading} className={css({ display: "flex", alignItems: "center", gap: "10px" })}>
            {i > 0 && <span className={css({ color: "muted" })}>/</span>}
            <button type="button" onClick={() => setActive(i)} aria-pressed={i === active} className={cx(tabStyle, i === active && tabActive)}>
              {t.heading}
            </button>
          </div>
        ))}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.heading}
          hidden={i !== active}
          className={css({ display: "flex", flexDirection: "column", gap: "16px", _hidden: { display: "none" } })}
        >
          {t.items.map((item) => (
            <MiniRow key={item.slug} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
}
