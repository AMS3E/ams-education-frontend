import { notFound } from "next/navigation";
import { categoryMaxPages, resolveCategory } from "@/lib/categories";
import { CATEGORY_PAGE_SIZE } from "@/lib/articles";
import { splitPage } from "./split-page";

// A 404 gate for the category listings — see the long note in
// src/app/(site)/article/[slug]/layout.tsx for why this is a layout and not part
// of the page. Short version: this segment has a `loading.tsx`, the status is
// committed the moment its fallback flushes, and a layout in the same segment is
// the one thing that boundary does not wrap.
//
// Free here, unlike the article gate: resolveCategory reads the 26-term list,
// which is ISR-cached and already on every page's critical path, so the skeleton
// is unaffected.
//
// `/page/N` past the end of a real category is gated here TOO, but only as far as
// it can be for free. The listing itself is still not fetched — that is the slow
// request the skeleton exists to cover, and a layout renders before the skeleton
// can flush, so awaiting it would cost every uncached category page a blank wait.
// Instead the bound comes from the article counts already carried by the cached
// term list (see categoryMaxPages). That bound is exact for the 20 leaf terms and
// deliberately generous for the 6 parents, so the page's own
// `articles.length === 0` check stays as the backstop for what slips through.
export default async function CategoryNotFoundGate({ children, params }: LayoutProps<"/category/[...path]">) {
  const { path } = await params;
  const split = splitPage(path);
  if (!split) notFound();

  const term = await resolveCategory(split.segments);
  if (!term) notFound();

  // Deduped, not a second request: resolveCategory just read the same cached
  // term list in this render pass.
  if (split.page > (await categoryMaxPages(term, CATEGORY_PAGE_SIZE))) notFound();

  return children;
}
