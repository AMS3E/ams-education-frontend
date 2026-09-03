import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { getCategoryPage } from "@/lib/articles";
import { categoryHref, getCategoryTerms, resolveCategory } from "@/lib/categories";
import { PRERENDER_PUBLIC } from "@/lib/prerender";
import FeaturedArticleCard from "@/components/ui/FeaturedArticleCard";
import ArticleRow from "@/components/ui/ArticleRow";
import CategorySidebar from "@/components/category/CategorySidebar";
import Pagination from "@/components/category/Pagination";
import { splitPage } from "./split-page";

// A catch-all because WordPress's category permalinks are rewritten and run one
// to three segments deep: /category/all-news, /category/celebrity/news,
// /category/life-style/travel/reports. See src/lib/categories.ts.
//
// A trailing `/page/N` selects a page of the listing. Keeping it in the path
// rather than a `?page=` search param is what lets page 1 stay prerendered.
type Params = { params: Promise<{ path: string[] }> };

// ISR: category listings refresh every 5 minutes.
export const revalidate = 3600;

// Prebuild every category. The paths come from the API, so a new topic in the
// CMS starts working without a code change.
export async function generateStaticParams() {
  if (!PRERENDER_PUBLIC) return [];
  const terms = await getCategoryTerms();
  return terms.map((t) => ({ path: t.path.split("/") }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path } = await params;
  const split = splitPage(path);
  if (!split) return {};
  const term = await resolveCategory(split.segments);
  if (!term) return {};
  const suffix = split.page > 1 ? ` — ទំព័រ ${split.page}` : "";
  return { title: `${term.name}${suffix}` };
}

export default async function CategoryPage({ params }: Params) {
  const { path } = await params;
  const split = splitPage(path);
  if (!split) notFound();

  // The term carries the authoritative name, which matters for the two report
  // categories that have no articles — getCategoryPage() reads the name off a
  // returned article and has nothing to read when the listing is empty.
  const term = await resolveCategory(split.segments);
  if (!term) notFound();

  const data = await getCategoryPage(term.slug, split.page);

  // A page past the end has no articles to show and shouldn't be indexed.
  if (split.page > 1 && data.articles.length === 0) notFound();

  const basePath = categoryHref(term.path);
  const [featured, ...rows] = data.articles;

  return (
    <>
      {/* full-width category title band — the h1: card titles are divs, so
          without it the page's only headings are the sidebar's h2s */}
      <div className={css({ background: "hero.bg", width: "100%", padding: "18px 0" })}>
        <h1 className={cx(container, css({ textAlign: "center", fontSize: "15px", fontWeight: 400, margin: 0 }))}>
          <span className={css({ color: "muted" })}>ប្រភេទ: </span>
          <span className={css({ fontWeight: 600 })}>{term.name}</span>
        </h1>
      </div>

      <div className={cx(container, css({ marginTop: "26px", marginBottom: "44px" }))}>
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) 400px" },
            gap: "30px",
          })}
        >
          {/* main article list */}
          <div>
            {data.articles.length === 0 ? (
              <p className={css({ color: "muted", fontSize: "14px", padding: "48px 0", textAlign: "center" })}>មិនទាន់មានអត្ថបទក្នុងប្រភេទនេះទេ។</p>
            ) : (
              <>
                <div className={css({ display: "flex", flexDirection: "column", gap: "34px" })}>
                  {featured && <FeaturedArticleCard item={featured} sizes="(max-width: 1024px) 100vw, 1000px" />}
                  {rows.map((item) => (
                    <ArticleRow key={item.slug} item={item} sizes="(max-width: 1024px) 45vw, 500px" />
                  ))}
                </div>
                <Pagination page={data.page} totalPages={data.totalPages} basePath={basePath} />
              </>
            )}
          </div>

          {/* sidebar widgets */}
          <CategorySidebar lists={data.sidebar} />
        </div>
      </div>
    </>
  );
}
