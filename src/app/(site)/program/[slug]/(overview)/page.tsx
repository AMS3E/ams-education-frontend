import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KhmerInsiderWatchPage from "@/components/program/KhmerInsiderWatchPage";
import { getProgramWatchData } from "@/lib/khmer-insider";
import { getProgramSlugs, routedProgram } from "@/lib/programs";
import { withMinDuration } from "@/lib/timing";

type Params = { params: Promise<{ slug: string }> };

// ISR without a timer; WordPress program/episode saves invalidate fetch tags.
export const revalidate = false;
export const dynamicParams = true;

// Same reasoning as [episode]/page.tsx: floors loading.tsx's visible time so a
// lucky-fast resolve (new program on first visit, or a background ISR regen)
// doesn't read as a flicker.
const MIN_LOADING_MS = 400;

export async function generateStaticParams() {
  return (await getProgramSlugs()).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const ref = await routedProgram(slug);
  if (!ref) notFound();
  return { title: ref.title };
}

/** Every WordPress Program uses the same watch-page template. Program identity,
 * metadata, artwork, linked show and episode rail all resolve from ProgramRef. */
export default async function ProgramPage({ params }: Params) {
  const { slug } = await params;
  const data = await withMinDuration(getProgramWatchData(slug), MIN_LOADING_MS);

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
