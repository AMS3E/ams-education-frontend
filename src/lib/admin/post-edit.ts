// Single-post read + write for the article editor. Reads with context=edit (so
// title/excerpt come back as raw source and Yoast meta is included) and writes
// back through core wp/v2/posts as the logged-in user.
//
// Scope: title, body, excerpt, status, categories, tags, featured image, and
// Yoast SEO. The body is written as static HTML from the TipTap editor — for a
// post whose stored body is Gutenberg block markup (<!-- wp:… -->) that save
// flattens the blocks, so callers only include `content` when the user actually
// edited the body (dirty-tracking lives in BodyEditor/ArticleEditor).

import { adminFetch } from "./client";
import { decodeEntities } from "@/lib/api/mappers";

interface RawEditPost {
  id: number;
  slug: string;
  status: string;
  /** The REAL permalink, computed by WordPress (category path, custom
   *  overrides and all) — e.g. https://…/life-style/life-tips/news/<slug>/.
   *  For an unpublished post it is the ?p= placeholder form. */
  link?: string;
  /** "2026-07-30T10:42:02" — site-local, no zone. */
  date?: string;
  title: { raw?: string; rendered?: string };
  content: { raw?: string; rendered?: string };
  excerpt: { raw?: string; rendered?: string };
  categories: number[];
  tags: number[];
  featured_media: number;
  /** Theme file that renders the post's TAIL on the WordPress site, e.g.
   *  "templates/celebrity-template.php". "" is WordPress's "Default template",
   *  which on this theme means nothing renders after the body. */
  template?: string;
  password?: string;
  sticky?: boolean;
  meta?: Record<string, unknown>;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      // Open record rather than two named keys: WordPress generates whatever
      // the theme registered (thumbnail / medium / medium_large / large / …),
      // and naming only the two smallest is how the cover preview ended up
      // pinned to a 300px image. See pickCoverUrl below.
      media_details?: { sizes?: Record<string, { source_url?: string } | undefined> };
    }[];
    "wp:term"?: { id: number; taxonomy: string; name: string }[][];
  };
}

/** 2× the 704px reading column the cover renders into, so it stays sharp on the
 *  HiDPI laptops the newsroom actually edits on. */
const COVER_TARGET_W = 1408;

/**
 * The URL for the editor's COVER PREVIEW.
 *
 * This is not a thumbnail slot, though it was written as one — it asked for
 * `medium` first, which is 300px on this install, and 300px stretched across
 * the sheet's 704px column is exactly why the cover looked pixelated.
 *
 * Chosen by MEASURED WIDTH rather than by size name: WordPress generates
 * whatever crops the theme registered, the names differ per install, and
 * `large` simply does not exist for a lot of this library.
 *
 * Falling back to the original is safe, and not the gamble it looks like:
 * WordPress only GENERATES a crop when the original exceeds it, so reaching
 * that branch means no crop was ≥1408 — which means the original is itself
 * modest. A genuine 4000px DSLR upload never gets here, because it will have
 * produced a 1536 or 2048 crop for the first branch to find. Measured on a
 * real post: the only crop was 768, and the original was 84 KB.
 */
function pickCoverUrl(media?: {
  source_url?: string;
  media_details?: { sizes?: Record<string, { source_url?: string; width?: number } | undefined> };
}): string {
  const sizes = Object.values(media?.media_details?.sizes ?? {}).filter(
    (s): s is { source_url: string; width?: number } => typeof s?.source_url === "string" && s.source_url.length > 0,
  );

  // The SMALLEST crop that still covers a HiDPI render — not the largest, which
  // would pull a 2048 file to paint 704 CSS pixels.
  const big = sizes
    .filter((s) => (s.width ?? 0) >= COVER_TARGET_W)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0];
  if (big) return big.source_url;

  if (media?.source_url) return media.source_url;

  return [...sizes].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.source_url ?? "";
}

export interface EditablePost {
  id: number;
  title: string;
  /** Publish date, site-local ISO ("" for an undated draft) — the SEO
   *  workbench's Google preview shows it the way Google would. */
  date: string;
  /** Rendered HTML — do_blocks() output. Kept for previews and for the legacy
   *  TipTap editor; NOT what the Gutenberg canvas loads. */
  bodyHtml: string;
  /** The STORED body: block markup with `<!-- wp:… -->` delimiters. This is
   *  what the Gutenberg editor parses and what it serializes back, so a body
   *  save round-trips instead of flattening. */
  bodyRaw: string;
  excerpt: string;
  slug: string;
  status: string;
  /** The post's live URL on the WordPress site, as WordPress computed it —
   *  never derived here (the category path in it follows WP's own rules and
   *  this site has custom permalink overrides). "" when WordPress didn't
   *  return one; the preview control hides rather than guess. */
  link: string;
  categoryIds: number[];
  tags: { id: number; name: string }[];
  featuredMedia: number;
  /** URL for the cover PREVIEW on the editor sheet — a full-width crop, not a
   *  thumbnail despite the name. See pickCoverUrl. */
  featuredThumb: string;
  /** The post template — see RawEditPost.template. Read back so the editor can
   *  tell a DELIBERATE "Default template" from a post that was never given one,
   *  which is the difference between leaving it alone and auto-filling it. */
  template: string;
  /** Present only under context=edit. A protected post returns its real
   *  password here, which is why this whole object is admin-only. */
  password: string;
  sticky: boolean;
  seo: { title: string; description: string; focus: string };
}

/** The fields the editor may write. Everything optional — send only what changed.
 *  `content` in particular must be OMITTED (not "") unless the body was edited. */
export interface PostWrite {
  title?: string;
  content?: string;
  excerpt?: string;
  status?: string;
  slug?: string;
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  /** Post template. "" is a legal, meaningful value (WordPress's "Default
   *  template"), so this is set-or-omit like `password`, never set-or-clear. */
  template?: string;
  meta?: Record<string, string>;
  /** Visibility. Empty string CLEARS a password — WordPress treats the field as
   *  set-or-clear, so it must be sent as "" rather than omitted to unprotect. */
  password?: string;
  sticky?: boolean;
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v : "";
}

export async function getPostForEdit(id: number): Promise<EditablePost | null> {
  const { data } = await adminFetch<RawEditPost>(`/wp/v2/posts/${id}`, {
    query: {
      context: "edit",
      _fields: "id,date,slug,status,link,title,content,excerpt,categories,tags,featured_media,template,password,sticky,meta,_links,_embedded",
      _embed: "wp:featuredmedia,wp:term",
    },
  });
  if (!data?.id) return null;

  const media = data._embedded?.["wp:featuredmedia"]?.[0];
  const terms = (data._embedded?.["wp:term"] ?? []).flat();

  return {
    id: data.id,
    title: decodeEntities(data.title?.raw ?? "").trim(),
    date: data.date ?? "",
    bodyHtml: data.content?.rendered ?? "",
    bodyRaw: data.content?.raw ?? "",
    excerpt: decodeEntities(data.excerpt?.raw ?? "").trim(),
    slug: data.slug ?? "",
    status: data.status,
    link: data.link ?? "",
    password: typeof data.password === "string" ? data.password : "",
    sticky: data.sticky === true,
    categoryIds: data.categories ?? [],
    tags: terms
      .filter((t) => t.taxonomy === "post_tag")
      .map((t) => ({ id: t.id, name: decodeEntities(t.name).trim() })),
    featuredMedia: data.featured_media ?? 0,
    featuredThumb: pickCoverUrl(media),
    template: typeof data.template === "string" ? data.template : "",
    seo: {
      title: metaStr(data.meta, "_yoast_wpseo_title"),
      description: metaStr(data.meta, "_yoast_wpseo_metadesc"),
      focus: metaStr(data.meta, "_yoast_wpseo_focuskw"),
    },
  };
}

/** What a write echoes back. `link` is the permalink WordPress computed for the
 *  state it just stored — on a publish, the final pretty URL — which is how the
 *  editor's preview control gets the live-site address without a reload. */
export interface SavedPost {
  id: number;
  status: string;
  slug: string;
  link?: string;
  categories?: number[];
}

const CATEGORY_PERMALINK_HEADER = { "X-AMS-Category-Permalink": "1" };

/** Update an existing post. WordPress accepts POST on the item route as an update.
 *
 *  ONE WRITE, except for a single measured exception: WordPress validates an
 *  incoming `password` against the STORED sticky flag (`is_sticky($post_id)`),
 *  not against the `sticky` in the same request. Measured on live production —
 *
 *    POST {status:"draft", password:"x", sticky:false} on a sticky post
 *      -> 400 rest_invalid_field "A sticky post can not be password protected."
 *    POST {sticky:false} then the IDENTICAL payload
 *      -> 200, and the post ends up draft + protected + unsticky
 *
 *  — so a rejected write loses every other edit in the payload (title, body,
 *  categories, SEO), which is what makes this worth a second round trip rather
 *  than a comment. It only fires when a password is actually being set. */
export async function updatePost(id: number, patch: PostWrite, categoryPermalink = false): Promise<SavedPost> {
  if (patch.password && patch.sticky === false) {
    await adminFetch(`/wp/v2/posts/${id}`, { method: "POST", body: { sticky: false } });
  }
  const { data } = await adminFetch<SavedPost>(`/wp/v2/posts/${id}`, {
    method: "POST",
    body: patch,
    ...(categoryPermalink ? { headers: CATEGORY_PERMALINK_HEADER } : {}),
  });
  return data;
}

/** Create a new post. Defaults to draft unless the caller sets a status. */
export async function createPost(fields: PostWrite, categoryPermalink = false): Promise<SavedPost> {
  const { data } = await adminFetch<SavedPost>(`/wp/v2/posts`, {
    method: "POST",
    body: { status: "draft", ...fields },
    ...(categoryPermalink ? { headers: CATEGORY_PERMALINK_HEADER } : {}),
  });
  return data;
}

/** One post template the active theme registers. */
export interface PostTemplate {
  /** Theme-relative file, and the value `template` takes — "templates/celebrity-template.php". */
  file: string;
  /** What the theme's `Template Name:` header calls it — "Celebrity-Article Block". */
  name: string;
}

/** Cached template list + when it was taken. */
let templateCache: { at: number; list: PostTemplate[] } | null = null;

/** The theme changes far less often than an editor is opened, and every REST
 *  call here costs the site's fixed ~4s bootstrap. Ten minutes keeps a
 *  newly-added template appearing "soon" without paying for it per page load. */
const TEMPLATE_TTL_MS = 10 * 60 * 1000;

/**
 * The post templates the live theme offers, for the editor's Template control.
 *
 * Served by ams-frontend-api ≥1.19.0 (`wp/v2/web/post-templates`) because core
 * REST publishes a post's template VALUE but never the list of legal ones — see
 * that endpoint's comment.
 *
 * Never throws: the Template control is an enhancement, and an article must
 * stay editable when the plugin is a version behind or the call fails. Callers
 * get [] and render the control with just "Default template" plus whatever the
 * post already carries.
 */
export async function listPostTemplates(): Promise<PostTemplate[]> {
  if (templateCache && Date.now() - templateCache.at < TEMPLATE_TTL_MS) {
    return templateCache.list;
  }
  try {
    const { data } = await adminFetch<{ data?: PostTemplate[] }>("/wp/v2/web/post-templates");
    const list = (data?.data ?? []).filter(
      (t): t is PostTemplate => typeof t?.file === "string" && typeof t?.name === "string" && t.file.length > 0,
    );
    // Don't cache an empty list from a plugin that isn't deployed yet — that
    // would pin the editor to a bare dropdown for ten minutes after the upload.
    if (list.length > 0) templateCache = { at: Date.now(), list };
    return list;
  } catch {
    return [];
  }
}
