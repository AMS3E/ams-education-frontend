/** Floors how fast `promise` can resolve, without slowing down a genuinely slow
 *  one. Used to keep a route's `loading.tsx` on screen long enough to read as
 *  intentional rather than a flash — a background ISR regen or an already-warm
 *  fetch can resolve in a few ms, which reads as a flicker, not a loading state.
 *
 *  Only matters while the page component actually executes (first visit, or a
 *  background revalidation): once a route is served straight from the ISR
 *  cache, its Server Component doesn't run again, so there is nothing here to
 *  delay on that path. */
export async function withMinDuration<T>(promise: Promise<T>, minMs: number): Promise<T> {
  const start = Date.now();
  const result = await promise;
  const elapsed = Date.now() - start;
  if (elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  return result;
}
