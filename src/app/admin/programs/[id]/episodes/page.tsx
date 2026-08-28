import { notFound, redirect } from "next/navigation";
import EpisodesList from "@/components/admin/programs/EpisodesList";
import { readProgramForEdit, readShowEpisodes } from "@/lib/admin/program-edit";
import { AdminAuthError } from "@/lib/admin/client";

// Episodes tab — list + create. Lists through the plugin's
// web/tv-show-episodes endpoint; a movie without a linked show gets the
// create-collection flow instead (the tv_show is made on demand now, not at
// program creation). The program is re-fetched here (the layout's copy isn't
// reachable from a server page) to resolve the linked tv_show id — a
// movie-program's episodes actually hang off its _khi_tv_show_id.
export default async function ProgramEpisodesTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId <= 0) notFound();

  let program;
  let episodes;
  try {
    program = await readProgramForEdit(programId);
    episodes = program?.showId ? await readShowEpisodes(program.showId) : [];
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }
  if (!program) notFound();

  return (
    <EpisodesList
      episodes={episodes}
      linked={program.showId > 0}
      programId={program.id}
      programTitle={program.title}
    />
  );
}
