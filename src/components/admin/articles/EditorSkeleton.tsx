import { css } from "@/styled-system/css";
import { ac, publishedPageBg } from "../tokens";
import { Icon } from "../icons";
import { Bar, SkeletonKeyframes } from "../Skeleton";

// The article editor's shape, drawn before the editor exists.
//
// Opening an article has TWO waits and used to show nothing for either. First
// the server read (post + categories), where the nearest boundary was
// /admin/loading.tsx — a LIST skeleton, i.e. the wrong screen. Then the
// Gutenberg bundle, which is the heavy one: @wordpress/block-editor loads
// client-side only, and its `loading` fallback was an empty 320px div, so the
// top bar sat over a blank page with the status line cheerfully reading
// "Loaded".
//
// One component covers both, so the two waits look like one continuous state
// instead of two different blanks: `chrome` draws the app top bar (the route
// fallback, where nothing is mounted yet) and is omitted inside the editor
// (where the REAL top bar is already up). `note` says which wait this is —
// skeleton bars say "something is coming", only words say what.
//
// Server-safe: no hooks, no "use client", so `loading.tsx` can render it and a
// client component can import it just as happily.
export default function EditorSkeleton({ note, chrome = false }: { note: string; chrome?: boolean }) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 })} aria-busy>
      {chrome ? (
        <div
          className={css({ display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", height: "56px", flex: "none" })}
          style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}
        >
          <Bar w={32} h={32} r={8} />
          <Bar w={74} h={22} r={99} />
          <Bar w={70} h={13} />
          <div className={css({ flex: 1 })} />
          <Bar w={96} h={34} r={8} />
        </div>
      ) : null}

      {/* The band carries the message. It is the one row that is the same
          height and position in the skeleton and in the real editor, so the
          text does not move when the editor takes over. */}
      <div
        className={css({ display: "flex", alignItems: "center", gap: "10px", height: "56px", padding: "0 16px", flex: "none" })}
        style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}
      >
        <span className={css({ display: "inline-flex" })} style={{ color: ac.muted, animation: "admin-spin 0.9s linear infinite" }}>
          <Icon name="refresh" size={14} strokeWidth={2} />
        </span>
        <span role="status" className={css({ fontSize: "13px" })} style={{ color: ac.muted }}>
          {note}
        </span>
      </div>

      <div className={css({ display: "flex", alignItems: "flex-start" })}>
        {/* Canvas: the same 1024px sheet in the same gutter, at the same
            min-height, so the real document lands where this one stood. */}
        <div className={css({ flex: 1, minWidth: 0, padding: "32px 24px 120px" })}>
          <div className={css({ maxWidth: "1024px", margin: "0 auto" })}>
            <div
              className={css({ padding: "32px 32px 56px", minHeight: "calc(100vh - 176px)" })}
              style={{ background: publishedPageBg, border: `1px solid ${ac.border}`, boxShadow: ac.shadowSm }}
            >
              <Bar w="100%" h={240} r={0} />
              <div className={css({ marginTop: "28px", display: "flex", flexDirection: "column", gap: "12px" })}>
                <Bar w="92%" h={28} />
                <Bar w="58%" h={28} />
              </div>
              <div className={css({ marginTop: "32px", display: "flex", flexDirection: "column", gap: "14px" })}>
                {["100%", "97%", "88%", "94%", "62%"].map((w, i) => (
                  <Bar key={i} w={w} h={13} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* The docked settings column, at its real 320px. */}
        <aside
          className={css({ width: "320px", flex: "none", position: "sticky", top: "112px", height: "calc(100vh - 112px)" })}
          style={{ background: ac.surface, borderLeft: `1px solid ${ac.border}` }}
        >
          <div className={css({ display: "flex", alignItems: "center", gap: "14px", height: "44px", padding: "0 14px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
            <Bar w={34} h={13} />
            <Bar w={38} h={13} />
          </div>
          <div className={css({ padding: "16px", display: "flex", flexDirection: "column", gap: "18px" })}>
            <Bar w="100%" h={132} r={8} />
            <div className={css({ display: "flex", justifyContent: "space-between" })}>
              <Bar w={52} h={13} />
              <Bar w={62} h={13} />
            </div>
            <Bar w="100%" h={34} r={8} />
            <div className={css({ display: "flex", flexDirection: "column", gap: "13px" })}>
              {["76%", "84%", "68%", "80%"].map((w, i) => (
                <Bar key={i} w={w} h={13} />
              ))}
            </div>
          </div>
        </aside>
      </div>

      <SkeletonKeyframes />
      <style>{`@keyframes admin-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
