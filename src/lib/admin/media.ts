// Media read layer + item writes (alt text, delete). 115k items, so lists are
// always paginated + search-first. WordPress caps per_page at 100; the grid
// uses 48.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";

interface RawMedia {
  id: number;
  date: string;
  title?: { rendered?: string };
  source_url?: string;
  mime_type?: string;
  media_type?: string; // core only ever says "image" | "file" — see kindFromMime
  alt_text?: string;
  author?: number;
  media_details?: {
    width?: number;
    height?: number;
    filesize?: number;
    sizes?: Record<string, { source_url?: string }>;
  };
  _embedded?: { author?: { name?: string }[] };
}

export interface MediaItem {
  id: number;
  title: string;
  url: string;
  /** Small preview URL (thumbnail/medium), falling back to the full source. */
  thumb: string;
  mime: string;
  type: string; // image | video | audio | file
  width: number;
  height: number;
  /** "1920 × 1080", or "" for non-images. */
  dims: string;
  size: string; // human-readable, or ""
  date: string; // dd/mm/yyyy
  authorName: string;
  alt: string;
}

export interface MediaListResult {
  items: MediaItem[];
  total: number;
  totalPages: number;
  page: number;
}

function humanSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayDate(dt: string): string {
  const [d] = (dt ?? "").split("T");
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dt;
}

/** WordPress's `media_type` — REST core and fast.php alike — is only ever
 *  'image' or 'file', so a video's is 'file' and every UI branch keyed on
 *  type === 'video' silently never fires. The MIME root is the truth. */
function kindFromMime(mime: string): string {
  const root = (mime ?? "").split("/")[0];
  return root === "image" || root === "video" || root === "audio" ? root : "file";
}

function map(m: RawMedia): MediaItem {
  const det = m.media_details ?? {};
  const sizes = det.sizes ?? {};
  return {
    id: m.id,
    title: decodeEntities(m.title?.rendered ?? "").trim() || `#${m.id}`,
    url: m.source_url ?? "",
    thumb: sizes.thumbnail?.source_url ?? sizes.medium?.source_url ?? m.source_url ?? "",
    mime: m.mime_type ?? "",
    type: kindFromMime(m.mime_type ?? ""),
    width: det.width ?? 0,
    height: det.height ?? 0,
    dims: det.width && det.height ? `${det.width} × ${det.height}` : "",
    size: humanSize(det.filesize),
    date: displayDate(m.date),
    authorName: m._embedded?.author?.[0]?.name ?? "",
    alt: m.alt_text ?? "",
  };
}

/** `token` = explicit session token from the BFF route; omitted, the cookie
 *  is read here. */
export async function listMedia(params: { page?: number; perPage?: number; search?: string; mediaType?: string; author?: number } = {}, token?: string): Promise<MediaListResult> {
  const page = Math.max(1, params.page ?? 1);
  const started = Date.now();
  const { data, total, totalPages } = await adminFetch<RawMedia[]>("/wp/v2/media", {
    token,
    query: {
      context: "edit",
      page,
      per_page: params.perPage ?? 48,
      search: params.search,
      media_type: params.mediaType, // image | video | audio
      author: params.author,
      orderby: "date",
      order: "desc",
      _embed: "author",
      _fields: "id,date,title,source_url,mime_type,media_type,alt_text,author,media_details,_links,_embedded",
    },
  });
  // Diagnostics: the media endpoint has been observed answering [] with real
  // totals, and hanging into the 30s abort. Log the anomalies, not the norm.
  const ms = Date.now() - started;
  const count = Array.isArray(data) ? data.length : -1;
  if (ms > 10_000 || count <= 0) {
    console.warn(`[listMedia] page=${page} type=${params.mediaType ?? "all"} q=${params.search ?? ""} -> items=${count} total=${total} in ${ms}ms`);
  }
  return { items: (data ?? []).map(map), total, totalPages, page };
}

type MediaListParams = { page?: number; perPage?: number; search?: string; mediaType?: string; author?: number };

/** A row as fast.php's ?r=media emits it: URLs already resolved server-side
 *  (offloaded -> CDN, THE 642 -> local), sizes/filesize read from metadata. */
interface FastMediaRow {
  id: number;
  title: string;
  date: string;
  url: string;
  thumb: string;
  mime: string;
  type: string;
  width: number;
  height: number;
  filesize: number;
  author: number;
  authorName: string;
  alt: string;
}

/** Deliberately reuses humanSize/displayDate/decodeEntities so the two paths
 *  cannot drift on formatting — a row difference is a DATA difference. */
function mapFastMedia(m: FastMediaRow): MediaItem {
  return {
    id: m.id,
    title: decodeEntities(m.title ?? "").trim() || `#${m.id}`,
    url: m.url ?? "",
    thumb: m.thumb || m.url || "",
    mime: m.mime ?? "",
    type: kindFromMime(m.mime ?? ""),
    width: m.width ?? 0,
    height: m.height ?? 0,
    dims: m.width && m.height ? `${m.width} × ${m.height}` : "",
    size: humanSize(m.filesize),
    date: displayDate(m.date),
    authorName: m.authorName ?? "",
    alt: m.alt ?? "",
  };
}

/** The same grid page from the fast path. */
export async function listMediaFast(params: MediaListParams = {}, token?: string): Promise<MediaListResult> {
  const body = await fastFetch<{ items: FastMediaRow[]; total: number; totalPages: number; page: number }>(
    "media",
    {
      page: Math.max(1, params.page ?? 1),
      per_page: params.perPage ?? 48,
      q: params.search?.trim(),
      media_type: params.mediaType,
    },
    { token },
  );
  const data = body.data;
  return {
    items: (data.items ?? []).map(mapFastMedia),
    total: data.total,
    totalPages: data.totalPages,
    page: data.page,
  };
}

/** The read the BFF should call: fast path first, WP REST if unavailable. */
export function readMedia(params: MediaListParams = {}, token?: string): Promise<MediaListResult> {
  return withRestFallback(
    "media",
    () => listMediaFast(params, token),
    () => listMedia(params, token),
  );
}

/** Update an attachment's alt text (needs edit rights on the attachment). */
export async function updateMediaAlt(id: number, alt: string): Promise<void> {
  await adminFetch(`/wp/v2/media/${id}`, { method: "POST", body: { alt_text: alt } });
}

/** Permanently delete an attachment. `force` is mandatory — attachments have
 *  no trash over REST, WordPress rejects a soft delete outright. */
export async function deleteMediaItem(id: number): Promise<void> {
  await adminFetch(`/wp/v2/media/${id}`, { method: "DELETE", query: { force: true } });
}
