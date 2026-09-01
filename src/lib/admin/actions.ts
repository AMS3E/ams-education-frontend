"use server";

// Server Actions for the article editor. The editor (a Client Component) calls
// these with a structured payload; they write through core wp/v2/posts as the
// logged-in user and report a typed result the editor can render.

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { updatePost, createPost, type PostWrite } from "./post-edit";
import { AdminAuthError, AdminApiError } from "./client";
import { safeTag } from "@/lib/api/client";

/** The editable field set. Sent whole; the layer forwards it to WordPress. */
export interface EditorPayload {
  title: string;
  /** Body HTML from the TipTap editor. ABSENT (undefined) when the user never
   *  touched the body — the write then omits `content` entirely so an existing
   *  Gutenberg body is not flattened by a metadata-only save. */
  content?: string;
  excerpt: string;
  status: string; // "draft" | "pending" | "publish"
  /** The URL slug, hand-written in English (site convention — WordPress would
   *  percent-encode the Khmer title). OMITTED when locked (the article has
   *  been published; a live URL is never rewritten) or left blank (WordPress
   *  generates one). WP sanitizes whatever is sent. */
  slug?: string;
  categories: number[];
  /** Slugs of the checked categories — used only to scope cache revalidation
   *  to the affected category pages (the editor has them at hand). */
  categorySlugs: string[];
  /** Tag term ids (the typeahead resolves names → ids, creating as needed). */
  tags: number[];
  /** Featured-image attachment id; 0 = leave unset/clear. */
  featuredMedia: number;
  /** Visibility, mirroring WordPress's own model: a post is public, private
   *  (status), or password-protected. "" clears an existing password. */
  password: string;
  /** "Stick this post to the front page." Ours is a curated homepage, so it
   *  affects WordPress's own archives rather than our landing pages. */
  sticky: boolean;
  /** Post template — the theme file that renders the article's TAIL on the
   *  WordPress site. "" is WordPress's "Default template", which on this theme
   *  means nothing renders below the body, so it is a real choice and is always
   *  sent rather than omitted when empty. */
  template: string;
  seo: { title: string; description: string; focus: string };
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** Autosave only: the session is gone (401). The editor keeps the writer's
   *  work on screen and says so — it must NOT be bounced to /login mid-write,
   *  which is what the manual actions' redirect would do. */
  expired?: boolean;
  /** Present on success — the saved status/slug echoed back from WordPress. */
  status?: string;
  slug?: string;
  /** The permalink WordPress computed for the saved state — on a publish, the
   *  article's live URL. Feeds the editor's preview control. */
  link?: string;
  /** New post id, on a successful create. */
  id?: number;
  /** Category ids WordPress actually stored. */
  categories?: number[];
}

function toWrite(p: EditorPayload): PostWrite {
  return {
    title: p.title,
    ...(p.content !== undefined ? { content: p.content } : {}),
    ...(p.slug !== undefined ? { slug: p.slug } : {}),
    excerpt: p.excerpt,
    status: p.status,
    categories: p.categories,
    tags: p.tags,
    featured_media: p.featuredMedia,
    password: p.password,
    sticky: p.sticky,
    template: p.template,
    meta: {
      _yoast_wpseo_title: p.seo.title,
      _yoast_wpseo_metadesc: p.seo.description,
      _yoast_wpseo_focuskw: p.seo.focus,
    },
  };
}

/** Publishing/updating from the dashboard refreshes exactly the public pages
 *  the post appears on — its own page, its categories' lists, the homepage and
 *  the day tabs — instead of the blanket "articles" tag (every list page at
 *  once), to stay friendly to the Vercel ISR-writes budget. Mirrors the tag
 *  set the WP plugin's publish webhook (≥1.7.3) sends for a post. */
function refreshPublic(status: string | undefined, slug: string | undefined, categorySlugs: string[]) {
  if (status !== "publish") return;
  revalidateTag("home", "max");
  revalidateTag("daily-events", "max");
  if (slug) revalidateTag(safeTag(`article:${slug}`), "max");
  for (const c of categorySlugs) revalidateTag(safeTag(`category:${c}`), "max");
}

export async function savePostAction(id: number, payload: EditorPayload): Promise<SaveResult> {
  try {
    const saved = await updatePost(id, toWrite(payload), true);
    refreshPublic(saved.status, saved.slug, payload.categorySlugs);
    return { ok: true, status: saved.status, slug: saved.slug, link: saved.link, categories: saved.categories };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return { ok: false, error: e instanceof AdminApiError ? "WordPress rejected the save. Check your permissions and try again." : "Couldn't save. Please try again." };
  }
}

/**
 * The editor's AUTOSAVE — the WordPress rule, on WordPress's own terms: a
 * draft the writer owns is simply overwritten, a live article is never
 * touched (the editor only calls this while WordPress holds `draft`, or for
 * an article that does not exist yet). Three deliberate differences from the
 * manual actions above:
 *   - the status is FORCED to `draft`: the Status radio's intent (Publish,
 *     Pending, Private) commits only through the button, exactly as
 *     wp-admin's autosave "does not update the status" — otherwise picking
 *     Published and waiting a minute would publish;
 *   - an expired session is REPORTED, not redirected — a redirect would throw
 *     the writer out of the editor with their work still on screen;
 *   - no public revalidation: nothing public changed.
 * `id` null = first activity on a new article: creates the draft, returns its
 * id, and the editor switches to editing it in place.
 */
export async function autosaveArticleAction(id: number | null, payload: EditorPayload): Promise<SaveResult> {
  try {
    const write = { ...toWrite(payload), status: "draft" };
    const saved = id === null ? await createPost(write) : await updatePost(id, write);
    return { ok: true, id: saved.id, status: saved.status, slug: saved.slug, link: saved.link, categories: saved.categories };
  } catch (e) {
    if (e instanceof AdminAuthError) return { ok: false, expired: true, error: "Your session has expired." };
    return { ok: false, error: e instanceof AdminApiError ? "WordPress rejected the autosave." : "Autosave failed." };
  }
}

export async function createPostAction(payload: EditorPayload): Promise<SaveResult> {
  try {
    const saved = await createPost(toWrite(payload), true);
    refreshPublic(saved.status, saved.slug, payload.categorySlugs);
    return { ok: true, id: saved.id, status: saved.status, slug: saved.slug, link: saved.link, categories: saved.categories };
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    return { ok: false, error: e instanceof AdminApiError ? "WordPress rejected the new article. Check your permissions and try again." : "Couldn't create the article. Please try again." };
  }
}
