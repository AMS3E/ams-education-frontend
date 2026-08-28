"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import PosterCarousel from "@/components/home/PosterCarousel";
import type { HomeCard } from "@/lib/home-data";

const KHMER_DIGITS = ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"];
const toKhmerNumeral = (n: number) =>
  String(n)
    .split("")
    .map((d) => KHMER_DIGITS[Number(d)] ?? d)
    .join("");

/** `HomeCard.ep` carries labels like "S2:E17" (see PosterCarousel's `year`
 *  doc) — the season number is the digits between "S" and ":". Null for
 *  anything that doesn't parse (a scrape miss, or a special with no season),
 *  so it can be dropped rather than grouped into a bogus "season 0" tab. */
function seasonOf(ep?: string): number | null {
  const m = /^S(\d+):/.exec(ep ?? "");
  return m ? Number(m[1]) : null;
}

const tabButton = css({
  background: "none",
  border: "none",
  padding: 0,
  fontFamily: "inherit",
  fontSize: "22px",
  fontWeight: 700,
  color: "muted",
  cursor: "pointer",
  transition: "color .2s",
  _hover: { color: "text" },
});
const tabActive = css({ color: "text" });
const seeAll = css({
  fontSize: "14px",
  color: "muted",
  textDecoration: "none",
  transition: "opacity .2s",
  _hover: { opacity: 0.7 },
});

/**
 * A program's episodes grouped into season tabs — "រដូវកាលទី ១ / រដូវកាលទី ២"
 * — reusing EpisodeCarousel's own PosterCarousel per panel. Same
 * all-panels-rendered-and-hidden approach as MatikaTabs: switching seasons
 * costs no re-fetch or re-render of the cards, and every episode stays in
 * the HTML for crawlers.
 *
 * `episodes` is fetchEpisodeRail's flat, newest-first list (see that
 * function's doc comment — it doesn't preserve season boundaries itself),
 * so the grouping happens here from each episode's own "S{n}:E{m}" label.
 * Falls back to EpisodeCarousel-style plain rendering (no tabs) when the
 * label carries no season number or there's only one season, rather than
 * showing a single pointless tab.
 */
export default function SeasonEpisodeCarousel({
  episodes,
  seeAllHref,
  unoptimized,
  autoScrollMs,
}: {
  episodes: HomeCard[];
  seeAllHref?: string;
  unoptimized?: boolean;
  autoScrollMs?: number;
}) {
  const seasons = useMemo(() => {
    const bySeason = new Map<number, HomeCard[]>();
    for (const e of episodes) {
      const s = seasonOf(e.ep);
      if (s === null) continue;
      const list = bySeason.get(s);
      if (list) list.push(e);
      else bySeason.set(s, [e]);
    }
    return [...bySeason.entries()].sort((a, b) => a[0] - b[0]).map(([season, items]) => ({ season, items }));
  }, [episodes]);

  // The live rail defaults to its newest season (measured: the homepage
  // shows Season 2 active, not Season 1) — episodes arrive newest-first, so
  // that's the last season bucket once sorted ascending above.
  const [active, setActive] = useState(Math.max(0, seasons.length - 1));

  if (episodes.length === 0) return null;

  if (seasons.length <= 1) {
    return (
      <section className={css({ paddingTop: "44px" })}>
        <PosterCarousel
          posters={episodes.map((e) => ({ src: e.src, title: e.title, year: e.ep, href: e.href }))}
          unoptimized={unoptimized}
          autoScrollMs={autoScrollMs}
        />
      </section>
    );
  }

  return (
    <section className={css({ paddingTop: "44px" })}>
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
        <div className={css({ display: "flex", alignItems: "center", gap: "8px" })}>
          {seasons.map((s, i) => (
            <span key={s.season} className={css({ display: "flex", alignItems: "center", gap: "8px" })}>
              {i > 0 && <span className={css({ color: "muted", fontSize: "22px" })}>/</span>}
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={cx(tabButton, i === active && tabActive)}
              >
                រដូវកាលទី {toKhmerNumeral(s.season)}
              </button>
            </span>
          ))}
        </div>
        {seeAllHref && (
          <Link href={seeAllHref} className={seeAll}>
            មើលទាំងអស់ ➧
          </Link>
        )}
      </div>

      {seasons.map((s, i) => (
        <div key={s.season} hidden={i !== active} className={css({ _hidden: { display: "none" } })}>
          <PosterCarousel
            posters={s.items.map((e) => ({ src: e.src, title: e.title, year: e.ep, href: e.href }))}
            unoptimized={unoptimized}
            autoScrollMs={autoScrollMs}
          />
        </div>
      ))}
    </section>
  );
}
