import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import ArticleRow from "@/components/ui/ArticleRow";
import CategorySidebar from "@/components/category/CategorySidebar";
import Pagination from "@/components/category/Pagination";
import { categoryRefs, type NamedList } from "@/lib/articles";
import { getAuthorBySlug, getAuthors } from "@/lib/authors";
import { categoryHref } from "@/lib/categories";
import { fetchAuthorPosts } from "@/lib/wp-core";

// The /author/<slug> archives — 21 of them on the live site, every one linked
// from the ក្រុមការងារ block's "see all" on all 11 landing pages. Same layout as
// a category listing: uniform rows, pagination, the standard sidebar.
//
// A catch-all for the same reason the category route is one: a trailing
// `/page/N` selects a page, and keeping it in the path (not a ?page= param) is
// what lets page 1 stay prerendered.
type Params = { params: Promise<{ path: string[] }> };

// ISR: same refresh cadence as the category listings.
export const revalidate = 3600;

/** ["ratana-ams","page","3"] -> { slug: "ratana-ams", page: 3 } */
function splitPage(path: string[]): { slug: string; page: number } | null {
  if (path.length === 1) return { slug: path[0], page: 1 };
  if (path.length === 3 && path[1] === "page") {
    const page = Number(path[2]);
    if (!Number.isInteger(page) || page < 2) return null;
    return { slug: path[0], page };
  }
  return null;
}

// Prebuild page 1 of every author. The slugs come from the API, so a new
// account in the CMS starts working without a code change.
export async function generateStaticParams() {
  const authors = await getAuthors();
  return authors.map((a) => ({ path: [a.slug] }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path } = await params;
  const split = splitPage(path);
  if (!split) return {};
  const author = await getAuthorBySlug(split.slug);
  if (!author) return {};
  const suffix = split.page > 1 ? ` — ទំព័រ ${split.page}` : "";
  return { title: `${author.name}${suffix}`, alternates: { canonical: `/author/${author.slug}` } };
}

/** The standard sidebar, from three DISTINCT feeds — the author's own posts fill
 *  the main column, so none of the widgets repeats them. */
async function sidebarLists(): Promise<NamedList[]> {
  // "reports" isn't a real term (fixed 2026-08-27 — the real reports root is
  // "all-report", id 535). "entertainment-news" is a genuine Infotainment/
  // Economy leftover with no Education equivalent — left as-is pending an
  // editorial call on what should replace it (see chat).
  const [recent, reports, entertainment] = await Promise.all([
    categoryRefs("all-news", 3),
    categoryRefs("all-report", 3),
    categoryRefs("entertainment-news", 3),
  ]);
  return [
    { heading: "អត្ថបទថ្មីៗ", items: recent, href: categoryHref("all-news") },
    { heading: "របាយការណ៍", items: reports, href: categoryHref("all-report") },
    { heading: "អត្ថបទកម្សាន្ត", items: entertainment, href: categoryHref("entertainment-news") },
  ];
}

export default async function AuthorPage({ params }: Params) {
  const { path } = await params;
  const split = splitPage(path);
  if (!split) notFound();

  const author = await getAuthorBySlug(split.slug);
  if (!author) notFound();

  const [posts, sidebar] = await Promise.all([
    // No `.catch(() => null)` here: it fed the notFound() below, so a WordPress
    // blip 404'd a real author's archive and ISR served that 404 for an hour.
    // Letting it throw keeps the last good page and retries. See lib/api/client.ts.
    fetchAuthorPosts(author.id, split.page),
    sidebarLists(),
  ]);

  // A page past the end has nothing to show and shouldn't be indexed.
  if (split.page > 1 && posts.items.length === 0) notFound();

  return (
    <>
      {/* full-width title band, same as the category listings */}
      <div className={css({ background: "hero.bg", width: "100%", padding: "18px 0" })}>
        <h1 className={cx(container, css({ textAlign: "center", fontSize: "15px", fontWeight: 400, margin: 0 }))}>
          <span className={css({ color: "muted" })}>អ្នកនិពន្ធ: </span>
          <span className={css({ fontWeight: 600 })}>{author.name}</span>
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
          <div>
            {author.description && (
              <p className={css({ color: "muted", fontSize: "14px", lineHeight: 1.8, marginBottom: "26px" })}>
                {author.description}
              </p>
            )}
            {posts.items.length === 0 ? (
              <p className={css({ color: "muted", fontSize: "14px", padding: "48px 0", textAlign: "center" })}>
                មិនទាន់មានអត្ថបទពីអ្នកនិពន្ធនេះទេ។
              </p>
            ) : (
              <>
                <div className={css({ display: "flex", flexDirection: "column", gap: "34px" })}>
                  {posts.items.map((item) => (
                    <ArticleRow key={item.slug} item={item} sizes="(max-width: 1024px) 45vw, 500px" />
                  ))}
                </div>
                <Pagination page={split.page} totalPages={posts.totalPages} basePath={`/author/${author.slug}`} />
              </>
            )}
          </div>

          <CategorySidebar lists={sidebar} />
        </div>
      </div>
    </>
  );
}
