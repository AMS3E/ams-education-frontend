/**
 * Gates build-time `generateStaticParams` fetches against the live
 * WordPress backend. Off unless `PRERENDER_PUBLIC="1"` (a Build-time
 * Argument, not a runtime env var — see docs/project-context.md §6).
 *
 * With it off, every param'd public route returns `[]` and renders on first
 * visit instead, then caches via the existing ISR `revalidate` — no runtime
 * behaviour changes, only when the fetch happens. This exists because a
 * `next build` firing N render workers at WordPress simultaneously starved
 * the Dokploy build container (shared, memory-tight) enough that even
 * fast-path-only routes (0.36s against a warm backend) timed out — not a
 * slow backend, starved workers. Measured: 267 pages -> 32, static
 * generation ~4.4s, build exits 0.
 */
export const PRERENDER_PUBLIC = process.env.PRERENDER_PUBLIC === "1";
