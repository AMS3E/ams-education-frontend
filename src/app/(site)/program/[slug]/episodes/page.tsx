import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { css, cx } from "@/styled-system/css";
import SeasonGrid from "@/components/episode/SeasonGrid";
import { container } from "@/components/layout/shared";
import { episodeFromRail, fetchEpisodeRail, groupSeasons } from "@/lib/episodes";
import { getProgramSlugs, programHref, routedProgram } from "@/lib/programs";

// Every episode of a show, grouped by season — the page the season grid's
// "មើលទាំងអស់ (617)" actually delivers on. Before this existed that link landed
// on the program page's 18-card carousel, and nothing anywhere listed a show in
// full.
//
// A static `episodes` segment beats the sibling [episode] dynamic route, so
// /program/daily-feed/episodes resolves here, not to an episode named
// "episodes" (no show mints that slug — they're all s1e5-shaped or numeric).
type Params = { params: Promise<{ slug: string }> };

// ISR without a timer; WordPress episode saves invalidate the `episodes` tag.
export const revalidate = false;

// Same reasoning as the program page: the registry is dynamic now, so known
// programs prebuild and new ones render on first visit; a bogus slug 404s in
// generateMetadata, before anything streams.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getProgramSlugs()).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const ref = await routedProgram(slug);
  if (!ref) notFound();
  return { title: `វគ្គទាំងអស់ — ${ref.title}` };
}

const crumb = css({ color: "muted", textDecoration: "none", _hover: { color: "brand.blue" } });

export default async function AllEpisodesPage({ params }: Params) {
  const { slug } = await params;
  const ref = await routedProgram(slug);
  if (!ref) notFound();

  const rail = ref.showId ? await fetchEpisodeRail(ref.showId) : { episodes: [] };
  const episodes = rail.episodes.map(episodeFromRail);

  return (
    <div className={cx(container, css({ paddingBottom: "60px" }))}>
      <nav
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "7px",
          fontSize: "12.5px",
          color: "muted",
          marginTop: "22px",
        })}>
        <Link href='/' className={crumb}>
          ទំព័រដើម
        </Link>
        <span className={css({ opacity: 0.6 })}>›</span>
        <Link href={programHref(ref.slug)} className={crumb}>
          {ref.title}
        </Link>
        <span className={css({ opacity: 0.6 })}>›</span>
        <span className={css({ color: "brand.blue" })}>វគ្គទាំងអស់</span>
      </nav>

      <h1 className={css({ fontSize: { base: "22px", md: "28px" }, fontWeight: 700, marginTop: "18px" })}>
        {ref.title} — វគ្គទាំងអស់ ({episodes.length})
      </h1>

      {episodes.length === 0 ? (
        <p className={css({ color: "muted", fontSize: "14px", padding: "48px 0", textAlign: "center" })}>
          មិនទាន់មានវគ្គសម្រាប់កម្មវិធីនេះទេ។
        </p>
      ) : (
        groupSeasons(episodes).map(season => (
          <SeasonGrid
            key={season.number}
            episodes={season.episodes}
            programSlug={ref.slug}
            currentId={0}
            seasonName={season.name}
            max={Infinity}
          />
        ))
      )}
    </div>
  );
}
