import HeroEmbed from "@/components/home/HeroEmbed";
import AnakotFeatureBanner from "@/components/home/sections/AnakotFeatureBanner";
import BusinessInnovationSection from "@/components/home/sections/BusinessInnovationSection";
import DailyEventsSection from "@/components/home/sections/DailyEventsSection";
import EntertainmentSection from "@/components/home/sections/EntertainmentSection";
import FeaturedMovieHero from "@/components/program/FeaturedMovieHero";
import EpisodeCarousel from "@/components/program/EpisodeCarousel";
import SeasonEpisodeCarousel from "@/components/program/SeasonEpisodeCarousel";
import LatestNewsSection from "@/components/home/sections/LatestNewsSection";
import MatikaSection from "@/components/home/sections/MatikaSection";
import RealEstateFinanceSection from "@/components/home/sections/RealEstateFinanceSection";
import LifestyleSection from "@/components/home/sections/LifestyleSection";
import VideoFeatureStrip from "@/components/home/sections/VideoFeatureStrip";
import HealthSection from "@/components/home/sections/HealthSection";
import ObsokSection from "@/components/home/sections/ObsokSection";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveFullLandscape, reviveHalfLandscape } from "@/components/ads/revive/zones";
import SectionHeader from "@/components/ui/SectionHeader";
import TeamList from "@/components/landing/TeamList";
import { container } from "@/components/layout/shared";
import { css, cx } from "@/styled-system/css";
import { getFeaturedMovie, programHref } from "@/lib/programs";
import { fetchEpisodeRail } from "@/lib/episodes";
import { getTeam } from "@/lib/authors";
import { getHomeFeed } from "@/lib/home-data";

/** អនាគត — getFeaturedMovie's payload (title/description/color/watchHref) for
 *  this placement, rendered by AnakotFeatureBanner rather than
 *  FeaturedMovieHero: the live homepage's own "អនាគត" block is a plain white
 *  promo card (colour-badge title, copy, two buttons, a bare ▶ circle), not
 *  FeaturedMovieHero's full-bleed backdrop-image hero — see that component's
 *  header comment for why they're not the same shape.
 *
 *  postId 19929 REST-verified 2026-08-27 (`/wp/v2/movie/19929` → slug
 *  "anakot", link /program/anakot). Replaces the old pin of 2930, which on
 *  THIS backend resolves to ពន្លកបៃតង's movie post, not "Khmer Insider" — see
 *  navigation.ts's NAV_PILLS comment (ids 19929/2930/22197, REST- and
 *  shortcode-verified 2026-08-26), which is what surfaced the mismatch. */
const ANAKOT_FEATURED_MOVIE: { postId: number } = { postId: 19929 };

/** អនាគត's episode rail below the hero above, via fetchEpisodeRail's
 *  HTML-fragment endpoint (see that function's doc comment). `tvShowId` is
 *  pinned rather than looked up, same reason as ANAKOT_FEATURED_MOVIE: the
 *  movie post carries no visible show-id meta on this backend. Rendered by
 *  SeasonEpisodeCarousel, not EpisodeCarousel — the live rail's header is a
 *  season switcher ("រដូវកាលទី ១ / រដូវកាលទី ២"), not a plain heading.
 *
 *  21613 REST-verified 2026-08-27 (`/wp/v2/tv_show?slug=anakot` → id 21613,
 *  title "អនាគត"), and matches the live homepage's own
 *  `[cover-digital-program tvshow-id="21613" ...]` shortcode (see
 *  navigation.ts). Replaces the old pin of 21395 ("Khmer Insider"'s show,
 *  an Economy program with no counterpart here). */
const ANAKOT_RAIL = {
  programSlug: "anakot",
  tvShowId: 21613,
};

/** ពន្លកបៃតង — unlike អនាគត, the live homepage's own block for this program IS
 *  the standard Vodi "section-featured-movie" full-bleed hero (`section-
 *  featured-movie__inner`/`movie__poster`/`movie__body` markup, checked
 *  2026-08-27), so FeaturedMovieHero renders it as-is — no bespoke component
 *  needed here.
 *
 *  postId 2930 REST-verified (`/wp/v2/movie/2930` → slug "green-leaf") — the
 *  id that used to be wrongly pinned as ANAKOT_FEATURED_MOVIE's postId (see
 *  that constant's comment); it's ពន្លកបៃតង's own movie post, not Anakot's or
 *  Khmer Insider's. `bgImage` is the block's own pinned background
 *  (`background-image` on `.section-featured-movie`, not the movie post's own
 *  poster), read straight off the live markup — same reasoning as
 *  AnakotFeatureBanner's ANAKOT_BG, minus the 404: this one resolves fine. */
const GREENLEAF_FEATURED_MOVIE: { postId: number; bgImage: string } = {
  postId: 2930,
  bgImage: "https://s3.ams.com.kh/education/2023/02/03_GREEN-LEAF_HOME-PAGE.png",
};

/** ពន្លកបៃតង's episode rail — plain EpisodeCarousel, NOT SeasonEpisodeCarousel:
 *  unlike Anakot's, the live block for this rail has no season-tab UI at all
 *  (`epi-header`/`epi-title-header` + a single flat swiper — its container id
 *  is literally suffixed "-punlork-baitong-single"), even though the show's
 *  own episode data spans 3 real seasons (REST-verified via its episode
 *  links going up to /program/green-leaf/s3e26). SeasonEpisodeCarousel was
 *  tried here first and reverted — matching the live rail's own design beats
 *  a fancier switcher it doesn't have.
 *
 *  tvShowId 2534 REST-verified 2026-08-27: education.ams.com.kh's `tv_show`
 *  post type has only 10 entries total (`X-WP-Total: 10`), and the one
 *  titled "ពន្លកបៃតង" is id 2534 (slug "house-of-cards" — a stray leftover
 *  slug on this messy backend, not a real mismatch; title and postId 2930's
 *  own slug both confirm the show). */
const GREENLEAF_RAIL = { programSlug: "green-leaf", tvShowId: 2534 };

/**
 * The homepage body, shared by `/` (page one) and `/page/[n]` (the rest).
 *
 * IT LIVES HERE SO THE HOMEPAGE CAN BE PRERENDERED. The pager used to be
 * `?page=N`, read off the page's `searchParams` prop — and `searchParams` is a
 * request-time API, so touching it made `/` render per request and kept it out
 * of the prerender manifest entirely. That is only a problem in one window, but
 * a real one: with no prerendered copy there is no last-good page to fall back
 * on, so a WordPress outage beginning right after a deploy (before anything has
 * warmed the fetch cache) answers 500 rather than a stale homepage.
 *
 * Suspense does NOT fix that here. Wrapping the searchParams read in a boundary
 * so the rest of the page can prerender around it is Partial Prerendering, and
 * PPR only exists when `cacheComponents: true`. This app runs the classic ISR
 * model (see project-context §5), where reading searchParams anywhere in the
 * tree makes the whole route dynamic no matter where the boundary sits.
 *
 * So the page number moved into the URL PATH, which is what the category and
 * author pagers already do (`/category/…/page/3` — see splitPage). `/` now reads
 * no request-time API at all and prerenders; deeper pages are their own route
 * and stay server-rendered, so they are still crawlable and linkable.
 */
export default async function HomeView({ page }: { page: number }) {
  // `true`: ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ is this page's subject, so a failed read throws
  // and the last good homepage keeps serving. Every other section drops itself
  // when its data is missing — nothing on this page is ever stood in for.
  const [feed, anakotMovie, greenLeafMovie, anakotRail, greenLeafRail, team] =
    await Promise.all([
      getHomeFeed(page, true),
      getFeaturedMovie(ANAKOT_FEATURED_MOVIE.postId),
      getFeaturedMovie(GREENLEAF_FEATURED_MOVIE.postId),
      fetchEpisodeRail(ANAKOT_RAIL.tvShowId),
      fetchEpisodeRail(GREENLEAF_RAIL.tvShowId),
      getTeam(),
    ]);

  return (
    <>
      <HeroEmbed />
      <DailyEventsSection
        cards={feed.daily.cards}
        page={feed.daily.page}
        totalPages={feed.daily.totalPages}
        pageStyle="segment"
      />
      <LatestNewsSection latest={feed.latestNews} recent={feed.recentArticles} />
      <BusinessInnovationSection youth={feed.youth} scholarshipNews={feed.scholarshipNews} />
      <RealEstateFinanceSection scholarships={feed.scholarships} awards={feed.awards} talent={feed.talent} nationalNews={feed.nationalNews} />
      <LifestyleSection items={feed.childrenEducation} />
      <EntertainmentSection items={feed.skills} />
      <MatikaSection heading={feed.matika.heading} tabs={feed.matika.tabs} />
      {anakotMovie && <AnakotFeatureBanner movie={anakotMovie} />}
      {anakotRail.episodes.length > 0 && (
        <div className={cx(container, css({ paddingBottom: "8px" }))}>
          <SeasonEpisodeCarousel
            episodes={anakotRail.episodes.map((e) => ({
              slug: `episode-${e.id}`,
              href: e.href,
              src: e.thumbnail,
              title: e.title,
              ep: e.label,
            }))}
            seeAllHref={programHref(ANAKOT_RAIL.programSlug)}
            unoptimized
            autoScrollMs={5000}
          />
        </div>
      )}
      {greenLeafMovie && (
        <FeaturedMovieHero movie={greenLeafMovie} style={{ backgroundImage: GREENLEAF_FEATURED_MOVIE.bgImage }} />
      )}
      {greenLeafRail.episodes.length > 0 && (
        <div className={cx(container, css({ paddingBottom: "8px" }))}>
          <EpisodeCarousel
            episodes={greenLeafRail.episodes.map((e) => ({
              slug: `episode-${e.id}`,
              href: e.href,
              src: e.thumbnail,
              title: e.title,
              ep: e.label,
            }))}
            title="កម្មវិធីពន្លកបៃតង"
            seeAllHref={programHref(GREENLEAF_RAIL.programSlug)}
            unoptimized
            autoScrollMs={5000}
          />
        </div>
      )}
      <div
        className={cx(
          container,
          css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", lg: "minmax(0,2fr) minmax(0,1fr)" },
            gap: "34px",
            alignItems: "start",
            paddingBottom: "44px",
          }),
        )}
      >
        <ReviveAdSlot zone={reviveHalfLandscape} />
        <div>
          <SectionHeader title="ក្រុមការងារ" titleSize="22px" seeAllHref="/author" />
          <TeamList members={team} />
        </div>
      </div>
      <div className={cx(container, css({ paddingBottom: "8px" }))}>
        <ReviveAdSlot zone={reviveFullLandscape} />
      </div>
      <VideoFeatureStrip program={feed.featured} />
      {/* From the first episode, not the latest — the homepage shelf presents the
          show as a series to start. The program/episode pages use healthGrid. */}
      <HealthSection items={feed.healthFromStart} />
      <ObsokSection items={feed.obsokGrid} />
    </>
  );
}
