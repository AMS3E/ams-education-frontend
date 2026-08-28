import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";

const grid = css({
  display: "grid",
  gap: { base: "24px", md: "44px" },
  alignItems: "start",
  paddingTop: "32px",
});

const withPoster = css({ gridTemplateColumns: { base: "1fr", md: "280px 1fr" } });
const withoutPoster = css({ gridTemplateColumns: "1fr" });

/** The poster hangs UP out of this section and over the hero band, as in the
 *  design. The pull is `-(section padding + overlap)`, so the card's top lands
 *  ~72px inside a 350px hero while the text column still starts below it.
 *
 *  Only on md+: on a phone the hero is already cropped hard and an overlapping
 *  card just collides with it, so there the poster sits normally, centred. */
const posterCard = css({
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: { base: "220px", md: "none" },
  mx: { base: "auto", md: "0" },
  marginTop: { base: "0", md: "-104px" },
  aspectRatio: "2/3",
  overflow: "hidden",
  borderRadius: "6px",
  boxShadow: "0 18px 40px rgba(0,0,0,.35)",
});

const heading = css({
  margin: "0 0 14px",
  fontSize: { base: "26px", md: "38px" },
  fontWeight: 800,
  lineHeight: 1.2,
  color: "text",
});

/** Year · schedule, on one line, separated by a hairline rule. Wraps rather than
 *  truncating: the schedule strings run long in Khmer. */
const metaRow = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "14px",
  margin: "0 0 22px",
  fontSize: "13px",
  color: "muted",
});

const metaItem = css({
  display: "flex",
  alignItems: "center",
  gap: "14px",
  // The separator sits BEFORE each item and is suppressed on the first, so a
  // missing field never leaves a dangling rule.
  "&:not(:first-child)::before": {
    content: '""',
    display: "block",
    width: "1px",
    height: "13px",
    background: "divider",
  },
});

const paragraph = css({
  margin: "0 0 14px",
  fontSize: "14px",
  lineHeight: 1.9,
  color: "muted",
  _last: { marginBottom: 0 },
});

/**
 * The program's identity block: poster, title, credits, description.
 *
 * This carries the page's <h1>. ProgramHero deliberately doesn't — its key art
 * already has the programme's wordmark baked into the pixels, so a title painted
 * over it would say the same thing twice.
 *
 * Every field below the title is optional and simply omitted when WordPress has
 * nothing for it: `description` is empty for two programs (learn-the-world,
 * jroung-phnom-penh), `poster` is empty for vanna-yeatra — whose featured image is
 * landscape key art, used as the hero backdrop instead — `year` is set on 18 of 19
 * and `schedule` on 16. vanna-yeatra has none of the three, so it renders as title
 * + description alone.
 *
 * There is no producer credit, though the design has one: MasVideos' `_cast` and
 * `_crew` are empty on every program on this site. Fill them in WP admin and it
 * can come back.
 */
export default function ProgramAbout({
  title,
  description,
  poster,
  year,
  schedule,
}: {
  title: string;
  description: string[];
  poster: string;
  year: string;
  schedule: string;
}) {
  const meta = [year, schedule].filter(Boolean);

  return (
    <section className={cx(grid, poster ? withPoster : withoutPoster)}>
      {/* No poster: the card is dropped entirely rather than rendered as an empty
          grey box, and the text takes the full width. */}
      {poster && (
        <div className={posterCard}>
          <CoverImage src={poster} alt={title} sizes='(max-width: 768px) 220px, 280px' />
        </div>
      )}

      <div>
        <h1 className={heading}>{title}</h1>

        {meta.length > 0 && (
          <div className={metaRow}>
            {meta.map(m => (
              <span key={m} className={metaItem}>
                {m}
              </span>
            ))}
          </div>
        )}

        {description.map((p, i) => (
          <p key={i} className={paragraph}>
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
