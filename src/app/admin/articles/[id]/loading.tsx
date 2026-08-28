import EditorSkeleton from "@/components/admin/articles/EditorSkeleton";

// Clicking a row in the Articles list waits on TWO WordPress reads (the post
// for edit + the category tree) before the editor can render at all. Without a
// boundary here the nearest one is /admin/loading.tsx, which draws a LIST — so
// the click flashed a table skeleton on the way to an editor. This is the
// editor's own shape, and it shows the instant the click lands.
export default function ArticleEditorLoading() {
  return <EditorSkeleton chrome note="Opening the article…" />;
}
