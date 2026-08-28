"use client";

import { useState } from "react";
import { css, cx } from "@/styled-system/css";
import ArticleCard from "@/components/ui/ArticleCard";
import type { MatikaTab } from "@/lib/landing-data";

const tabStyle = css({
  background: "none",
  border: "none",
  padding: 0,
  fontFamily: "inherit",
  fontSize: "14px",
  color: "muted",
  cursor: "pointer",
  transition: "color .2s",
  _hover: { color: "text" },
});

const tabActive = css({ color: "#00208c", fontWeight: 600 });

/**
 * មាតិការសនិយម — four topics, four articles each, switching in place.
 *
 * This is the one block on a landing page whose tabs are real: they used to be
 * four <Link>s that navigated away to the topics' landing pages, with only the
 * first topic's articles ever fetched. All four panels are now fetched on the
 * server and the tab only swaps which one is shown, which is what the live
 * jQuery widget does.
 */
export default function MatikaTabs({ heading, tabs }: { heading: string; tabs: MatikaTab[] }) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "18px",
        })}
      >
        <h2 className={css({ fontSize: "22px", fontWeight: 500 })}>{heading}</h2>

        <div className={css({ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" })}>
          {tabs.map((t, i) => (
            <button key={t.href} type="button" onClick={() => setActive(i)} aria-pressed={i === active} className={cx(tabStyle, i === active && tabActive)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* All four panels are rendered and the inactive ones are hidden, rather
          than mounting only the active one: it is what the live widget does, it
          keeps all 16 articles in the HTML for crawlers, and switching a tab
          costs no re-render of the cards. */}
      {tabs.map((t, i) => (
        <div
          key={t.href}
          hidden={i !== active}
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "repeat(2,1fr)", md: "repeat(4,1fr)" },
            gap: "18px",
            _hidden: { display: "none" },
          })}
        >
          {t.items.map((item) => (
            <ArticleCard key={item.slug} item={item} sizes="(max-width: 768px) 50vw, 280px" withCategories />
          ))}
        </div>
      ))}
    </div>
  );
}
