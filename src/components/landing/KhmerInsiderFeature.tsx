import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import FeaturedMovieHero, { type FeaturedMovieStyle } from "@/components/program/FeaturedMovieHero";
import EpisodeCarousel from "@/components/program/EpisodeCarousel";
import { fetchEpisodeRail } from "@/lib/episodes";
import { getFeaturedMovie, programHref } from "@/lib/programs";

// WordPress stores the movie, tv_show, and composed hero art as three separate
// records. These are the same verified Khmer Insider pins used on the homepage.
const MOVIE_POST_ID = 2930;
const HERO_IMAGE_ID = 79854;
const TV_SHOW_ID = 21395;
const PROGRAM_SLUG = "khmer-insider";

const heroStyle = {
  titleColor: "#a09e96",
  titleTextColor: "#161515",
  iconColor: "#777707",
  playlistButtonColor: "rgba(206, 193, 193, 0.7)",
  playlistButtonBorderColor: "rgba(206, 193, 193, 0.7)",
  playlistButtonTextColor: "#161515",
  iconPadding: "20px 40px",
  iconPosition: "center",
  iconOffsetX: "61%",
  iconOffsetY: "37%",
  watchButtonColor: "#a09e96",
  descriptionColor: "#161515",
} satisfies FeaturedMovieStyle;

/** Khmer Insider hero plus its real episode rail, used below the landing-page
 * latest-articles tabs. Both reads degrade independently to an empty section. */
export default async function KhmerInsiderFeature() {
  const [movie, rail] = await Promise.all([
    getFeaturedMovie(MOVIE_POST_ID, HERO_IMAGE_ID),
    fetchEpisodeRail(TV_SHOW_ID),
  ]);

  if (!movie && rail.episodes.length === 0) return null;

  return (
    <div className={css({ marginTop: "44px" })}>
      {movie && <FeaturedMovieHero movie={movie} style={heroStyle} />}
      {rail.episodes.length > 0 && (
        <div className={cx(container, css({ paddingBottom: "8px" }))}>
          <EpisodeCarousel
            episodes={rail.episodes.map((episode) => ({
              slug: `episode-${episode.id}`,
              href: episode.href,
              src: episode.thumbnail,
              title: episode.title,
              ep: episode.label,
            }))}
            title="កម្មវិធីពិសេស Khmer insider"
            seeAllHref={programHref(PROGRAM_SLUG)}
            unoptimized
            autoScrollMs={5000}
          />
        </div>
      )}
    </div>
  );
}
