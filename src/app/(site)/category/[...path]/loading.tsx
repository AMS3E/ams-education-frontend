import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

const grid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 340px" },
  gap: "30px",
});

const mainCol = css({ display: "flex", flexDirection: "column", gap: "34px" });
const sideCol = css({ display: "flex", flexDirection: "column", gap: "30px" });
const widget = css({ display: "flex", flexDirection: "column", gap: "12px" });
const rowCard = css({ display: "grid", gridTemplateColumns: "260px 1fr", gap: "18px" });

/**
 * Mirrors the category listing: title band, a lead featured card, then rows.
 *
 * The 26 base paths all prebuild, so this mainly covers `/page/N`, which renders
 * on demand and costs ~4s. As on the article route, streaming means an unknown
 * path answers 200 + `noindex` rather than a hard 404; `dynamicParams = false`
 * isn't available here because the page URLs aren't enumerable.
 */
export default function CategoryLoading() {
  return (
    <>
      <div className={css({ background: "hero.bg", width: "100%", padding: "18px 0" })}>
        <div className={cx(container, css({ display: "flex", justifyContent: "center" }))}>
          <Skeleton height='18px' width='220px' radius='3px' />
        </div>
      </div>

      <div className={cx(container, css({ marginTop: "26px", marginBottom: "44px" }))}>
        <div className={grid}>
          <div className={mainCol}>
            {/* lead featured card */}
            <div>
              <Skeleton aspectRatio='16/10' />
              <div className={css({ marginTop: "12px" })}>
                <SkeletonText lines={2} height='16px' />
              </div>
            </div>

            {/* horizontal rows */}
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={rowCard}>
                <Skeleton aspectRatio='16/11' />
                <div className={css({ paddingTop: "6px" })}>
                  <SkeletonText lines={3} />
                </div>
              </div>
            ))}
          </div>

          <div className={sideCol}>
            {[0, 1, 2].map(i => (
              <div key={i} className={widget}>
                <Skeleton height='20px' width='60%' radius='3px' />
                {[0, 1, 2].map(j => (
                  <div key={j} className={css({ display: "flex", gap: "12px" })}>
                    <Skeleton width='125px' height='80px' />
                    <div className={css({ flex: 1, paddingTop: "4px" })}>
                      <SkeletonText lines={2} height='11px' gap='8px' />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
