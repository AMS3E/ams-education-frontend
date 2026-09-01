"use client";

import Link from "next/link";
import { useState } from "react";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import type { RailEpisode } from "@/lib/episodes";

const selectWrap = css({ position: "relative", width: { base: "100%", sm: "165px" } });
const select = css({
  width: "100%",
  height: "58px",
  appearance: "none",
  border: "2px solid",
  borderColor: "divider",
  borderRadius: "3px",
  background: "page.bg",
  color: "muted",
  px: "18px",
  pr: "42px",
  fontFamily: "inherit",
  fontSize: "15px",
  cursor: "pointer",
  outline: "none",
  _focusVisible: { borderColor: "brand.orange" },
});
const caret = css({
  position: "absolute",
  right: "17px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "muted",
  fontSize: "12px",
  pointerEvents: "none",
});
const panel = css({
  marginTop: "12px",
  height: { base: "520px", lg: "724px" },
  overflowY: "auto",
  background: { base: "#efefef", _dark: "#191a20" },
  scrollbarWidth: "auto",
  scrollbarColor: "#b7bec7 #efefef",
  "&::-webkit-scrollbar": { width: "10px" },
  "&::-webkit-scrollbar-track": { background: "#efefef" },
  "&::-webkit-scrollbar-thumb": {
    background: "#b7bec7",
    borderRadius: "6px",
    border: "2px solid #efefef",
  },
  "&::-webkit-scrollbar-thumb:hover": { background: "#97a1ad" },
});
const head = css({ padding: "12px 16px 10px" });
const title = css({ margin: 0, fontSize: "24px", lineHeight: 1.3, fontWeight: 400, color: "muted" });
const schedule = css({ margin: "2px 0 0", fontSize: "10px", lineHeight: 1.6, color: "muted" });
const list = css({ listStyle: "none", margin: 0, padding: 0 });
const row = css({
  display: "grid",
  gridTemplateColumns: "92px minmax(0, 1fr)",
  gap: "10px",
  alignItems: "center",
  minHeight: "78px",
  padding: "12px 16px",
  borderBottom: { base: "1px solid #d1d9e2", _dark: "1px solid #343640" },
  transition: "background .18s ease",
  _hover: { background: { base: "#dedede", _dark: "#24252d" } },
  '&[aria-current="page"]': { background: { base: "#dadada", _dark: "#292b34" } },
});
const thumb = css({
  position: "relative",
  width: "92px",
  height: "52px",
  overflow: "hidden",
  background: "#000",
  "& img": { objectFit: "contain" },
});
const episodeInfo = css({ flex: 1, minWidth: 0 });
const episodeTitle = css({
  margin: 0,
  fontSize: "12px",
  lineHeight: 1.5,
  color: "text",
  lineClamp: "2",
});
const meta = css({ margin: "3px 0 0", fontSize: "10px", lineHeight: 1.4, color: "muted" });

/**
 * Legacy program links are not consistent: newer seasons use `/s2e28`, while
 * the original season often uses only `/e20`. In that second form, 20 is the
 * episode number, not the season number. Prefer the permalink when it carries
 * that distinction and keep the artwork-derived label as the fallback for
 * programs whose links do not encode an episode pair.
 */
function seasonOf(episode: RailEpisode): number {
  const slug = episode.href.split("/").filter(Boolean).at(-1) ?? "";
  const labelledLink = slug.match(/^s(\d+)e\d+$/i);
  if (labelledLink) return Number(labelledLink[1]);
  if (/^e\d+$/i.test(slug)) return 1;
  // Eco presents unlabelled legacy episodes as season 1 rather than exposing
  // a “no season number” option to visitors.
  return Number(episode.label.match(/^S(\d+)(?::E\d+)?$/i)?.[1] ?? 1);
}

export default function KhmerInsiderSidebar({
  programSlug,
  episodes = [],
  title: showTitle,
  schedule: showSchedule,
  currentEpisodeId,
}: {
  programSlug: string;
  episodes: RailEpisode[];
  title: string;
  schedule: string;
  currentEpisodeId?: number;
}) {
  const seasons = [...episodes.reduce((groups, episode) => {
    const season = seasonOf(episode);
    const group = groups.get(season) ?? [];
    group.push(episode);
    groups.set(season, group);
    return groups;
  }, new Map<number, RailEpisode[]>())].map(([number, cards]) => ({ number, cards }));
  const selectedSeason = seasons.findIndex(season =>
    season.cards.some(episode => episode.id === currentEpisodeId),
  );
  const [active, setActive] = useState(selectedSeason >= 0 ? selectedSeason : 0);
  const current = seasons[active];

  if (!current) return null;

  const internalHref = (episode: RailEpisode) => {
    const labelledSlug = episode.label.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const liveSlug = episode.href.split("/").filter(Boolean).at(-1);
    const episodeSlug = labelledSlug || (liveSlug !== programSlug ? liveSlug : "") || String(episode.id);
    return episodeSlug ? `/program/${programSlug}/${episodeSlug}` : `/program/${programSlug}`;
  };
  const khmerNumber = (number: number) =>
    String(number).replace(/\d/g, digit => "០១២៣៤៥៦៧៨៩"[Number(digit)]);

  return (
    <aside>
      <div className={selectWrap}>
        <select
          className={select}
          value={active}
          onChange={(event) => setActive(Number(event.target.value))}
          aria-label="ជ្រើសរើសរដូវកាល"
        >
          {seasons.map((season, index) => (
            <option key={`${season.number}-${index}`} value={index}>
              រដូវកាលទី {khmerNumber(season.number)}
            </option>
          ))}
        </select>
        <span className={caret} aria-hidden>▼</span>
      </div>

      <div className={panel}>
        <div className={head}>
          <h2 className={title}>{showTitle}</h2>
          {showSchedule && <p className={schedule}>{showSchedule}</p>}
        </div>
        <ul className={list}>
          {current.cards.map((episode) => (
            <li key={episode.id}>
              <Link
                href={internalHref(episode)}
                className={row}
                aria-current={episode.id === currentEpisodeId ? "page" : undefined}
              >
                <span className={thumb}>
                  <CoverImage src={episode.thumbnail} alt="" sizes="92px" unoptimized />
                </span>
                <div className={cx("episode-info", episodeInfo)}>
                  <p className={cx("episode-title", episodeTitle)}>{episode.title}</p>
                  {episode.meta && <p className={cx("episode-meta", meta)}>{episode.meta}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
