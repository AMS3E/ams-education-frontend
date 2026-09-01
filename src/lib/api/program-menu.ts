// Temporary compatibility read for the public program-icon menu.
//
// The preferred source is fast.php's JSON `pub-menu` resource. Deploying the
// frontend and uploading that plugin are separate operations, though, and the
// currently deployed plugin predates Economy's `secondary-nav-v3-menu`
// allow-list entry. During that gap, read the exact same public menu from the
// WordPress homepage markup instead of publishing an empty header.

import { safeTags } from "./client";

const API_BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";
const SITE_URL = API_BASE.replace(/\/wp-json\/?$/, "");

export interface RenderedProgramIcon {
  title: string;
  image: string;
  slug: string;
  href: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(markup: string, name: string): string {
  const match = new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(markup);
  return match ? decodeHtml(match[1]) : "";
}

/** Parse only `#menu-secondary-nav-v3-menu`; no other homepage navigation is
 * accepted. WordPress emits a flat list here, so the first closing `</ul>` is
 * the complete menu rather than a nested-menu ambiguity. */
export function parseRenderedProgramIcons(html: string): RenderedProgramIcon[] {
  const menu = /<ul\b[^>]*\bid=["']menu-secondary-nav-v3-menu["'][^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1];
  if (!menu) return [];

  const icons: RenderedProgramIcon[] = [];
  for (const match of menu.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)) {
    const [, liAttrs, body] = match;
    const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(body);
    const image = /<img\b([^>]*)>/i.exec(anchor?.[2] ?? "");
    const title = /<span\b[^>]*class=["'][^"']*menu-image-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(anchor?.[2] ?? "");
    const href = attribute(anchor?.[1] ?? "", "href");
    const src = attribute(image?.[1] ?? "", "src");
    if (!href || !src) continue;

    const id = /\bmenu-item-(\d+)\b/i.exec(attribute(liAttrs, "id"))?.[1] ?? String(icons.length);
    icons.push({
      title: decodeHtml((title?.[1] ?? "").replace(/<[^>]+>/g, "")).trim(),
      image: src,
      slug: `menu-${id}`,
      href,
    });
  }
  return icons;
}

export async function fetchRenderedProgramIcons(): Promise<RenderedProgramIcon[]> {
  const response = await fetch(`${SITE_URL}/`, {
    next: { revalidate: 3600, tags: safeTags(["menu"]) },
    headers: { accept: "text/html" },
  });
  if (!response.ok) throw new Error(`AMS homepage ${response.status}`);

  const icons = parseRenderedProgramIcons(await response.text());
  if (!icons.length) throw new Error("Secondary Nav v3 Menu was not found in the AMS homepage");
  return icons;
}
