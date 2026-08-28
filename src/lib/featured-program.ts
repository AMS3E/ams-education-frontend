// The wide video banner on the homepage ("វនយាត្រា") and above the footer on the
// program/episode pages.
//
// WHICH program this is, and the banner art behind it, are chosen in WP admin
// (Settings → Featured Program) — not hardcoded here. That mirrors the Vodi
// `wp:vodi/section-featured-movie` block the live WordPress homepage uses, which
// likewise stores the movie and the artwork together.
//
// The artwork is a per-slot choice, not the movie's own `_vodi_movie_bg_image`:
// those are different crops of the same scene (2560x576 vs 2560x398), and which
// one fits is a layout call. The art carries the show's wordmark either way —
// see VideoFeatureStrip, which prints only a small title label because of it.

import { apiFetch } from "./api/client";
import { decodeEntities, htmlToParagraphs } from "./api/mappers";
import { toVideo, type Video } from "./api/video";
import { programBySlug, programHref } from "./programs";
import type { WpFeaturedProgram, WpObjectEnvelope } from "./api/wp-types";

export interface FeaturedProgram {
  title: string;
  /** Description paragraphs. [] when the movie has no excerpt. */
  description: string[];
  /** Wide banner artwork. "" if the admin hasn't picked one — the caller should
   *  treat that as "don't render the banner". */
  cover: string;
  /** Where WATCH NOW goes: our own program page when the slug is in the registry,
   *  otherwise the WordPress permalink. */
  href: string;
  /** Release year, e.g. "2023". "" when unset. */
  year: string;
  /** The trailer behind the ▶ button. null when the movie has no video. */
  video: Video | null;
  /** Where ▶ NAVIGATES when there is no trailer to play — the show's newest
   *  episode. Live's program template does the same thing: it has no trailer
   *  either, it plays the default episode. Unset means no ▶ at all. */
  watchHref?: string;
}

/** The release year, in Phnom Penh time.
 *
 *  `release_date` is Unix seconds at MIDNIGHT Asia/Phnom_Penh (UTC+7). Formatting
 *  it in UTC lands on 17:00 the PREVIOUS day, which is exactly the bug the live
 *  Vodi theme has — and on a New Year's Day release it would print the wrong YEAR,
 *  not just the wrong day. */
function releaseYear(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

async function map(d: WpFeaturedProgram): Promise<FeaturedProgram> {
  const known = await programBySlug(d.slug);
  return {
    title: decodeEntities(d.title ?? "").trim(),
    description: htmlToParagraphs(d.description ?? ""),
    cover: d.cover ?? "",
    href: known ? programHref(known.slug) : (d.permalink ?? ""),
    year: releaseYear(d.release_date),
    video: toVideo(d.video),
  };
}

/** The configured featured program, or null when WP has none set (or the request
 *  fails). The banner is decoration, so every failure path just hides it rather
 *  than taking the page down. */
export async function getFeaturedProgram(): Promise<FeaturedProgram | null> {
  try {
    const env = await apiFetch<WpObjectEnvelope<WpFeaturedProgram | null>>("/wp/v2/web/featured-program", {
      revalidate: 3600,
      tags: ["featured-program"],
    });
    return env.data ? await map(env.data) : null;
  } catch {
    return null;
  }
}
