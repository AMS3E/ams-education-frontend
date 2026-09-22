// Image normalization for uploads — the format gate AND the optimizer in
// front of WordPress. Pure module (sharp only, no Next imports) so node can
// exercise it: `node --experimental-strip-types --no-warnings scripts/check-image-normalize.mjs`.
//
// WHY THE GATE (measured 2026-09-22 on education post 131259): WordPress
// accepts AVIF, makes AVIF thumbnails, and the article looks fine everywhere
// EXCEPT the share card. Yoast SEO only emits og:image for jpeg/gif/png/webp
// (Image_Helper::$valid_image_types — the featured image is checked in
// is_valid_attachment and silently dropped), so the page ships with NO
// og:image and Facebook falls back to a random <img> on the page (the theme's
// SVG day/night icon, which it cannot render either). The post shares with no
// thumbnail. Editors save pictures from news sites that serve AVIF by default
// (`ai-teacher.jpg.avif`), and the KH Images plugin on the WordPress side
// cannot catch them: it converts in the wp-admin BROWSER only (uploads from
// here go straight to REST) and its input list is jpeg/png/webp anyway.
//
// WHY THE OPTIMIZER (same day): uploads from here reached WordPress byte for
// byte — a 15 MB JPEG stayed 15 MB, the 1080×1350 PNG posters editors export
// stayed ~3 MB each (74 of infotainment's last 111 PNGs were over 1 MB) —
// while the same file through wp-admin came back from KH Images as WebP at
// quality 80. This module now does what that plugin does, on the server, for
// every browser: WebP at the plugin's quality, capped at WordPress's own
// 2560 px big-image threshold. WebP as the share format was proven on the
// owner's Facebook the same day (education `/test-image-webp/`, Yoast emits
// it as og:image with og:image:type image/webp and Facebook rendered it).
//
// Rules, in order:
//   1. sniff the real format from the bytes (the browser's declared type is
//      empty or wrong often enough not to trust it); unreadable → refused;
//   2. gif and svg go up untouched (animation / WordPress's own SVG policy);
//   3. webp that already fits goes up untouched (re-encoding only loses);
//   4. everything else → rotate (bake the EXIF tag in), fit inside
//      MAX_DIMENSION, encode WebP at WEBP_QUALITY, alpha preserved;
//   5. if that came out no smaller and the original was already share-safe
//      (jpeg/png) and needed no resize, keep the original — never make a
//      file bigger.

import sharp from "sharp";

/** KH Images' setting on all three sites — parity with wp-admin uploads. */
export const WEBP_QUALITY = 80;
/** WordPress's big_image_size_threshold: what it would scale to anyway. */
export const MAX_DIMENSION = 2560;

export const UNSUPPORTED_IMAGE_MESSAGE =
  "This image format is not supported. Save it as JPG or PNG and try again.";

/** Left exactly as uploaded, with the content-type WordPress should see. */
const UNTOUCHED: Record<string, string> = {
  gif: "image/gif", // re-encoding would drop the animation
  svg: "image/svg+xml", // WordPress decides (KH Images' svg_upload is off everywhere)
};

/** Already usable on the share card; kept as-is when WebP would not be smaller. */
const SHARE_SAFE: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Bytes travel as `Uint8Array<ArrayBuffer>`: that is what `fetch` accepts as
 *  a body under TS 5.9's typed-array generics, while sharp hands back
 *  `Buffer<ArrayBufferLike>`, which it does not. */
export type ImageBytes = Uint8Array<ArrayBuffer>;

export interface NormalizedImage {
  body: ImageBytes;
  /** Content-type to send WordPress — from the bytes, not from the browser. */
  type: string;
  /** Filename to send; the extension follows the bytes on conversion. */
  name: string;
  /** The source format ("jpeg", "avif"…) when the bytes were re-encoded to
   *  WebP. Absent when the file went up as-is or was only resized. */
  convertedFrom?: string;
  /** Set when the image was scaled down to fit MAX_DIMENSION. */
  resized?: boolean;
  /** Bytes in and out, for the "saved 85%" note. */
  bytes: { before: number; after: number };
}

export interface NormalizeFailure {
  error: string;
}

/** `photo.jpg` → `photo.webp`, and `ai-teacher.jpg.avif` (a JPEG re-saved as
 *  AVIF by a news site, the common shape) → `ai-teacher.webp`, not `.jpg.webp`. */
function webpName(name: string): string {
  return name.replace(/(\.(avif|heic|heif|jpe?g|jfif|png|gif|webp|tiff?|bmp))+$/i, "") + ".webp";
}

/** sharp reports AVIF and HEIC alike as "heif"; the codec tells them apart. */
function formatLabel(format: string, compression?: string): string {
  if (format === "heif") return compression === "av1" ? "avif" : "heic";
  return format;
}

export async function normalizeUploadImage(
  body: ImageBytes,
  name: string,
): Promise<NormalizedImage | NormalizeFailure> {
  const before = body.byteLength;
  const asIs = (type: string): NormalizedImage => ({ body, type, name, bytes: { before, after: before } });

  // Not an image sharp can read: HEIC (the prebuilt libvips carries no HEVC
  // decoder), BMP, PDF, or not an image at all. The constructor itself throws
  // on an empty buffer, so the whole read sits inside the try.
  let format: string | undefined;
  let compression: string | undefined;
  let width = 0;
  let height = 0;
  try {
    ({ format, compression, width = 0, height = 0 } = await sharp(body).metadata());
  } catch {
    return { error: UNSUPPORTED_IMAGE_MESSAGE };
  }
  if (!format) return { error: UNSUPPORTED_IMAGE_MESSAGE };

  if (UNTOUCHED[format]) return asIs(UNTOUCHED[format]);

  const oversized = width > MAX_DIMENSION || height > MAX_DIMENSION;
  if (format === "webp" && !oversized) return asIs(SHARE_SAFE.webp);

  let out: Buffer;
  try {
    out = await sharp(body)
      .rotate() // bake the EXIF orientation in — the tag does not survive re-encoding
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return { error: UNSUPPORTED_IMAGE_MESSAGE };
  }

  // Never hand WordPress a bigger file than it was given: a tiny graphic or
  // an already-tight JPEG can come out larger, and those were fine as they were.
  if (!oversized && SHARE_SAFE[format] && out.byteLength >= before) return asIs(SHARE_SAFE[format]);

  return {
    body: new Uint8Array(out), // copies into a fresh ArrayBuffer (see ImageBytes)
    type: "image/webp",
    name: webpName(name),
    convertedFrom: format === "webp" ? undefined : formatLabel(format, compression),
    resized: oversized || undefined,
    bytes: { before, after: out.byteLength },
  };
}
