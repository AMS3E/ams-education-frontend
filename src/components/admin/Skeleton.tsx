import { ac } from "./tokens";

// Pulsing placeholder bar for the admin loading skeletons. Server-safe (no
// hooks). The `admin-pulse` keyframes are emitted once per skeleton screen by
// SkeletonKeyframes below.
export function Bar({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: w,
        height: h,
        borderRadius: r,
        background: ac.skeleton,
        animation: "admin-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export function SkeletonKeyframes() {
  return <style>{`@keyframes admin-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>;
}
