import { notFound, redirect } from "next/navigation";
import { css } from "@/styled-system/css";
import ProgramTopBar from "@/components/admin/programs/ProgramTopBar";
import ProgramEditProvider from "@/components/admin/programs/ProgramEditContext";
import { readProgramForEdit, type EditableProgram } from "@/lib/admin/program-edit";
import { AdminAuthError } from "@/lib/admin/client";
import { programByPostId } from "@/lib/programs";

// Shared frame for a program's edit tabs. Loads the real program (movie or
// tv_show — the loader probes both) once for the whole editor and hands it to
// ProgramEditProvider, so the persistent top bar (title/status/Save) and the
// Details form share one copy. The top bar + tab nav live here and never
// re-mount when switching tabs; only `children` swap. The padded max-width
// column is provided once, so each tab just renders its cards.
export default async function ProgramEditLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId <= 0) notFound();

  let program: EditableProgram | null;
  try {
    program = await readProgramForEdit(programId);
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }
  if (!program) notFound();

  // Where the top bar's View button points. The public page is routed by the
  // REGISTRY's slug (the curated identity where one exists) — not the raw WP
  // post slug, and never the `link` permalink in the REST payload, which
  // points at WordPress itself. Only published movies are routed: drafts have
  // no public page, and a tv_show is an episode container, never a page.
  let publicPath = "";
  if (program.type === "movie" && program.status === "publish") {
    let slug = program.slug;
    try {
      slug = (await programByPostId(program.id))?.slug || slug;
    } catch {
      // Registry unreachable — fall back to the post slug (identical unless the
      // program is curated under another identity). A View link must never be
      // able to take down the editor.
    }
    if (slug) publicPath = `/program/${slug}`;
  }

  return (
    <ProgramEditProvider program={program} publicPath={publicPath}>
      <div className={css({ display: "flex", flexDirection: "column", flex: 1 })}>
        <ProgramTopBar />
        <div className={css({ padding: "28px 32px 56px" })}>
          <div className={css({ maxWidth: "900px", display: "flex", flexDirection: "column", gap: "16px" })}>
            {children}
          </div>
        </div>
      </div>
    </ProgramEditProvider>
  );
}
