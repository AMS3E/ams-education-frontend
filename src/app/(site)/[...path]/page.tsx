import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { css, cx } from "@/styled-system/css";
import ArticleBody from "@/components/article/ArticleBody";
import HeroEmbed from "@/components/home/HeroEmbed";
import LandingTail from "@/components/landing/LandingTail";
import SectionHead from "@/components/landing/SectionHead";
import TopicHead from "@/components/landing/TopicHead";
import { container } from "@/components/layout/shared";
import { getLandingPaths, resolveLanding } from "@/lib/categories";
import { heroAlias } from "@/lib/hero-alias";
import { getLandingFeed } from "@/lib/landing-data";
import { getStaticPage, getStaticPagePaths } from "@/lib/pages";
import { PRERENDER_PUBLIC } from "@/lib/prerender";

// The section and topic LANDING pages: /entertainment-news, /celebrity,
// /life-style/travel. Eleven in all — two sections and their nine topics.
//
// These are NOT the category listings. WordPress gives every one of these terms
// two URLs and this app follows it:
//
//   /celebrity                  landing page  (this route)
//   /category/celebrity/news    listing       (src/app/category/[...path])
//
// which is what lets the header link a topic to its landing page while a
// category chip on an article card links the same topic to its listing. See
// landingHref() in src/lib/categories.ts.
//
// This is the site's ROOT catch-all. Static segments (/article, /category,
// /program) take precedence over a dynamic one, so it only ever sees paths none
// of them claimed. It answers two kinds of URL, in this order:
//
//   1. the eleven landing pages          (resolveLanding)
//   2. the seven plain WordPress pages   (getStaticPage — /contact, /jobs, …)
//
// Landings win, and they have to: WordPress has PAGES sitting at /celebrity and
// /life-style/travel as well as terms, and serving those would replace a landing
// page with an empty stub. Anything neither of them claims is a 404.
//
// `dynamicParams` is left at its default (true) rather than pinned to false: a
// path that isn't prerendered still resolves against the live term list and
// 404s, so a topic added in the CMS starts working without a code change, and an
// API blip during a build can't permanently 404 all eleven pages.
type Params = { params: Promise<{ path: string[] }> };
type PageParams = Params & { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

// ISR: landing pages refresh every 5 minutes, matching the category listings.
export const revalidate = 3600;

export async function generateStaticParams() {
  if (!PRERENDER_PUBLIC) return [];
  const paths = await getLandingPaths();
  return [...paths, ...getStaticPagePaths()].map((path) => ({ path }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path } = await params;

  const landing = await resolveLanding(path);
  if (landing) return { title: landing.term.name, alternates: { canonical: `/${path.join("/")}` } };

  const page = await getStaticPage(path.join("/"));
  if (page) return { title: page.title, alternates: { canonical: `/${page.path}` } };

  return {};
}

/** `?page=` as a positive integer. Garbage ("abc", "-2", "1.5") reads as page 1
 *  rather than 404ing — it is a widget control, not a route. */
function pageParam(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** One of the seven plain WordPress pages the footer links to (/contact,
 *  /privacy-policy, …) — a title and a body, no furniture. */
function StaticPage({ title, html }: { title: string; html: string }) {
  return (
    <div className={cx(container, css({ marginTop: "34px", marginBottom: "56px", maxWidth: "860px" }))}>
      <h1 className={css({ fontSize: { base: "24px", md: "30px" }, fontWeight: 700, color: "text", marginBottom: "6px" })}>{title}</h1>
      <ArticleBody html={html} />
    </div>
  );
}

export default async function LandingPage({ params, searchParams }: PageParams) {
  const { path } = await params;

  const landing = await resolveLanding(path);
  if (!landing) {
    // Not one of the eleven landing pages — it may still be one of the seven
    // WordPress pages the footer points at. Anything else is a genuine 404.
    const page = await getStaticPage(path.join("/"));
    if (page) return <StaticPage title={page.title} html={page.html} />;
    notFound();
  }

  // `?page=N` drives the section head's ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ pager. Only SECTION
  // pages carry that widget, and searchParams is only READ for them — deliberately.
  // Touching it opts a render into request time, so reading it unconditionally
  // would drag the nine topic pages out of the prerender with it, for a parameter
  // they never use. (The seven WordPress pages above are already safe: they return
  // before this line.) So only the two section pages are dynamic.
  const newsPage = landing.level === "section" ? pageParam((await searchParams).page) : 1;
  const feed = await getLandingFeed(landing, newsPage);

  return (
    <>
      {/* Each landing page's own Slider Revolution hero, keyed by its alias
          (/celebrity uses `entainment-home-page-1` — see src/lib/hero-alias.ts).
          Until the WP plugin is on ≥1.5.0 the embed ignores the parameter and
          serves the homepage slider, which is what it always did. */}
      <HeroEmbed alias={heroAlias(path.join("/"))} />

      {feed.section && (
        <SectionHead section={feed.section} matika={feed.matika} anakot={feed.anakot} basePath={`/${path.join("/")}`} />
      )}
      {feed.topic && <TopicHead topic={feed.topic} matika={feed.matika} anakot={feed.anakot} />}

      <LandingTail tail={feed.tail} greenLeaf={feed.greenLeaf} />
    </>
  );
}
