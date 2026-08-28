import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KhmerInsiderWatchPage from "@/components/program/KhmerInsiderWatchPage";
import { getProgramWatchData } from "@/lib/khmer-insider";
import { routedProgram } from "@/lib/programs";
import { withMinDuration } from "@/lib/timing";

// loading.tsx stays up at least this long once the page component actually
// runs (first visit / background ISR regen), so a lucky-fast fetch chain
// doesn't read as a flicker. Well under the real cold-render cost (getProgramWatchData
// is 2+ serial WP round trips, seconds not ms), so it only ever adds delay on
// the rare fast case.
const MIN_LOADING_MS = 400;

type Params = { params: Promise<{ slug: string; episode: string }> };

// ISR without a timer; WordPress episode/program saves invalidate fetch tags.
export const revalidate = false;

// Episode pages are generated on first visit, then cached.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, episode } = await params;
  if (!(await routedProgram(slug))) return {};

  const data = await getProgramWatchData(slug, episode);
  if (!data.current) notFound();
  return { title: `${data.current.label} — ${data.current.title}` };
}

export default async function EpisodePageRoute({ params }: Params) {
  const { slug, episode } = await params;
  const data = await withMinDuration(getProgramWatchData(slug, episode), MIN_LOADING_MS);
  if (!data.current) notFound();

  return (
    <KhmerInsiderWatchPage
      programSlug={slug}
      program={data.program}
      episode={data.episode}
      programVideo={data.programVideo}
      episodes={data.episodes}
      videoCover={data.videoCover}
      currentEpisode={data.current}
    />
  );
}
