import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import CategoryLinks from "@/components/ui/CategoryLinks";
import type { HomeCard } from "@/lib/home-data";
import { articleHref, cardLink, thumb16x11 } from "./styles";

/** Five articles as a large lead card + a 2×2 cluster — the ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ
 *  body, lifted out of DailyEventsSection when that section traded its day tabs
 *  for a pager. Kept as its own component so the grid stays separable from the
 *  section chrome (heading, pager, "see all") that wraps it. */
export default function NewsGrid({ cards }: { cards: HomeCard[] }) {
  if (cards.length === 0) {
    return <p className={css({ color: "muted", fontSize: "14px", padding: "48px 0", textAlign: "center" })}>មិនមានអត្ថបទសម្រាប់ថ្ងៃនេះទេ។</p>;
  }

  const [large, ...cluster] = cards;

  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
        gap: "1.5rem",
      })}
    >
      {/* one large featured card — the meta line sits outside the article
          link so its category links don't nest inside another anchor */}
      <div className={css({ display: "flex", flexDirection: "column", height: "100%" })}>
        <Link href={articleHref(large.slug)} className={cx(cardLink, css({ flex: "1 1 auto" }))}>
          <div
            className={css({
              position: "relative",
              width: "100%",
              flex: "1 1 auto",
              minHeight: "320px",
              overflow: "hidden",
              cursor: "pointer",
              "& img": { transition: "transform .45s ease" },
              _hover: { "& img": { transform: "scale(1.04)" } },
            })}
          >
            <CoverImage src={large.src} sizes="(max-width: 1024px) 100vw, 640px" />
          </div>
          <div
            className={css({
              fontSize: "15px",
              fontWeight: 600,
              color: "text",
              marginTop: "12px",
              lineHeight: 1.5,
            })}
          >
            {large.title}
          </div>
        </Link>
        <div className={css({ fontSize: "11.5px", color: "muted", marginTop: "6px" })}>
          <CategoryLinks cats={large.tags ?? []} />
        </div>
      </div>
      {/* 2x2 cluster */}
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          alignContent: "start",
        })}
      >
        {cluster.map((d, i) => (
          <div key={i} className={css({ display: "flex", flexDirection: "column" })}>
            <Link href={articleHref(d.slug)} className={cardLink}>
              <div className={thumb16x11}>
                <CoverImage src={d.src} sizes="(max-width: 768px) 50vw, 320px" />
              </div>
              <div
                className={css({
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "text",
                  marginTop: "8px",
                  lineHeight: 1.45,
                })}
              >
                {d.title}
              </div>
            </Link>
            <div className={css({ fontSize: "11px", color: "muted", marginTop: "4px" })}>
              <CategoryLinks cats={d.tags ?? []} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
