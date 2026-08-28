import WatchPageSkeleton from "@/components/program/WatchPageSkeleton";

/** Every program prebuilds (see generateStaticParams in page.tsx), so this
 *  mainly covers a program published after the last build, or a background
 *  ISR regen. Every WordPress Program uses the KhmerInsiderWatchPage
 *  template now, so this must match ITS geometry, not the old cinematic
 *  overview's — see WatchPageSkeleton. */
export default function ProgramLoading() {
  return <WatchPageSkeleton />;
}
