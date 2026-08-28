import { css } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import { Bar, SkeletonKeyframes } from "@/components/admin/Skeleton";

// Instant skeleton for every admin screen. WordPress REST costs ~4s per call
// and the admin's reads are (mostly) uncached by design, so without this a
// click gave no feedback at all until the server finished — the sidebar stays
// put (it lives in the layout above this boundary) and the content area shows
// a generic page shape: title block, toolbar row, then a list-ish card.
// Deliberately one shared skeleton rather than per-screen ones — it only shows
// for the first paint of a navigation, and a close-enough shape beats nothing.
export default function AdminLoading() {
  return (
    <div className={css({ padding: "20px 22px" })} aria-busy>
      <Bar w={180} h={22} />
      <div style={{ marginTop: 10 }}>
        <Bar w={120} h={13} />
      </div>

      {/* Toolbar */}
      <div className={css({ display: "flex", gap: "10px", marginTop: "24px" })}>
        <Bar w={340} h={36} r={8} />
        <Bar w={150} h={36} r={8} />
      </div>

      {/* Content card */}
      <div
        className={css({ marginTop: "24px", borderRadius: "12px", overflow: "hidden" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}` }}
      >
        <div className={css({ padding: "13px 20px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <Bar w={220} h={13} />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={css({ display: "flex", alignItems: "center", gap: "14px", padding: "13px 20px" })}
            style={{ borderTop: i > 0 ? `1px solid ${ac.rowLine}` : "none" }}
          >
            <Bar w={38} h={38} r={6} />
            <Bar w={i % 2 ? 420 : 320} h={14} />
            <div className={css({ flex: 1 })} />
            <Bar w={70} h={13} />
          </div>
        ))}
      </div>

      <SkeletonKeyframes />
    </div>
  );
}
