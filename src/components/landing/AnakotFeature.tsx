import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import AnakotFeatureBanner from "@/components/home/sections/AnakotFeatureBanner";
import SeasonEpisodeCarousel from "@/components/program/SeasonEpisodeCarousel";
import type { AnakotFeature as AnakotFeatureData } from "@/lib/landing-data";

/** អនាគត's banner + season-tabbed episode rail — the same homepage block
 *  (HomeView.tsx), shown below the មាតិការសនិយម strip on every landing page
 *  at the owner's request (2026-08-27). Both halves degrade independently. */
export default function AnakotFeature({ anakot }: { anakot: AnakotFeatureData }) {
  return (
    <>
      {anakot.movie && <AnakotFeatureBanner movie={anakot.movie} />}
      {anakot.episodes.length > 0 && (
        <div className={cx(container, css({ paddingBottom: "8px" }))}>
          <SeasonEpisodeCarousel episodes={anakot.episodes} seeAllHref={anakot.href} unoptimized autoScrollMs={5000} />
        </div>
      )}
    </>
  );
}
