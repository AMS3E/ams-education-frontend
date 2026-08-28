import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import PosterCarousel from "@/components/home/PosterCarousel";
import { programHref } from "@/lib/programs";
import type { FeaturedProgram } from "@/lib/navigation";

/** សម្រាប់លោកអ្នក — the landing pages' program carousel.
 *
 *  Not the homepage's PosterBand: that is a dark full-width band with its title
 *  stacked above a full-width track. This one is a light band whose heading,
 *  blurb, arrows and "see all" sit in a rail to the LEFT of the track. */
export default function ProgramBand({ programs }: { programs: FeaturedProgram[] }) {
  // `hero.bg`, not a literal gray: it is the site's theme-aware light band (the
  // category page's title strip uses it too), so this section doesn't stay
  // off-white in dark mode.
  return (
    <div className={css({ background: "hero.bg", width: "100%", marginTop: "45px", padding: "40px 0" })}>
      <div className={cx(container)}>
        <PosterCarousel
          aside={{ title: "សម្រាប់លោកអ្នក", subtitle: "កម្មវិធីពិសេសរបស់ AMS INFOTAINMENT" }}
          posters={programs.map((p) => ({
            src: p.image,
            title: p.title,
            year: p.year,
            href: programHref(p.slug),
          }))}
        />
      </div>
    </div>
  );
}
