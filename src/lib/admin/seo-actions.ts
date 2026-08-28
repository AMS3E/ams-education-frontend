"use server";

// Server Action for the SEO workbench: a META-ONLY save. It never sends
// `content`, so a Gutenberg body cannot be flattened by an SEO sweep, and it
// never touches title/status/categories — the workbench edits exactly the
// three Yoast fields the wp-admin metabox edits.
//
// ⚠ No `export type` re-exports here — a type re-export in a "use server"
// file crashes every action in it at dev runtime (opaque digest 500s).

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { updatePost } from "./post-edit";
import { AdminAuthError, AdminApiError } from "./client";
import { safeTag } from "@/lib/api/client";

export interface SeoSaveResult {
  ok: boolean;
  error?: string;
}

export async function saveSeoAction(
  id: number,
  seo: { title: string; description: string; focus: string },
  /** For cache revalidation: the public article page shows these fields in its
   *  <head>, so a published post's page refreshes; drafts have no page. */
  target: { slug: string; published: boolean },
): Promise<SeoSaveResult> {
  try {
    await updatePost(id, {
      meta: {
        _yoast_wpseo_title: seo.title,
        _yoast_wpseo_metadesc: seo.description,
        _yoast_wpseo_focuskw: seo.focus,
      },
    });
    // Only the article's own page renders these fields (list cards use the
    // excerpt), so this stays a single-tag refresh — not the publish-time set.
    if (target.published && target.slug) revalidateTag(safeTag(`article:${target.slug}`), "max");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? "WordPress rejected the save. Check your permissions and try again."
          : "Couldn't save. Please try again.",
    };
  }
}
