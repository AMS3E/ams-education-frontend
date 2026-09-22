"use client";

// Client side of the media upload: posts the file to /api/admin/upload (a
// Route Handler — raw multipart, no Server Action re-encoding; see
// src/lib/admin/upload.ts) and normalizes every failure into a message the
// button can show. Never throws.

import type { UploadResult } from "@/lib/admin/upload";

export type { UploadResult };

/** What the server's gate forwards untouched — mirror of the UNTOUCHED table
 *  (plus WebP) in lib/admin/image-normalize.ts. Every other image comes back
 *  as WebP. */
const UNTOUCHED_TYPES = new Set(["image/gif", "image/webp", "image/svg+xml"]);
const UNTOUCHED_EXT = /\.(gif|webp|svg)$/i;

/** The source format, upper-cased ("JPEG", "AVIF"), when this image is going
 *  to be re-encoded on the server — so the button can read "Converting JPEG
 *  to WebP…" while the request runs. null for anything that goes up as-is,
 *  and for video/audio. Only a label: the server decides from the real bytes. */
export function conversionSource(file: File): string | null {
  const root = file.type ? file.type.split("/")[0] : "image";
  if (root !== "image") return null;
  if (file.type ? UNTOUCHED_TYPES.has(file.type) : UNTOUCHED_EXT.test(file.name)) return null;
  const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1];
  return (ext || file.type.replace(/^image\//, "") || "image").replace(/^jpg$/i, "JPEG").toUpperCase();
}

/** The after-the-fact note for a result the server changed, or null:
 *  "Converted from JPEG to WebP · saved 85%", "Resized to fit 2560 px". */
export function convertedNote(res: UploadResult): string | null {
  const parts: string[] = [];
  if (res.convertedFrom) parts.push(`Converted from ${res.convertedFrom.toUpperCase()} to WebP`);
  else if (res.resized) parts.push("Resized to fit 2560 px");
  if (!parts.length) return null;
  if (res.bytes && res.bytes.before > 0 && res.bytes.after < res.bytes.before) {
    parts.push(`saved ${Math.round((1 - res.bytes.after / res.bytes.before) * 100)}%`);
  }
  return parts.join(" · ");
}

export async function uploadImageFile(file: File): Promise<UploadResult> {
  try {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as UploadResult | null;
    if (data) return data;
    return { ok: false, error: `Upload failed (${res.status}) — check the server console.` };
  } catch {
    return { ok: false, error: "Upload didn't reach the server — check the connection and try again." };
  }
}
