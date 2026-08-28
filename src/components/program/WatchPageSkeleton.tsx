import { css } from "@/styled-system/css";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Mirrors KhmerInsiderWatchPage's geometry so real content swaps in without
 * shifting anything. Shared by both routes that render it —
 * program/[slug]/(overview) and program/[slug]/[episode] — since a program's
 * overview IS its watch page now (see (overview)/page.tsx), not a separate
 * template.
 */
const shell = css({
  maxWidth: "1440px",
  mx: "auto",
  px: { base: "14px", md: "24px" },
  pt: { base: "16px", md: "24px" },
  pb: "54px",
});
const columns = css({
  display: "grid",
  gridTemplateColumns: { base: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 331px" },
  gap: { base: "24px", lg: "12px" },
  alignItems: "start",
});
const main = css({ minWidth: 0 });
const box = css({ background: { base: "#efefef", _dark: "#191a20" } });
const descriptionBox = css({ marginTop: "10px", padding: { base: "20px", md: "24px 30px" } });
const aboutBox = css({ marginTop: "15px", padding: { base: "24px 20px", md: "34px 35px" } });
const aboutGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "92px minmax(0, 1fr)", md: "139px minmax(0, 1fr)" },
  gap: { base: "16px 18px", md: "16px 31px" },
});
const sidebarHead = css({ padding: "12px 16px 10px" });
const sidebarSelect = css({ width: { base: "100%", sm: "165px" }, height: "58px", marginTop: "12px" });
const sidebarPanel = css({ marginTop: "12px", height: { base: "520px", lg: "724px" }, background: { base: "#efefef", _dark: "#191a20" }, padding: "12px 16px" });
const sidebarRow = css({ display: "flex", gap: "10px", alignItems: "center", padding: "8px 0" });

export default function WatchPageSkeleton() {
  return (
    <div className={shell}>
      <div className={columns}>
        <div className={main}>
          <Skeleton aspectRatio="16/9" />
          <div className={css({ marginTop: "12px" })}>
            <Skeleton height="24px" width="70%" radius="4px" />
          </div>
          <div className={css({ marginTop: "8px" })}>
            <Skeleton height="12px" width="180px" radius="3px" />
          </div>

          <section className={`${box} ${descriptionBox}`}>
            <Skeleton height="20px" width="140px" radius="3px" />
            <div className={css({ marginTop: "10px" })}>
              <SkeletonText lines={4} />
            </div>
          </section>

          <section className={`${box} ${aboutBox}`}>
            <div className={aboutGrid}>
              <Skeleton height="162px" width="92px" />
              <div>
                <Skeleton height="20px" width="60%" radius="3px" />
                <div className={css({ marginTop: "8px" })}>
                  <Skeleton height="12px" width="140px" radius="3px" />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div>
          <div className={sidebarHead}>
            <Skeleton height="24px" width="70%" radius="3px" />
          </div>
          <Skeleton className={sidebarSelect} radius="3px" />
          <div className={sidebarPanel}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={sidebarRow}>
                <Skeleton height="52px" width="92px" />
                <div className={css({ flex: 1 })}>
                  <SkeletonText lines={2} height="11px" gap="7px" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
