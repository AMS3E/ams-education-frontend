// Exercises src/lib/admin/image-normalize.ts from node — the upload gate and
// optimizer have no test runner behind them, so this is the check to re-run
// after a sharp upgrade or any edit to the module. Every sample is generated
// here with sharp itself; nothing is fetched.
//
//   node --experimental-strip-types --no-warnings scripts/check-image-normalize.mjs
//
// Expectations: gif and svg come back as the SAME bytes; a WebP that fits
// comes back as the same bytes; jpeg/png/avif/tiff come back as WebP with a
// .webp name (a `.jpg.avif` double extension collapses to `.webp`), never
// larger than a share-safe original; alpha survives; anything over 2560 px is
// scaled to fit and flagged `resized`; EXIF rotation is baked in (40×20 tagged
// "rotate 90" → 20×40); garbage and an empty buffer are refused with the
// standard message. Exit code 1 on any miss.

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { normalizeUploadImage, UNSUPPORTED_IMAGE_MESSAGE, MAX_DIMENSION } = await import(
  path.join(here, "..", "src", "lib", "admin", "image-normalize.ts")
);

const solid = (w, h, background, channels = 3) => sharp({ create: { width: w, height: h, channels, background } });
/** A photo-like sample: gradients + text, so lossy encoders have real work. */
const scene = (w, h, alpha = false) =>
  sharp(Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#118ab2"/></radialGradient></defs>
    ${alpha ? "" : `<rect width="${w}" height="${h}" fill="#073b4c"/>`}
    <circle cx="${w * 0.4}" cy="${h * 0.5}" r="${Math.min(w, h) * 0.45}" fill="url(#g)"/>
    <text x="${w * 0.5}" y="${h * 0.55}" text-anchor="middle" font-family="Helvetica, Arial" font-size="${h / 6}" font-weight="700" fill="#ef476f">AMS</text>
  </svg>`));

const cases = [
  ["jpeg photo", await scene(800, 600).jpeg({ quality: 95 }).toBuffer(), "photo.jpg", { type: "image/webp", name: "photo.webp", from: "jpeg", notLarger: true }],
  ["png poster (no alpha)", await scene(800, 600).png().toBuffer(), "poster.png", { type: "image/webp", name: "poster.webp", from: "png", notLarger: true }],
  ["png with alpha", await scene(400, 300, true).png().toBuffer(), "logo.png", { type: "image/webp", name: "logo.webp", from: "png", alpha: true, notLarger: true }],
  ["webp that fits", await scene(800, 600).webp({ quality: 80 }).toBuffer(), "photo.webp", { type: "image/webp", same: true }],
  ["gif", await solid(8, 8, "#00ff00").gif().toBuffer(), "dot.gif", { type: "image/gif", same: true }],
  ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'), "logo.svg", { type: "image/svg+xml", same: true }],
  ["avif", await scene(640, 480).avif({ quality: 60 }).toBuffer(), "photo.avif", { type: "image/webp", name: "photo.webp", from: "avif", size: [640, 480] }],
  ["avif, double extension", await scene(640, 480).avif({ quality: 60 }).toBuffer(), "ai-teacher.jpg.avif", { type: "image/webp", name: "ai-teacher.webp", from: "avif" }],
  ["avif with alpha, EXIF rotate 90", await solid(40, 20, { r: 0, g: 0, b: 255, alpha: 0.5 }, 4).withMetadata({ orientation: 6 }).avif({ quality: 60 }).toBuffer(), "sideways", { type: "image/webp", name: "sideways.webp", from: "avif", size: [20, 40], alpha: true }],
  ["tiff", await scene(320, 240).tiff().toBuffer(), "scan.tiff", { type: "image/webp", name: "scan.webp", from: "tiff" }],
  ["oversized png 4000×1000", await scene(4000, 1000).png().toBuffer(), "wide.png", { type: "image/webp", name: "wide.webp", from: "png", size: [2560, 640], resized: true }],
  ["oversized webp 1000×3000", await scene(1000, 3000).webp().toBuffer(), "tall.webp", { type: "image/webp", name: "tall.webp", size: [853, 2560], resized: true, noFrom: true }],
  ["tiny png (WebP would not help)", await solid(4, 4, "#ff0000").png().toBuffer(), "dot.png", { notLarger: true, tinyRule: true }],
  ["garbage bytes", Buffer.from("definitely not an image"), "notes.txt", { refused: true }],
  ["empty buffer", Buffer.alloc(0), "empty.avif", { refused: true }],
];

let misses = 0;
const miss = (label, why) => { misses++; console.log(`  MISS ${label}: ${why}`); };
for (const [label, buf, name, want] of cases) {
  const r = await normalizeUploadImage(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), name);
  if (want.refused) {
    if (!("error" in r)) miss(label, "was accepted");
    else if (r.error !== UNSUPPORTED_IMAGE_MESSAGE) miss(label, `unexpected message: ${r.error}`);
    else console.log(`  ok   ${label.padEnd(34)} refused`);
    continue;
  }
  if ("error" in r) { miss(label, `refused: ${r.error}`); continue; }
  const meta = await sharp(r.body).metadata();
  if (want.type && r.type !== want.type) miss(label, `type ${r.type}, wanted ${want.type}`);
  if (want.same && (r.body.byteLength !== buf.byteLength || r.convertedFrom || r.resized)) miss(label, "bytes were changed");
  if (want.name && r.name !== want.name) miss(label, `name ${r.name}, wanted ${want.name}`);
  if (want.from && (r.convertedFrom !== want.from || meta.format !== "webp")) miss(label, `convertedFrom=${r.convertedFrom} format=${meta.format}`);
  if (want.noFrom && r.convertedFrom) miss(label, `convertedFrom should be absent, got ${r.convertedFrom}`);
  if (want.size && (meta.width !== want.size[0] || meta.height !== want.size[1])) miss(label, `${meta.width}x${meta.height}, wanted ${want.size.join("x")}`);
  if (want.resized && !r.resized) miss(label, "not flagged resized");
  if (!want.resized && r.resized) miss(label, "flagged resized");
  if (want.alpha && !meta.hasAlpha) miss(label, "alpha was lost");
  if (want.notLarger && r.body.byteLength > buf.byteLength) miss(label, `grew ${buf.byteLength} → ${r.body.byteLength}`);
  if (want.tinyRule && r.type === "image/png" && r.body.byteLength !== buf.byteLength) miss(label, "kept as png but bytes changed");
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) miss(label, `exceeds ${MAX_DIMENSION}px`);
  const saved = r.bytes.before ? Math.round((1 - r.bytes.after / r.bytes.before) * 100) : 0;
  console.log(`  ok   ${label.padEnd(34)} ${r.type.padEnd(13)} ${String(r.name).padEnd(18)} ${String(meta.width + "x" + meta.height).padEnd(9)} ${String(r.bytes.before).padStart(7)} → ${String(r.bytes.after).padStart(7)} B${r.convertedFrom ? ` (from ${r.convertedFrom}` : r.resized ? " (resized" : " (as-is"}${r.convertedFrom || r.resized ? `, ${saved}% saved)` : ")"}`);
}
console.log(misses ? `${misses} miss(es)` : "image-normalize: all checks passed");
process.exit(misses ? 1 : 0);
