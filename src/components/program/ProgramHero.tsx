import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";

/** The key art is 2560x398 (~6.4:1), so at a fixed 350px this band is taller than
 *  the art's ratio on any viewport narrower than ~2250px, and `cover` crops the
 *  sides to fill it. That's fine: every cover puts its wordmark and tagline in the
 *  middle, which is the part a centre crop keeps.
 *
 *  The gradient is the base layer under the art, so a slow or broken image never
 *  leaves a bare rectangle — and it's the whole band when there's no art at all. */
const band = css({
  position: "relative",
  width: "100%",
  height: "350px",
  overflow: "hidden",
  backgroundImage:
    "radial-gradient(120% 140% at 50% 0%, token(colors.programHero.from) 0%, token(colors.programHero.mid) 45%, token(colors.programHero.to) 100%)",
});

// Faint vertical rules, as in the design. Only when there's no art — over a photo
// they read as noise.
const rules = css({
  position: "absolute",
  inset: 0,
  backgroundImage: "repeating-linear-gradient(90deg, token(colors.divider) 0 1px, transparent 1px 60px)",
  opacity: 0.5,
});

const art = css({ position: "absolute", inset: 0 });

/** A poster is portrait and this band is wide, so it can only work as a texture:
 *  blown up, blurred, pushed back. `scale` crops off the blur's soft edges. */
const posterArt = cx(art, css({ filter: "blur(28px) saturate(1.15)", transform: "scale(1.15)", opacity: 0.55 }));

/** Settles the blurred poster into the page below. Key art needs no scrim — it's a
 *  finished banner, and nothing is drawn on top of it. */
const scrim = css({
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.3) 45%, token(colors.programHero.to) 100%)",
});

/**
 * The program page's opening band: the program's own key art, full bleed.
 *
 * All 19 programs have key art (Vodi's `_vodi_<type>_bg_image`), and every one of
 * it is a FINISHED banner — the program's name and a Khmer tagline are baked into
 * the pixels; the files are literally named `*_COVER-With-Text_*`. So the band is
 * just the art, and no type is ever painted over it. Same lesson as the homepage's
 * featured-program banner.
 *
 * Purely decorative, therefore: the title lives in ProgramAbout, which overlaps
 * this band and carries the page's <h1>.
 *
 * Two fallbacks, neither of which fires today, for a program added later with no
 * backdrop: its portrait poster blurred into a texture, and failing that the bare
 * gradient.
 */
export default function ProgramHero({ backdrop = "", poster = "" }: { backdrop?: string; poster?: string }) {
  return (
    <section className={band} aria-hidden>
      {backdrop ? (
        <div className={art}>
          <CoverImage src={backdrop} alt='' sizes='100vw' priority />
        </div>
      ) : poster ? (
        <>
          <div className={posterArt}>
            <CoverImage src={poster} alt='' sizes='100vw' />
          </div>
          <div className={scrim} />
        </>
      ) : (
        <div className={rules} />
      )}
    </section>
  );
}
