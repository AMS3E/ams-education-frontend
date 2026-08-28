import { css } from "@/styled-system/css";
import { ac } from "@/components/admin/tokens";
import { Bar, SkeletonKeyframes } from "@/components/admin/Skeleton";

// Skeleton for the program editor's TAB content (Details ↔ Episodes). Scoped
// under [id] so switching tabs keeps the real top bar + tab nav mounted (they
// live in this segment's layout) and only the cards below pulse; without this
// boundary a tab switch would fall back to the whole-page /admin skeleton and
// visibly unmount the header.
export default function ProgramTabLoading() {
  return (
    <div aria-busy>
      {[0, 1].map((card) => (
        <div
          key={card}
          className={css({ borderRadius: "12px", overflow: "hidden", marginTop: card ? "16px" : "0" })}
          style={{ background: ac.surface, border: `1px solid ${ac.border}` }}
        >
          <div className={css({ padding: "14px 20px" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
            <Bar w={110} h={13} />
          </div>
          <div className={css({ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "16px" })}>
            <Bar w="60%" h={38} r={8} />
            <Bar w="100%" h={76} r={8} />
            <div className={css({ display: "flex", gap: "16px" })}>
              <Bar w={200} h={38} r={8} />
              <Bar w={280} h={38} r={8} />
            </div>
          </div>
        </div>
      ))}
      <SkeletonKeyframes />
    </div>
  );
}
