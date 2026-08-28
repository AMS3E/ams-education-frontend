import { permanentRedirect } from "next/navigation";
import { CURATED_PROGRAMS } from "@/lib/program-curation";

type Props = {
  params: Promise<{ slug: string }>;
};

const pathKey = (value: string) => value.replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "");

/**
 * Legacy WordPress program URLs.
 *
 * WordPress stores these programs as MasVideos `movie` posts, but this
 * frontend intentionally exposes every program at `/program/<slug>`. Keep the
 * old public URLs working as permanent aliases instead of letting the root
 * catch-all render a 404.
 */
export default async function LegacyMovieProgramPage({ params }: Props) {
  const { slug } = await params;
  const wordpressPath = `/movie/${slug}`;
  const curated = CURATED_PROGRAMS.find((program) => pathKey(program.wpHref) === pathKey(wordpressPath));

  permanentRedirect(`/program/${curated?.slug ?? slug}`);
}
