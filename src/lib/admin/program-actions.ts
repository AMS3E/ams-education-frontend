"use server";

// Server Action for the Programs editor. The Details form (a Client Component)
// collects its fields into a ProgramPayload; this validates, writes through
// core wp/v2/movie|tv_show as the logged-in user, and refreshes the public
// program page's cache tag when the program is live on the site.

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import {
  updateProgram,
  updateProgramStatus,
  createProgram,
  createShowForProgram,
  createEpisode,
  updateEpisode,
  readEpisodeForEdit,
  trashProgramPost,
  isTrashed,
  readProgramForEdit,
  isoDateToTs,
  type ProgramType,
  type EditableEpisode,
} from "./program-edit";
import { AdminAuthError, AdminApiError } from "./client";
import { programByPostId } from "@/lib/programs";

export interface ProgramPayload {
  title: string;
  description: string;
  /** "YYYY-MM-DD" or "". */
  releaseDate: string;
  schedule: string;
  /** Attachment ids from the media picker; 0 = unset/clear. */
  posterId: number;
  backdropId: number;
  /** Movies only. */
  video?: { choice: string; url: string; embed: string };
}

export interface ProgramSaveResult {
  ok: boolean;
  error?: string;
  status?: string;
}

export interface ProgramCreateResult {
  ok: boolean;
  error?: string;
  /** The new movie post id — the editor route to land on. */
  id?: number;
}

/** Create a program — its movie post only (the episode container is created
 *  on demand from the Episodes tab). Draft stays dashboard-only; publish puts
 *  /program/<slug> on the live site immediately via the dynamic registry. */
export async function createProgramAction(
  payload: ProgramPayload & { slug: string; status: "draft" | "publish" },
): Promise<ProgramCreateResult> {
  const title = payload.title.trim();
  if (!title) return { ok: false, error: "Give the program a title first." };
  const status = payload.status === "publish" ? "publish" : "draft";

  const slug = payload.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return { ok: false, error: "Give it a Latin URL slug (letters, digits, hyphens) — Khmer titles can't auto-slug." };
  }

  const releaseTs = isoDateToTs(payload.releaseDate);
  if (releaseTs === null) return { ok: false, error: "Release date must be YYYY-MM-DD (or blank)." };

  try {
    const created = await createProgram({
      title,
      slug,
      status,
      description: payload.description,
      releaseTs,
      schedule: payload.schedule.trim(),
      posterId: payload.posterId,
      backdropId: payload.backdropId,
      video: payload.video,
    });
    // A published create is live routing news — refresh the public registry
    // (poster surfaces + /program/<slug>). Drafts touch nothing public.
    if (status === "publish") revalidateTag("program-registry", "max");
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    if (e instanceof AdminApiError) {
      console.warn(`[createProgram] WP ${e.status} on ${e.path}: ${e.detail}`);
      return { ok: false, error: `WordPress rejected the create (${e.status} on ${e.path}). Check the server console for WP's message.` };
    }
    // Not an HTTP rejection: a timeout (WP save hooks — e.g. the Khmer→slug
    // Google-Translate plugin — can run long), unparseable response, or a
    // network drop. Surface the real reason; this is an internal tool.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn(`[createProgram] ${msg}`);
    return { ok: false, error: `Couldn't create the program — ${msg}` };
  }
}

/** Create the program's episode container (DRAFT tv_show + the movie's
 *  _khi_tv_show_id pointer) from the Episodes tab. The id is re-resolved
 *  server-side — the client only says WHICH program. The draft create is
 *  quick; the link write can still be slow when the program is published, so
 *  the tab keeps its spinner. */
export async function createShowAction(programId: number): Promise<ProgramCreateResult> {
  try {
    const program = await readProgramForEdit(programId);
    if (!program || program.type !== "movie") {
      return { ok: false, error: "Only a movie-type program can get an episode collection." };
    }
    if (program.showId > 0) return { ok: true, id: program.showId }; // already linked — idempotent
    if (!program.slug) return { ok: false, error: "This program has no slug yet — save it once first." };

    const { showId } = await createShowForProgram({ id: program.id, title: program.title, slug: program.slug });
    return { ok: true, id: showId };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    if (e instanceof AdminApiError) {
      console.warn(`[createShow] WP ${e.status} on ${e.path}: ${e.detail}`);
      return { ok: false, error: `WordPress rejected it (${e.status}). Check the server console for the reason.` };
    }
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn(`[createShow] ${msg}`);
    return { ok: false, error: `Couldn't create the episode collection — ${msg}` };
  }
}

/** What the New-episode dialog collects. */
export interface EpisodePayload {
  season: number;
  episode: number;
  title: string;
  videoUrl: string;
  /** "YYYY-MM-DD" or "". */
  releaseDate: string;
  runTime: string;
  thumbId: number;
}

/** Create a published episode under the program's show. Re-resolves the
 *  program server-side to get the show id + a stable slug seed. */
/** Shared validation for the episode dialog's create AND edit paths. Returns
 *  an error message, or the normalized values. */
function normalizeEpisode(
  payload: EpisodePayload,
):
  | { error: string }
  | { error?: undefined; title: string; season: number; episode: number; videoUrl: string; releaseTs: number } {
  const title = payload.title.trim();
  if (!title) return { error: "Give the episode a title first." };
  const season = Math.trunc(payload.season);
  const episode = Math.trunc(payload.episode);
  if (season < 1 || season > 99) return { error: "Season must be between 1 and 99." };
  if (episode < 1 || episode > 9999) return { error: "Episode number must be between 1 and 9999." };
  const videoUrl = payload.videoUrl.trim();
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
    return { error: "The video URL must start with http(s)://." };
  }
  const releaseTs = isoDateToTs(payload.releaseDate);
  if (releaseTs === null) return { error: "Release date must be YYYY-MM-DD (or blank)." };
  return { title, season, episode, videoUrl, releaseTs };
}

/** Shared catch for the program/episode actions: an expired session goes to
 *  login, a WP rejection reports its status, anything else (timeout on a slow
 *  publish hook, network drop) surfaces the real reason — this is an internal
 *  tool, a generic "try again" just hides the cause. */
function programFail(tag: string, e: unknown, what: string): ProgramCreateResult {
  if (e instanceof AdminAuthError) redirect("/login");
  if (e instanceof AdminApiError) {
    console.warn(`[${tag}] WP ${e.status} on ${e.path}: ${e.detail}`);
    return { ok: false, error: `WordPress rejected it (${e.status}). Check the server console for the reason.` };
  }
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.warn(`[${tag}] ${msg}`);
  return { ok: false, error: `${what} — ${msg}` };
}

export async function createEpisodeAction(programId: number, payload: EpisodePayload): Promise<ProgramCreateResult> {
  const v = normalizeEpisode(payload);
  if (v.error !== undefined) return { ok: false, error: v.error };
  const { title, season, episode, videoUrl, releaseTs } = v;

  try {
    const program = await readProgramForEdit(programId);
    if (!program) return { ok: false, error: "Program not found." };
    if (program.showId <= 0) return { ok: false, error: "This program has no episode collection yet." };

    const created = await createEpisode({
      showId: program.showId,
      label: `S${season}:E${episode}`,
      slug: `${program.slug || `program-${program.id}`}-s${season}e${episode}`,
      title,
      videoUrl,
      releaseTs,
      runTime: payload.runTime.trim(),
      thumbId: payload.thumbId,
    });
    // The public episode surfaces are busted by the WP plugin's publish
    // webhook; mirror it locally so this deployment refreshes even if the
    // webhook is down: the show's episode lists + the episodes index.
    revalidateTag("episodes", "max");
    revalidateTag(`tv-show:${program.showId}`, "max");
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    if (e instanceof AdminApiError) {
      console.warn(`[createEpisode] WP ${e.status} on ${e.path}: ${e.detail}`);
      return { ok: false, error: `WordPress rejected the episode (${e.status}). Check the server console for the reason.` };
    }
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn(`[createEpisode] ${msg}`);
    return { ok: false, error: `Couldn't create the episode — ${msg}` };
  }
}

/** Load one episode's editable state for the Edit-episode dialog. Always
 *  fresh — the always-fresh rule: anything about to be EDITED is never served
 *  from a cache (overwrite risk). */
export async function loadEpisodeAction(
  episodeId: number,
): Promise<{ ok: boolean; error?: string; episode?: EditableEpisode }> {
  try {
    const episode = await readEpisodeForEdit(episodeId);
    if (!episode) return { ok: false, error: "Episode not found — it may have been trashed already." };
    return { ok: true, episode };
  } catch (e) {
    return programFail("loadEpisode", e, "Couldn't load the episode");
  }
}

/** Save an edited episode: title, label, video, date, duration, thumbnail.
 *  The slug and the published status stay put (see EpisodeWrite) so
 *  renumbering never breaks a live URL. */
export async function updateEpisodeAction(
  programId: number,
  episodeId: number,
  payload: EpisodePayload,
): Promise<ProgramCreateResult> {
  const v = normalizeEpisode(payload);
  if (v.error !== undefined) return { ok: false, error: v.error };
  const { title, season, episode, videoUrl, releaseTs } = v;

  try {
    const program = await readProgramForEdit(programId);
    if (!program) return { ok: false, error: "Program not found." };

    await updateEpisode(episodeId, {
      label: `S${season}:E${episode}`,
      title,
      videoUrl,
      releaseTs,
      runTime: payload.runTime.trim(),
      thumbId: payload.thumbId,
    });
    // Mirror the WP publish webhook locally so this deployment refreshes even
    // if the webhook is down.
    revalidateTag("episodes", "max");
    if (program.showId > 0) revalidateTag(`tv-show:${program.showId}`, "max");
    return { ok: true, id: episodeId };
  } catch (e) {
    return programFail("updateEpisode", e, "Couldn't save the episode");
  }
}

/**
 * Trash a post, then believe the SITE rather than the request. WordPress
 * routinely completes a delete and misses the deadline answering (the slow
 * publish-path hooks run on the way out too), which surfaced as
 * "TimeoutError… couldn't trash" on a program that was already gone. On any
 * failure, re-read the post: still there = a real failure, worth rethrowing.
 */
async function trashOrConfirm(type: ProgramType | "episode", id: number, timeoutMs?: number): Promise<void> {
  try {
    await trashProgramPost(type, id, timeoutMs);
  } catch (e) {
    const gone = await isTrashed(type, id).catch(() => false);
    if (!gone) throw e;
    console.warn(`[trash] ${type} ${id}: request failed but the post IS trashed — treating as success.`);
  }
}

/** Move an episode to the trash — recoverable from wp-admin's Trash. */
export async function trashEpisodeAction(programId: number, episodeId: number): Promise<ProgramCreateResult> {
  try {
    const program = await readProgramForEdit(programId);
    if (!program) return { ok: false, error: "Program not found." };

    await trashOrConfirm("episode", episodeId);
    revalidateTag("episodes", "max");
    if (program.showId > 0) revalidateTag(`tv-show:${program.showId}`, "max");
    return { ok: true, id: episodeId };
  } catch (e) {
    return programFail("trashEpisode", e, "Couldn't trash the episode");
  }
}

/**
 * Move a whole program to the trash. Its companion tv_show (the episode
 * container) goes too — the container has no page of its own, so leaving it
 * behind only orphans it.
 *
 * The EPISODES are deliberately left alone: trashing them one REST call at a
 * time (~4s each, shows run to hundreds) can't complete inside a request, and
 * with the container gone they no longer surface anywhere on the public site.
 * Clear them in wp-admin if you want them gone for good.
 */
export async function trashProgramAction(programId: number): Promise<ProgramCreateResult> {
  try {
    const program = await readProgramForEdit(programId);
    if (!program) return { ok: false, error: "Program not found." };

    // Resolve the public slug BEFORE the delete, while the registry still maps
    // this post id to a route.
    const ref = program.status === "publish" ? await programByPostId(program.id) : undefined;

    // The program itself is the operation. If this fails, nothing else runs —
    // the container must not be orphaned by a half-done delete.
    await trashOrConfirm(program.type, program.id);

    // Only a movie owns a SEPARATE container. Opening a tv_show directly
    // reports its own id as showId — that must not be trashed twice.
    if (program.type === "movie" && program.showId > 0) {
      // Deliberately NON-FATAL: the program the user asked to delete is
      // already gone, and a leftover container has no page and no route. A
      // second slow delete failing must not report the whole thing as failed.
      // Short deadline on purpose: chaining two full 120s deletes could spin
      // the dialog for ~4 minutes. If WordPress overruns this it still
      // finishes the delete on its own — we just stop waiting to say so.
      try {
        await trashOrConfirm("tv_show", program.showId, 30_000);
      } catch (e) {
        console.warn(`[trashProgram] container ${program.showId} left behind:`, e);
      }
      revalidateTag("episodes", "max");
      revalidateTag(`tv-show:${program.showId}`, "max");
    }

    if (ref) revalidateTag(`program:${ref.slug}`, "max");
    if (program.status === "publish") revalidateTag("program-registry", "max");
    return { ok: true, id: program.id };
  } catch (e) {
    return programFail("trashProgram", e, "Couldn't trash the program");
  }
}

/**
 * Cache busting shared by every program write.
 *
 * `statusChanged` is the important flag: publishing ADDS a public route and
 * unpublishing REMOVES one, so the routing registry has to refresh either way
 * — keying off "is now published" alone would leave an unpublished program
 * still routed until the ISR window expired.
 */
async function bustProgram(id: number, nowPublished: boolean, statusChanged: boolean): Promise<void> {
  // Public program pages (and landing banners) cache under program:<slug>; the
  // registry maps this post id to that slug. Scoped to the one program — no
  // blanket tag, to stay friendly to the Vercel ISR-writes cap. Resolved even
  // when unpublishing: the registry copy still knows the slug of the page we
  // need to tear down.
  const ref = await programByPostId(id);
  if (ref) revalidateTag(`program:${ref.slug}`, "max");
  if (nowPublished || statusChanged) revalidateTag("program-registry", "max");
}

/**
 * Save the Details form. `status` is optional: omitted, the program keeps
 * whatever status it has (the plain Save); set, this is also the
 * Publish/Unpublish action, so the fields on screen are saved in the same
 * write rather than being silently dropped.
 */
export async function saveProgramAction(
  type: ProgramType,
  id: number,
  payload: ProgramPayload,
  status?: "draft" | "publish",
): Promise<ProgramSaveResult> {
  const title = payload.title.trim();
  if (!title) return { ok: false, error: "Give the program a title first." };

  const releaseTs = isoDateToTs(payload.releaseDate);
  if (releaseTs === null) return { ok: false, error: "Release date must be YYYY-MM-DD (or blank)." };

  try {
    const saved = await updateProgram(type, id, {
      title,
      description: payload.description,
      releaseTs,
      schedule: payload.schedule.trim(),
      posterId: payload.posterId,
      backdropId: payload.backdropId,
      video: payload.video,
      status,
    });
    await bustProgram(id, saved.status === "publish", status !== undefined);
    return { ok: true, status: saved.status };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? "WordPress rejected the save. Check your permissions and try again."
          : "Couldn't save. Please try again.",
    };
  }
}

/** Publish / unpublish without touching the fields — the top bar's status
 *  button when no Details form is mounted (i.e. on the Episodes tab). */
export async function setProgramStatusAction(
  type: ProgramType,
  id: number,
  status: "draft" | "publish",
): Promise<ProgramSaveResult> {
  try {
    const saved = await updateProgramStatus(type, id, status);
    await bustProgram(id, saved.status === "publish", true);
    return { ok: true, status: saved.status };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? `WordPress rejected the ${status === "publish" ? "publish" : "unpublish"}. Check your permissions and try again.`
          : "Couldn't change the status. Please try again.",
    };
  }
}
