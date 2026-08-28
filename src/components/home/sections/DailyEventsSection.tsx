import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import Pager from "@/components/ui/Pager";
import { container } from "@/components/layout/shared";
import type { HomeCard } from "@/lib/home-data";
import NewsGrid from "./NewsGrid";
import { cta } from "./styles";

/** A stable landmark for the section. The pager deliberately does NOT link to it
 *  — paging leaves the viewport where it is (see Pager) — but it keeps the
 *  section addressable for anything that wants to deep-link to it. */
export const DAILY_EVENTS_ANCHOR = "daily-events";

/** Section 1 — "ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ": one page of the news root as a large lead
 *  card + a 2×2 cluster, with the "see all" button below the grid.
 *
 *  This used to be three day tabs (today / yesterday / the day before). The days
 *  were dropped for a pager: the tabs were not per-day buckets on the live site
 *  either — each was "the newest five as of that day", so consecutive tabs
 *  repeated articles — and our own version could render ថ្ងៃនេះ and ម្សិលមិញ
 *  identically on any morning before the day's first post.
 *
 *  Now a server component: paging is real <Link> navigation to another URL, so
 *  every page is crawlable and linkable and no client JS runs to change pages.
 *  The homepage addresses those pages by path (`/page/2`, via pageStyle) so that
 *  `/` itself reads no searchParams and can be prerendered; the landing sections
 *  still use `?page=2` and are request-time rendered because of it.
 *  `page`/`totalPages` are optional — omit them (the program and episode pages
 *  do) and the section renders page one with no pager, which keeps those
 *  statically-prerendered routes off the request-time `searchParams` path.
 *
 *  Shared with the landing SECTION pages, which render this same component with
 *  their own `basePath` and a feed scoped to their term (see SectionHead). */
export default function DailyEventsSection({
  cards,
  page,
  totalPages,
  basePath = "/",
  seeAllHref = "/category/all-news",
  pageStyle,
}: {
  cards: HomeCard[];
  page?: number;
  totalPages?: number;
  basePath?: string;
  seeAllHref?: string;
  /** Passed straight to Pager. The homepage uses "segment" so that `/` stays
   *  prerenderable; the landing sections keep the default query string. */
  pageStyle?: "query" | "segment";
}) {
  // Same rule as the other home sections: no cards, no section. On the HOMEPAGE
  // this feed is the page's subject and a failed read throws before reaching
  // here (see getHomeFeed); on the program, episode and landing pages it is a
  // tail block, and this is where it quietly drops out.
  if (!cards.length) return null;

  return (
    <>
      <div id={DAILY_EVENTS_ANCHOR} className={cx(container)}>
        <div
          className={css({
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            rowGap: "10px",
            marginTop: "18px",
            marginBottom: "18px",
          })}
        >
          <h2 className={css({ fontSize: "24px" })}>ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ</h2>
          {/* Purely decorative — dropped below `sm` rather than left to collapse
              into its own wrapped row once the title + Pager no longer fit one
              line (Pager alone can run 7 cells wide, which overflows a phone's
              content width; body clips overflow-x, so an unwrapped row silently
              cut the tail of the pager off-screen instead of scrolling to it). */}
          <div
            className={css({
              display: { base: "none", sm: "block" },
              flex: "auto",
              height: "1px",
              margin: "0px 16px",
              background: "#e8e8e8",
            })}
          ></div>
          {page !== undefined && totalPages !== undefined && (
            <Pager page={page} totalPages={totalPages} basePath={basePath} pageStyle={pageStyle} />
          )}
        </div>

        <NewsGrid cards={cards} />
      </div>

      <div className={css({ display: "flex", justifyContent: "center", margin: "30px 0px", position: "relative" })}>
        <div
          className={css({
            padding: "0.1px",
            margin: "0px 16px",
            background: "#e8e8e8",
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            width: "100%",
          })}
        ></div>
        <Link
          href={seeAllHref}
          className={cx(
            cta,
            css({
              background: "linear-gradient(90deg,rgba(252,125,69,1) 0%,rgba(253,29,29,1) 30%,rgba(139,58,180,1) 100%)",
              color: "#fff",
              padding: "13px 100px",
              fontSize: "14px",
              fontWeight: 500,
              border: "2px #e8e8e8 solid",
              position: "relative",
              zIndex: 1,
              textDecoration: "none",
              display: "inline-block",
            }),
          )}
        >
          មើលទាំងអស់
        </Link>
      </div>
    </>
  );
}
