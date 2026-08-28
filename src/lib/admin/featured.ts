// Featured Program (the homepage's wide video banner) — admin read layer.
// Reads the plugin's web/featured-program endpoint AS the logged-in user
// (no-store): the dashboard needs the raw override ids to round-trip a save
// without clobbering what wp-admin set, not the resolved public payload.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";

interface RawFeatured {
  status: string;
  data: {
    id?: number;
    bg_image_id?: number;
    title?: string;
    cover?: string;
  } | null;
}

export interface FeaturedConfig {
  /** 0 = banner hidden. */
  movieId: number;
  /** Raw override id; 0 = falling back to the movie's own backdrop. */
  bgImageId: number;
  title: string;
  /** Resolved banner artwork URL (override or fallback), for preview. */
  coverUrl: string;
}

/** Current banner config; { movieId: 0 … } when unset. Throws on auth loss;
 *  other failures bubble too — the caller decides how to degrade. */
export async function getFeaturedConfig(): Promise<FeaturedConfig> {
  const { data } = await adminFetch<RawFeatured>("/wp/v2/web/featured-program");
  const d = data?.data;
  return {
    movieId: d?.id ?? 0,
    bgImageId: d?.bg_image_id ?? 0,
    title: decodeEntities(d?.title ?? "").trim(),
    coverUrl: d?.cover ?? "",
  };
}

/** The same four fields the dashboard uses, read straight from the option +
 *  the movie row (the fast endpoint skips the public payload's
 *  permalink/poster/excerpt, which this screen never reads). */
export async function getFeaturedConfigFast(token?: string): Promise<FeaturedConfig> {
  const body = await fastFetch<{ movieId: number; bgImageId: number; title: string; coverUrl: string }>(
    "featured",
    {},
    { token },
  );
  const d = body.data;
  return {
    movieId: d.movieId ?? 0,
    bgImageId: d.bgImageId ?? 0,
    title: decodeEntities(d.title ?? "").trim(),
    coverUrl: d.coverUrl ?? "",
  };
}

export function readFeaturedConfig(token?: string): Promise<FeaturedConfig> {
  return withRestFallback(
    "featured",
    () => getFeaturedConfigFast(token),
    () => getFeaturedConfig(),
  );
}
