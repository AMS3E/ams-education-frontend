import EditorSkeleton from "@/components/admin/articles/EditorSkeleton";

// Same reasoning as [id]/loading.tsx — New Article reads the category tree
// before it can render, and then loads the same Gutenberg bundle.
export default function NewArticleLoading() {
  return <EditorSkeleton chrome note="Opening a new article…" />;
}
