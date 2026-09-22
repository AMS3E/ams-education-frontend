// Media upload core — shared by the /api/admin/upload Route Handler.
//
// Uploads deliberately do NOT travel through a Server Action: the action
// layer's FormData/File encoding 500'd even on small files (observed in dev,
// opaque RSC digest errors), and a Route Handler receiving the raw multipart
// body is the standard Next pattern for binary payloads anyway. This module
// is plain server code (reads next/headers) — import it from Route Handlers
// or other server code, never a Client Component.

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { normalizeUploadImage, type ImageBytes } from "./image-normalize";

const BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";

export interface UploadResult {
  ok: boolean;
  error?: string;
  /** 401 marker so the client can route to /login instead of showing an error. */
  authExpired?: boolean;
  /** Present on success. */
  id?: number;
  thumb?: string;
  /** Full-size source URL (body-editor embeds want this, not the thumb). */
  url?: string;
  /** Set when the gate re-encoded the image to WebP: the source format
   *  ("jpeg", "avif"…), for the UI's "Converted from JPEG to WebP" note. */
  convertedFrom?: string;
  /** Set when the gate scaled the image down to fit 2560 px. */
  resized?: boolean;
  /** Bytes in and out of the gate (images only), for the "saved 85%" note. */
  bytes?: { before: number; after: number };
}

/** Keep a recognizable ASCII filename for the Content-Disposition header;
 *  WordPress derives the attachment slug from it. Khmer/emoji filenames become
 *  "upload-<ts>.<ext>" rather than a header WP might reject. */
function asciiFilename(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  if (/^[\w-]+\.[A-Za-z0-9]+$/.test(cleaned)) return cleaned;
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? "bin";
  return `upload-${Date.now()}.${ext}`;
}

/** Per-type ceilings. OUR caps, not the host's: the WP server's own PHP
 *  `upload_max_filesize` is invisible from here and wins regardless — a file
 *  over that limit comes back as "WordPress rejected the upload (413)", and
 *  raising it is an aaPanel setting, not code. */
const MAX_BYTES: Record<string, number> = {
  image: 20 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  video: 300 * 1024 * 1024,
};

/**
 * Upload one media file (image / video / audio) to the WordPress library as
 * the logged-in user (raw-body POST wp/v2/media — the standard core contract).
 *
 * Images pass through `image-normalize.ts` first — the format gate and the
 * optimizer in one: the real format is sniffed from the bytes, gif/svg and
 * WebP that already fits go up untouched, everything else is re-encoded to
 * WebP at 80 inside 2560 px (what the KH Images plugin does for wp-admin
 * uploads, and the reason an AVIF featured image shared with no thumbnail).
 * See that file for the why. Video and audio are forwarded as they arrive.
 *
 * ⚠ s3.ams.com.kh offload plugin behavior over REST is still being verified —
 * first live test tells us whether the offload layer honors this contract.
 */
export async function uploadImage(file: unknown): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file first." };
  // The browser's declared type picks the lane (and the cap). An EMPTY type is
  // treated as an image: that is what some OS/browser pairs report for AVIF
  // and HEIC — exactly the files the gate exists for — and the sniff refuses
  // anything that is not actually an image.
  const declared = file.type;
  const root = declared ? declared.split("/")[0] : "image";
  const cap = MAX_BYTES[root];
  if (!cap) return { ok: false, error: "Only images, video and audio can be uploaded." };
  if (file.size > cap) return { ok: false, error: `Keep ${root} uploads under ${Math.round(cap / (1024 * 1024))} MB.` };

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, authExpired: true, error: "Session expired — log in again." };

  let body: ImageBytes = new Uint8Array(await file.arrayBuffer());
  let type = declared;
  let name = file.name;
  let convertedFrom: string | undefined;
  let resized: boolean | undefined;
  let bytes: { before: number; after: number } | undefined;
  if (root === "image") {
    const image = await normalizeUploadImage(body, name);
    if ("error" in image) {
      return { ok: false, error: declared ? image.error : "Only images, video and audio can be uploaded." };
    }
    if (image.convertedFrom || image.resized) {
      const saved = image.bytes.before ? Math.round((1 - image.bytes.after / image.bytes.before) * 100) : 0;
      console.info(
        `[uploadImage] ${image.convertedFrom ?? "webp"} → webp${image.resized ? " (resized)" : ""}: ${name} (${image.bytes.before} → ${image.bytes.after} bytes, ${saved}% saved)`,
      );
    }
    ({ body, type, name, convertedFrom, resized, bytes } = image);
  }

  const res = await fetch(`${BASE}/wp/v2/media`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "X-AMS-Token": token,
      "content-type": type,
      "content-disposition": `attachment; filename="${asciiFilename(name)}"`,
    },
    body,
    cache: "no-store",
    // Bounded, but sized to the payload: a 300MB video on this slow host is
    // minutes, not the 2 minutes an image gets.
    signal: AbortSignal.timeout(root === "image" ? 120_000 : 600_000),
  }).catch(() => null);

  if (!res) return { ok: false, error: "Couldn't reach WordPress." };
  if (res.status === 401) return { ok: false, authExpired: true, error: "Session expired — log in again." };
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn(`[uploadImage] WP ${res.status}: ${detail.slice(0, 200)}`);
    return { ok: false, error: `WordPress rejected the upload (${res.status}).` };
  }

  const created = (await res.json().catch(() => null)) as
    | { id?: number; source_url?: string; media_details?: { sizes?: Record<string, { source_url?: string }> } }
    | null;
  if (!created?.id) return { ok: false, error: "Upload succeeded but the response was unreadable." };
  return {
    ok: true,
    id: created.id,
    thumb:
      created.media_details?.sizes?.thumbnail?.source_url ??
      created.media_details?.sizes?.medium?.source_url ??
      created.source_url ??
      "",
    url: created.source_url ?? "",
    convertedFrom,
    resized,
    bytes,
  };
}
