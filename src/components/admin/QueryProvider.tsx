"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// TanStack Query client for the admin dashboard. Since the fast read path
// (A5/A6), reads cost ~300ms, so the old speed-over-freshness trade (30min
// staleTime over a 30min BFF cache) is gone: 30s staleTime just dedupes
// rapid back-and-forth navigation, and every landing older than that
// refetches fresh data it can actually afford. gcTime keeps evicted screens
// instantly re-renderable (stale rows paint while the refetch runs).
//
// useState(() => …) — not a module singleton — so each browser tab/user gets
// its own client and nothing leaks across server renders.
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 60 * 60_000,
            refetchOnWindowFocus: false,
            // One retry: WordPress occasionally drops a request outright, but a
            // consistently failing endpoint should surface fast, not spin.
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
