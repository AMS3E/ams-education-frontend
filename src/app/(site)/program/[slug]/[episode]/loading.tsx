import WatchPageSkeleton from "@/components/program/WatchPageSkeleton";

/**
 * Matters more here than on the overview route: [episode]/page.tsx prebuilds
 * nothing (`generateStaticParams` returns `[]`), so every episode's first hit
 * runs getProgramWatchData() — 2+ serial WP round trips — with nothing else on
 * screen to show for it. See withMinDuration in page.tsx for why this stays up
 * at least 400ms even on a fast resolve.
 */
export default function EpisodeLoading() {
  return <WatchPageSkeleton />;
}
