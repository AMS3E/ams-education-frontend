import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import FeaturedMovieHero from "@/components/program/FeaturedMovieHero";
import EpisodeCarousel from "@/components/program/EpisodeCarousel";
import { GREENLEAF_BG_IMAGE, type GreenLeafFeature as GreenLeafFeatureData } from "@/lib/landing-data";

/** ពន្លកបៃតង's hero + flat episode rail — the same homepage block
 *  (HomeView.tsx), shown below `AnakotFeature` on every landing page at the
 *  owner's request (2026-08-27). Both halves degrade independently. */
export default function GreenLeafFeature({ greenLeaf }: { greenLeaf: GreenLeafFeatureData }) {
  return (
    <>
      {greenLeaf.movie && <FeaturedMovieHero movie={greenLeaf.movie} style={{ backgroundImage: GREENLEAF_BG_IMAGE }} />}
      {greenLeaf.episodes.length > 0 && (
        <div className={cx(container, css({ paddingBottom: "8px" }))}>
          <EpisodeCarousel
            episodes={greenLeaf.episodes}
            title="កម្មវិធីពន្លកបៃតង"
            seeAllHref={greenLeaf.href}
            unoptimized
            autoScrollMs={5000}
          />
        </div>
      )}
    </>
  );
}
