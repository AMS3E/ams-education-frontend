import { getArticle } from "@/lib/articles";

// A 404 gate, and nothing else. It renders no markup — it exists to settle the
// HTTP status before the response body opens.
//
// `loading.tsx` wraps page.tsx in a Suspense boundary, and the moment that
// fallback flushes the status is committed: a notFound() from the page then
// renders the right screen under a 200. Next 16 is explicit that this cannot be
// worked around from inside the boundary — "Because the response headers have
// already been sent to the client, the status code of the response cannot be
// updated" — and equally explicit about the escape hatch: "loading.js wraps
// not-found.js, page.js, and nested layout.js files in a <Suspense> boundary. It
// does NOT wrap the layout.js ... in the same segment."
//
// So the slug is resolved here, outside the boundary, and an unknown one 404s
// for real. Next still injects `noindex` either way, so this changes nothing for
// Google; it fixes what Search Console reports as soft 404s and what analytics
// counts as a successful page view.
//
// COST: getArticle is already called in generateMetadata and in the page, and
// the underlying fetch is ISR-cached, so there is no extra round trip. What it
// costs is the skeleton — an uncached article now blocks here (~4s) instead of
// showing loading.tsx. That trade was chosen deliberately.
export default async function ArticleNotFoundGate({ children, params }: LayoutProps<"/article/[slug]">) {
  const { slug } = await params;
  await getArticle(slug); // notFound() for an unknown slug; rethrows real failures
  return children;
}
