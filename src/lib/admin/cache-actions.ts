"use server";

// The legacy-site half of publishing. Our token-carrying writes skip AMS
// Cache's purge hooks entirely (ams-frontend-api 1.9.0 — that removal is what
// keeps a publish at ~5s instead of 97s), so after a dashboard publish the
// WordPress site itself keeps serving its stale cached HTML until TTL. This
// action calls the plugin's web/cache/purge endpoint (rebuilt in 1.17.0 on
// ams-cache's own scm_purge_cache_uri), which deletes the cached HTML of the
// pages the post appears on — its page, the homepage, its category/tag
// archives, and the ~55 landing Pages whose templates render latest-news
// blocks. ~60 key deletes, zero HTTP on the server, never the preload crawl.
//
// Purged pages serve CORRECT content on their very next visit — the first
// visitor per page just pays one uncached render (5-19s). We deliberately do
// NOT re-warm from the browser: at ~4-7 publishes/day against ~5k visits/day
// that cost is noise, and cold-not-stale is the accepted trade (2026-08-18).
//
// Called AFTER a save action has already returned, from the editor's
// browser — deliberately a separate request so the publish path itself stays
// byte-for-byte what it was.

import { redirect } from "next/navigation";
import { adminFetch, AdminAuthError } from "./client";

export interface LegacyPurgePage {
  url: string;
  label: string;
  /** The page had a cache entry before this call. False is fine — it just
   *  means nobody had visited that page since its last expiry. */
  cached: boolean;
  purged: boolean;
}

export interface LegacyPurgeResult {
  ok: boolean;
  /** AMS Cache absent or its page caching switched off — nothing to refresh,
   *  and nothing worth showing a chip about. */
  skipped?: boolean;
  error?: string;
  pages: LegacyPurgePage[];
}

interface PurgeEnvelope {
  status: "OK" | "SKIPPED" | "ERROR";
  message?: string;
  data?: { driver?: string; pages?: LegacyPurgePage[] };
}

export async function purgeLegacyCacheAction(postId: number): Promise<LegacyPurgeResult> {
  try {
    const res = await adminFetch<PurgeEnvelope>("/wp/v2/web/cache/purge", {
      method: "POST",
      body: { post_id: postId },
      // Nothing waits on this call (it's fire-and-forget after the save), and
      // the default 30s produced "couldn't refresh" chips for purges that had
      // actually completed — the box just answered late. Give it room; the
      // 1.18.1 batch purge makes the endpoint fast, this makes it honest.
      timeoutMs: 120_000,
    });
    const body = res.data;
    if (body?.status === "OK") return { ok: true, pages: body.data?.pages ?? [] };
    if (body?.status === "SKIPPED") return { ok: true, skipped: true, pages: [] };
    return { ok: false, error: body?.message ?? "WordPress couldn't refresh its cache.", pages: [] };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return { ok: false, error: "Couldn't reach WordPress to refresh its cache.", pages: [] };
  }
}
