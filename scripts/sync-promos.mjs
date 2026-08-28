// Copy Slider Revolution ad exports from the (gitignored) `temp/ads` drop folder
// into `public/promos`, which is what the site actually serves.
//
// Run this after replacing a creative in `temp/ads`:  npm run sync:promos
//
// Each export needs one edit to survive being embedded in a bare iframe: sr7.css
// ships no body reset, because it assumes a WordPress theme underneath. We inject
// one. Re-running is safe — the injection is skipped if already present.
import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Source folder under `temp/ads` -> destination slug under `public/promos`.
 *  Keep the slugs in sync with `src/lib/promos.ts`. */
const CREATIVES = {
  "01_KB-PRASAC-BANK_PORTRAIT": "kb-prasac-portrait",
  "01_KB-PRASAC-BANK_HALF-LANDSCAPE-SHORT": "kb-prasac-landscape-short",
  "01_KB-PRASAC-BANK_HALF-LANDSCAPE": "kb-prasac-half-landscape",
  "01_KB-PRASAC-BANK_FULL-LANDSCAPE": "kb-prasac-full-landscape",
};

const RESET = `\t\t<!-- Injected by scripts/sync-promos.mjs. sr7.css ships no body reset; it
\t\t     expects a WordPress theme underneath. We embed this in a bare iframe. -->
\t\t<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>`;

/** The exports arrive double-nested (`NAME/NAME/index.html`). Unwrap that. */
async function findExportRoot(dir) {
  if (existsSync(join(dir, "index.html"))) return dir;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const found = await findExportRoot(join(dir, entry.name));
      if (found) return found;
    }
  }
  return null;
}

let failed = false;

for (const [source, slug] of Object.entries(CREATIVES)) {
  const from = join(root, "temp", "ads", source);
  const to = join(root, "public", "promos", slug);

  if (!existsSync(from)) {
    console.error(`✗ ${slug}: missing source temp/ads/${source}`);
    failed = true;
    continue;
  }

  const exportRoot = await findExportRoot(from);
  if (!exportRoot) {
    console.error(`✗ ${slug}: no index.html anywhere under temp/ads/${source}`);
    failed = true;
    continue;
  }

  await rm(to, { recursive: true, force: true });
  await cp(exportRoot, to, { recursive: true });

  const indexPath = join(to, "index.html");
  const html = await readFile(indexPath, "utf8");

  // Anchor on the stylesheet link the export always emits.
  const anchor = /(<link[^>]+id=['"]sr7css-css['"][^>]*>)/;
  if (!anchor.test(html)) {
    console.error(`✗ ${slug}: could not find the sr7css-css <link> to anchor the reset to`);
    failed = true;
    continue;
  }
  await writeFile(indexPath, html.replace(anchor, `$1\n\n${RESET}`), "utf8");

  const { size } = await stat(indexPath);
  console.log(`✓ ${slug}  (from ${source}, index.html ${size}b, reset injected)`);
}

if (failed) process.exit(1);
console.log("\nSynced. Dimensions live in src/lib/promos.ts — update them if a creative was resized.");
