// Programs LIST layer. "Programs" = the MasVideos `movie` and `tv_show` post
// types (both small — ~20 each), so we pull all of each in one request and
// merge; the list needs core fields only (title, status, poster). The
// single-program editor lives in ./program-edit.ts.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";

interface RawProgram {
  id: number;
  status: string;
  title?: { rendered?: string };
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { sizes?: { large?: { source_url?: string }; medium?: { source_url?: string }; thumbnail?: { source_url?: string } } };
    }[];
  };
}

export interface ProgramItem {
  id: number;
  title: string;
  type: "Movie" | "TV Show";
  status: string;
  poster: string;
}

async function fetchType(restBase: string, type: ProgramItem["type"], token?: string): Promise<ProgramItem[]> {
  const { data } = await adminFetch<RawProgram[]>(`/wp/v2/${restBase}`, {
    token,
    query: {
      per_page: 100,
      status: "publish,draft,pending",
      orderby: "title",
      order: "asc",
      _embed: "wp:featuredmedia",
      _fields: "id,status,title,_links,_embedded",
    },
  });
  return (data ?? []).map((p) => {
    const media = p._embedded?.["wp:featuredmedia"]?.[0];
    return {
      id: p.id,
      title: decodeEntities(p.title?.rendered ?? "").trim() || `#${p.id}`,
      type,
      status: p.status,
      // large (1024) first: the grid card renders wider than medium's 300px on
      // any hi-DPI screen, and an upscaled medium is visibly soft.
      poster: media?.media_details?.sizes?.large?.source_url ?? media?.media_details?.sizes?.medium?.source_url ?? media?.source_url ?? "",
    };
  });
}

/** THROWS on failure (callers that prefer degrading catch it themselves).
 *  `token` = explicit session token from the BFF route; omitted, the cookie
 *  is read here.
 *
 *  MOVIES ONLY since the Episodes rework: a program IS its movie post; the
 *  companion tv_shows are episode CONTAINERS (never routed, reached through
 *  the movie's Episodes tab), so listing them duplicated every program in
 *  the grid. Also halves the WP cost of the list. */
export async function listPrograms(token?: string): Promise<ProgramItem[]> {
  return fetchType("movie", "Movie", token);
}

/** The same movie list from the fast path. Capability checks server-side go
 *  through the port of ams-frontend-api's user_has_cap derivation (that filter
 *  does not run under SHORTINIT) — see fast.php's ams_fast_can_program(). */
export async function listProgramsFast(token?: string): Promise<ProgramItem[]> {
  const body = await fastFetch<{ items: { id: number; title: string; status: string; poster: string }[] }>(
    "programs",
    {},
    { token },
  );
  return (body.data.items ?? []).map((p) => ({
    id: p.id,
    title: decodeEntities(p.title ?? "").trim() || `#${p.id}`,
    type: "Movie" as const,
    status: p.status,
    poster: p.poster ?? "",
  }));
}

/** The read the BFF should call: fast path first, WP REST if unavailable.
 *  NEWEST FIRST (owner's call): sorted here, not per path, because the fast
 *  endpoint carries no date to order by — post id is creation order and both
 *  paths have it. */
export async function readPrograms(token?: string): Promise<ProgramItem[]> {
  const items = await withRestFallback(
    "programs",
    () => listProgramsFast(token),
    () => listPrograms(token),
  );
  return items.sort((a, b) => b.id - a.id);
}
