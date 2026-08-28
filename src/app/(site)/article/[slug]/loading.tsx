import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

const grid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "1fr 390px" },
  gap: "20px",
});

const mainCol = css({ display: "flex", flexDirection: "column", gap: "18px" });
const sideCol = css({ display: "flex", flexDirection: "column", gap: "30px" });
const widget = css({ display: "flex", flexDirection: "column", gap: "12px" });
const row = css({ display: "flex", gap: "12px" });

/**
 * Shown while an article renders. It matters more here than anywhere else on the
 * site: an article that isn't prebuilt takes ~4s, because every WordPress REST
 * call carries ~3.9s of fixed overhead. Without this boundary a click left the
 * previous page on screen with no feedback at all.
 *
 * The geometry mirrors page.tsx — same container, same 1fr/390px grid, same 16/9
 * hero — so real content swaps in without shifting anything. Adding this file
 * also gives Next a shell it can prefetch, which is what makes the click itself
 * feel instant.
 *
 * Tradeoff: streaming commits the HTTP status with the first chunk, so a
 * `notFound()` for an unknown slug can no longer answer 404 — Next returns 200
 * and injects `<meta name="robots" content="noindex">` instead. Unavoidable
 * here (10k+ articles rules out `dynamicParams = false`), and worth it: the
 * alternative is four seconds of a frozen page on every real article click.
 */
export default function ArticleLoading() {
  return (
    <div className={cx(container, css({ marginTop: "22px", marginBottom: "10px" }))}>
      {/* breadcrumb */}
      <div className={css({ display: "flex", gap: "10px", marginBottom: "18px" })}>
        <Skeleton height='13px' width='60px' radius='3px' />
        <Skeleton height='13px' width='90px' radius='3px' />
        <Skeleton height='13px' width='110px' radius='3px' />
      </div>

      <div className={grid}>
        <div className={mainCol}>
          <Skeleton aspectRatio='16/9' />
          <Skeleton height='30px' width='85%' radius='4px' />
          <div className={row}>
            <Skeleton height='13px' width='120px' radius='3px' />
            <Skeleton height='13px' width='80px' radius='3px' />
          </div>
          <SkeletonText lines={4} />
          <SkeletonText lines={5} />
          <SkeletonText lines={3} />
        </div>

        <div className={sideCol}>
          {[0, 1, 2].map(i => (
            <div key={i} className={widget}>
              <Skeleton height='20px' width='55%' radius='3px' />
              {[0, 1, 2].map(j => (
                <div key={j} className={row}>
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
  );
}
