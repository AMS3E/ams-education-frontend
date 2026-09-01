"use client";

// The "old site is catching up" chip. Publishing from this dashboard updates
// the Next.js site within seconds, but the WordPress site's OWN page cache is
// deliberately not touched by the write (that skip is what keeps a publish at
// ~5s — see cache-actions.ts). So after a successful save of anything live,
// the editor calls startLegacyRefresh(), which asks the plugin to purge the
// cached HTML of the pages the post appears on (article, homepage, its
// archives, the ~55 landing pages) in one background request, separate from
// the save, while this chip narrates next to the editor's status pill.
//
// There is no re-warm step: a purged page serves the update on its very next
// visit — the first visitor per page just pays one uncached render. The chip
// therefore reports the one fact that matters: how many stale copies were
// deleted. Only a purge FAILURE means the old site is still showing old
// content (until the cache TTL expires on its own).
//
// The run lives in MODULE state, not component state, on purpose: publishing a
// brand-new article navigates create → /admin/articles/<id> mid-run, and a
// module survives that client-side navigation where component state would not.
// useSyncExternalStore (not an effect) keeps the repo's no-setState-in-effect
// lint happy and re-renders every mounted chip from the one shared run.

import { useSyncExternalStore } from "react";
import { Badge } from "./ui";
import { purgeLegacyCacheAction } from "@/lib/admin/cache-actions";

const SITE = "education.ams.com.kh";

type RefreshState =
  | { phase: "idle" }
  | { phase: "purging"; postId: number }
  | { phase: "done"; postId: number; total: number }
  | { phase: "error"; postId: number };

const IDLE: RefreshState = { phase: "idle" };

let state: RefreshState = IDLE;
const listeners = new Set<() => void>();
/** A save that lands while a run is in flight queues one follow-up run —
 *  ignoring it would leave that save's pages stale on the old site. */
let rerunFor: number | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: RefreshState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

/** Kick off (or queue) a purge of the legacy site's pages for a post.
 *  Fire-and-forget from a save's success path — never awaited by the save. */
export function startLegacyRefresh(postId: number) {
  if (state.phase === "purging") {
    rerunFor = postId;
    return;
  }
  void run(postId);
}

async function run(postId: number) {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  emit({ phase: "purging", postId });

  const res = await purgeLegacyCacheAction(postId);
  if (!res.ok) {
    finish({ phase: "error", postId });
    return;
  }
  if (res.skipped) {
    // AMS Cache absent or off — there is no stale copy, nothing to report.
    finish(IDLE);
    return;
  }

  // purged = pages that actually had a stale cached copy deleted. The rest
  // weren't cached (nobody visited since last expiry) and were already going
  // to render fresh.
  finish({ phase: "done", postId, total: res.pages.filter((p) => p.purged).length });
}

function finish(next: RefreshState) {
  emit(next);
  const rerun = rerunFor;
  rerunFor = null;
  if (rerun !== null) {
    void run(rerun);
    return;
  }
  if (next.phase === "done" || next.phase === "error") {
    clearTimer = setTimeout(() => {
      if (state === next) emit(IDLE);
    }, 60_000);
  }
}

/** Renders the current run's status, or nothing when idle. Pass the editor's
 *  post id so an editor never wears another post's chip; omit it (the create
 *  screen) to show whatever run is active. */
export default function LegacySiteChip({ postId }: { postId?: number }) {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (s.phase === "idle") return null;
  if (postId !== undefined && s.postId !== postId) return null;

  if (s.phase === "purging") {
    return (
      <span title={`Clearing this post's cached pages on ${SITE}`}>
        <Badge tone="data" icon="refresh">
          {SITE} · clearing cache…
        </Badge>
      </span>
    );
  }
  if (s.phase === "done") {
    return (
      <span
        title={
          s.total === 0
            ? `Nothing was cached on ${SITE} — it will serve the update fresh`
            : `${s.total} stale page${s.total === 1 ? "" : "s"} cleared — ${SITE} serves the update on the next visit (first load per page is uncached, so slower)`
        }
      >
        <Badge tone="good" icon="check">
          {s.total === 0 ? `${SITE} · up to date` : `${SITE} · ${s.total} page${s.total === 1 ? "" : "s"} refreshed`}
        </Badge>
      </span>
    );
  }
  return (
    <span title={`Couldn't refresh ${SITE}'s cache — it still updates on its own when the cache expires`}>
      <Badge tone="warn">{SITE} · couldn&rsquo;t refresh</Badge>
    </span>
  );
}
