import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeView from "@/components/home/HomeView";

// Page two and beyond of the homepage's ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ pager.
//
// A route segment rather than `?page=`, so that `/` itself reads no request-time
// API and can be prerendered — see the note in HomeView. The URL shape matches
// the pagers the category and author archives already mint (`/category/…/page/3`).
export const revalidate = 3600;

/**
 * Prebuild the first block of pages. This is very nearly free: fetchCardPage
 * fetches five pages' worth per upstream request (NEWS_BLOCK_PAGES), so pages
 * 2-5 slice out of the SAME cached block that page one already pulled, and
 * every other section on the page is a cache hit on the identical fetch key.
 * Four more prerendered pages, no extra round trips to WordPress.
 */
export function generateStaticParams() {
  return [{ n: "2" }, { n: "3" }, { n: "4" }, { n: "5" }];
}

/** `page/1` is not a URL we mint (that is `/`), and nor is `page/abc` — both
 *  404 rather than quietly showing page one. Same rule as splitPage on the
 *  category archives, and the reason it differs from the old `?page=` handling:
 *  a query parameter is a widget control, but a path segment is an address, and
 *  an address that does not exist should say so. */
function pageNo(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2 ? n : null;
}

type Params = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const n = pageNo((await params).n);
  // The suffix matches the category archives' paged titles.
  return n ? { title: `ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ — ទំព័រ ${n}` } : {};
}

export default async function HomePaged({ params }: Params) {
  const n = pageNo((await params).n);
  if (n === null) notFound();
  return <HomeView page={n} />;
}
