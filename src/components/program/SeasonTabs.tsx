"use client";

import { useState } from "react";
import { css } from "@/styled-system/css";
import SectionHeader from "@/components/ui/SectionHeader";
import PosterCarousel from "@/components/home/PosterCarousel";
import type { SeasonCards } from "@/lib/episodes";

const tabRow = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "18px",
});

// Pill tabs, styled off the header's colored nav so a season browser reads as
// part of the program chrome rather than the article furniture below it.
//
// Idle and active are two COMPLETE classes, exactly one applied per state —
// never cx(tab, active). cx only concatenates class strings; it does not merge
// conflicting atomic properties, so layering an override lets the base's
// `background:none` win by source order and blanks the active pill white.
const tabBase = {
  borderRadius: "999px",
  padding: "7px 18px",
  fontFamily: "inherit",
  fontSize: "13px",
  borderWidth: "1px",
  borderStyle: "solid",
  cursor: "pointer",
  transition: "color .2s, background .2s, border-color .2s",
} as const;

const tabIdle = css({
  ...tabBase,
  background: "none",
  borderColor: "divider",
  color: "muted",
  fontWeight: 500,
  _hover: { color: "text", borderColor: "muted" },
});

const tabActive = css({
  ...tabBase,
  background: "#000",
  borderColor: "#000",
  color: "#fff",
  fontWeight: 600,
});

/** The season browser below វគ្គថ្មីៗ: a tab per season, each swapping in that
 *  season's episodes as the same poster carousel the recent-episodes rail uses.
 *
 *  Renders nothing for single-season (or episode-less) shows — with one season
 *  the tabs would just repeat វគ្គថ្មីៗ, so getProgram still hands the whole list
 *  over and the guard here decides. Every season's panel stays in the DOM (only
 *  `hidden` toggles) so a crawler sees every season's episode links, matching
 *  DailyEventsSection. */
export default function SeasonTabs({
  seasons,
  programSlug,
  currentId,
  currentSeason,
  alwaysShow = false,
}: {
  seasons: SeasonCards[];
  programSlug: string;
  /** The episode being watched: its card gets a highlight outline. */
  currentId?: number;
  /** The season number to open first — the watched episode's season. */
  currentSeason?: number;
  /** Render even a single season. The episode page sets this because, unlike the
   *  overview, it has no វគ្គថ្មីៗ rail above to fall back on. */
  alwaysShow?: boolean;
}) {
  // Open the watched episode's season by default; the overview passes neither
  // prop and lands on the first (oldest) season.
  const [active, setActive] = useState(() =>
    currentSeason != null ? Math.max(0, seasons.findIndex((s) => s.number === currentSeason)) : 0,
  );

  if (seasons.length === 0) return null;
  if (seasons.length < 2 && !alwaysShow) return null;

  const currentSlug = currentId != null ? `episode-${currentId}` : undefined;
  const current = seasons[active];
  const truncated = current.total > current.cards.length;
  const episodesHref = `/program/${programSlug}/episodes`;

  return (
    <section className={css({ paddingTop: "44px" })}>
      <SectionHeader
        title="រដូវកាល"
        titleSize="22px"
        titleWeight={700}
        seeAllHref={truncated ? episodesHref : undefined}
        seeAllText={truncated ? `មើលទាំងអស់ (${current.total}) ➧` : undefined}
      />

      {/* A lone season needs no tabs — its name is redundant with the heading. */}
      {seasons.length > 1 && (
        <div className={tabRow} role="tablist">
          {seasons.map((s, i) => (
            <button
              key={s.number}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={i === active ? tabActive : tabIdle}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {seasons.map((s, i) => (
        <div key={s.number} hidden={i !== active} className={css({ _hidden: { display: "none" } })}>
          <PosterCarousel
            posters={s.cards.map((c) => ({
              src: c.src,
              title: c.title,
              year: c.ep,
              href: c.href,
              active: c.slug === currentSlug,
            }))}
          />
        </div>
      ))}
    </section>
  );
}
