import type { Metadata } from "next";
import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import ArticleBody from "@/components/article/ArticleBody";
import AuthorBox from "@/components/article/AuthorBox";
import Sidebar from "@/components/article/Sidebar";
import RelatedColumns from "@/components/article/RelatedColumns";
import BelowArticle from "@/components/article/BelowArticle";
import { container } from "@/components/layout/shared";
import { getArticle, getArticleExtras, getRecentArticleSlugs, type Article } from "@/lib/articles";
import { getCommentCount } from "@/lib/comments";
import { PRERENDER_PUBLIC } from "@/lib/prerender";
import ShareRow from "@/components/article/ArticleShareSection";
import ReviveAdSlot from "@/components/ads/revive/ReviveAdSlot";
import { reviveHalfLandscape } from "@/components/ads/revive/zones";
import { SITE_LOGO, SITE_NAME, SITE_URL } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

// ISR: revalidate the page hourly; on-demand invalidation via /api/revalidate.
export const revalidate = 3600;

// Prebuild the most recent articles at build time; the rest render on demand.
// Worth keeping this generous: an uncached article costs ~4s because every
// WordPress REST call carries ~3.9s of fixed overhead, and these are the
// articles most likely to be linked from the homepage and the feeds.
export async function generateStaticParams() {
  if (!PRERENDER_PUBLIC) return [];
  const slugs = await getRecentArticleSlugs(100);
  return slugs.map((slug) => ({ slug }));
}

/**
 * Social metadata. Until this existed every share of every article — Facebook,
 * Telegram, X — rendered with no image, no headline and the site-wide default
 * description, which for a media site is the single most expensive thing on the
 * page.
 *
 * `getArticle` is called here AND in the page body, but the underlying fetch is
 * cached by `next.revalidate`, so the second call is served from the cache
 * rather than costing another ~4s round trip to WordPress.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);

  const url = `/article/${slug}`;
  const images = article.featured.src ? [article.featured.src] : undefined;

  return {
    title: article.title,
    description: article.description,
    // Self-referencing: our own route is the canonical one, not the WordPress
    // permalink this article is mirrored from.
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: article.title,
      description: article.description,
      publishedTime: article.publishedAt || undefined,
      modifiedTime: article.modifiedAt || undefined,
      authors: [article.author.name],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images,
    },
  };
}

/** NewsArticle + BreadcrumbList, the two blocks live emits that actually carry
 *  information a crawler can't infer from the markup. */
function articleJsonLd(article: Article) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        headline: article.title,
        description: article.description,
        image: article.featured.src ? [article.featured.src] : undefined,
        datePublished: article.publishedAt || undefined,
        dateModified: article.modifiedAt || undefined,
        author: { "@type": "Person", name: article.author.name },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: `${SITE_URL}${SITE_LOGO}` },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/article/${article.slug}` },
        articleSection: article.categories.map((c) => c.name),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: article.breadcrumb.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.label,
          // The last crumb is the page itself, so it carries no `item` — which
          // is what schema.org asks for and what Google's validator expects.
          ...(b.href ? { item: `${SITE_URL}${b.href}` } : {}),
        })),
      },
    ],
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const [article, extras] = await Promise.all([getArticle(slug), getArticleExtras()]);
  // Serial by necessity — the post id only exists once the article is fetched.
  // Cheap now that it is a count on the fast path (~0.2s) rather than a page of
  // comment bodies over WP REST (~3.9s).
  const commentCount = await getCommentCount(article.id);

  return (
    <div className={cx(container, css({ marginTop: "22px", marginBottom: "10px" }))}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(article)) }} />

      {/* breadcrumb: ទំព័រដើម › section › topic › this article */}
      <nav
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "7px",
          fontSize: "15px",
          color: "muted",
          marginBottom: "18px",
        })}
      >
        {article.breadcrumb.map((b, i) => (
          <span key={`${i}-${b.label}`} className={css({ display: "inline-flex", alignItems: "center", gap: "7px" })}>
            {i > 0 && <span className={css({ opacity: 0.6 })}>›</span>}
            {b.href ? (
              <Link href={b.href} className={css({ color: "muted", textDecoration: "none", _hover: { color: "brand.blue" } })}>
                {b.label}
              </Link>
            ) : (
              // The article itself, and any category whose term didn't resolve:
              // no destination, so no link.
              <span className={css({ color: "brand.blue" })}>{b.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* main + sidebar */}
      <div
        className={css({
          display: "grid",
          // minmax(0,1fr), not 1fr: a plain 1fr track is minmax(auto,1fr) and
          // refuses to shrink below its content's min size, so a horizontally
          // scrolling child (the program carousel in BelowArticle) would blow the
          // main column out to full width and push the sidebar off-screen. The 0
          // minimum lets the column shrink and the carousel's overflow scroll.
          gridTemplateColumns: { base: "minmax(0,1fr)", lg: "minmax(0,1fr) 390px" },
          gap: "20px",
        })}
      >
        {/* main column */}
        <article>
          {/* featured image */}
          <div
            className={css({
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              overflow: "hidden",
            })}
          >
            <CoverImage src={article.featured.src} priority sizes="(max-width: 1024px) 100vw, 1000px" />
            {article.featured.badge && (
              <span
                className={css({
                  position: "absolute",
                  left: "14px",
                  bottom: "14px",
                  background: "rgba(0,0,0,.62)",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "5px 12px",
                })}
              >
                {article.featured.badge}
              </span>
            )}
          </div>
          <h1
            className={css({
              margin: 0,
              fontSize: { base: "18px", md: "20px" },
              fontWeight: 600,
              color: "text",
              marginTop: "18px",
            })}
          >
            {article.title}
          </h1>

          {/* meta */}
          <div
            className={css({
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px",
              marginTop: "8px",
              fontSize: "12.5px",
              color: "muted",
            })}
          >
            <span className={css({ display: "flex", flexWrap: "wrap", gap: "8px" })}>
              {article.categories.map((c) => {
                const style = css({
                  color: "#00208c",
                  fontWeight: 600,
                  textDecoration: "none",
                  _hover: { textDecoration: "underline" },
                });
                return c.href ? (
                  <Link key={c.id} href={c.href} className={style}>
                    {c.name}
                  </Link>
                ) : (
                  <span key={c.id} className={style}>
                    {c.name}
                  </span>
                );
              })}
            </span>
            <span className={css({ fontStyle: "italic" })}>{article.date}</span>
            {/* Live's meta line carries a "Leave a comment" link to #comments. */}
            <a href="#comments" className={css({ color: "muted", textDecoration: "none", _hover: { color: "brand.blue" } })}>
              {commentCount > 0 ? `មតិយោបល់ (${commentCount})` : "បញ្ចេញមតិយោបល់"}
            </a>
          </div>

          <ArticleBody html={article.bodyHtml} />
          <AuthorBox author={article.author} />
          <ShareRow slug={article.slug} title={article.title} />
          {/* Re-enabling the thread needs its data back too — the page only
              reads the count now:
                import CommentsSection from "@/components/article/CommentsSection";
                import { getComments } from "@/lib/comments";
                const comments = await getComments(article.id);
              <CommentsSection postId={article.id} comments={comments} />
              Note the meta line above links to #comments, which nothing
              renders while this is off. */}
          <div className={css({ marginTop: "30px", marginBottom: "30px" })}>
            <ReviveAdSlot zone={reviveHalfLandscape} />
          </div>
          <RelatedColumns recentReports={extras.recentReports} generalNews={extras.generalNews} />
          {/* The live article template keeps these rails in the main two-thirds
              column while the sidebar continues alongside them. This also
              gives the fixed-width poster carousel the same four-card viewport
              as WordPress instead of stretching it across the whole page. */}
          <BelowArticle extras={extras} />
        </article>

        {/* sidebar */}
        <Sidebar sidebarLists={extras.sidebarLists} nationalInternational={extras.nationalInternational} />
      </div>
    </div>
  );
}
