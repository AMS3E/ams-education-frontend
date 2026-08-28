import { css } from "@/styled-system/css";

const heading = css({
  margin: "26px 0 0",
  color: "text",
  fontWeight: 600,
  lineHeight: 1.35,
  fontSize: { base: "18px", md: "22px" },
});

const row = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px",
  marginTop: "10px",
  color: "muted",
  fontSize: "13px",
});

const sep = css({ opacity: 0.45 });

/**
 * The line under the player: "<show> - S1:E59 - <episode>", then run time and
 * release date, then the episode's own description when it has one.
 *
 * `runTime` comes from Vimeo and `releaseDate` is formatted in Phnom Penh time,
 * so both can legitimately differ from what the WordPress page prints — its
 * run times are hand-typed and often wrong, and it formats the release date in
 * UTC, which lands a day early. See src/lib/episode.ts.
 */
export default function EpisodeMeta({
  showTitle,
  episodeNumber,
  title,
  runTime,
  releaseDate,
  description = [],
}: {
  showTitle: string;
  episodeNumber: string;
  title: string;
  runTime: string;
  releaseDate: string;
  description?: string[];
}) {
  const facts = [runTime, releaseDate && `Added: ${releaseDate}`].filter(Boolean);

  return (
    <>
      <h1 className={heading}>{[showTitle, episodeNumber, title].filter(Boolean).join(" - ")}</h1>
      {facts.length > 0 && (
        <div className={row}>
          {facts.map((fact, i) => (
            <span key={fact} className={css({ display: "inline-flex", gap: "10px" })}>
              {i > 0 && <span className={sep}>|</span>}
              {fact}
            </span>
          ))}
        </div>
      )}
      {description.map((p, i) => (
        <p key={i} className={css({ marginTop: "12px", fontSize: "14px", lineHeight: 1.9, color: "muted" })}>
          {p}
        </p>
      ))}
    </>
  );
}
