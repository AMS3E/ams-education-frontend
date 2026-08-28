// Splitting Slider Revolution modules out of a WordPress article body.
//
// THE PROBLEM THIS SOLVES. `post_content` carries a slider's BODY but not its
// RUNTIME. WordPress emits sr7.css, tptools.js, sr7.js, the `_tpt` bootstrap and
// the ~51KB-per-module `SR7.JSON` config from `wp_head()`/`wp_footer()` — none
// of which a REST payload can carry. Dropped into our page the markup therefore
// renders as unregistered custom elements: measured on the live article, every
// `<sr7-module>` computed to `display: inline` at 29–77px tall against the
// 477–1069px the modules actually declare.
//
// So we do not try to render the module. We cut it out and hand the alias to
// `/sr-embed`, the WordPress route that renders one slider as a standalone page
// with its runtime intact (plugin 1.8.0), and frame that.
//
// EVERYTHING HERE IS INERT FOR ORDINARY ARTICLES. `splitBody` early-outs on a
// substring test and returns the input untouched. Measured across 40 recent
// articles: none contain the marker, median body 7,797 chars, and the guard
// costs 0.467µs on the largest of them. The article that drove this work is
// 144,313 chars — these posts are a different species, not a different size.

/** The wrapper class Gutenberg's Slider Revolution block emits. Plugin-specific
 *  enough that prose will never contain it by accident. */
const MARKER = "wp-block-themepunch-revslider";

/** A module's declared size, per SR's own breakpoint arrays — used to reserve
 *  space so framing a slider costs no layout shift. Desktop and mobile differ
 *  enough to need both (993×589 vs 480×519 on the first module measured). */
export interface SliderRatio {
  desktop: string;
  mobile: string;
}

export type BodyPart =
  | { type: "html"; html: string }
  | { type: "slider"; alias: string; ratio: SliderRatio | null };

/**
 * Index just past the `</div>` closing the `<div>` that starts at `openStart`.
 *
 * Depth-counted rather than "find the next `</div>`". The wrappers measured on
 * the live article happen to hold no nested `<div>` — their children are `<p>`,
 * the `<sr7-*>` custom elements and a `<script>` — but that is the CMS's current
 * output, not a guarantee, and a naive scan would truncate the block the first
 * time an editor nests anything. Returns -1 when the tag never closes, which the
 * caller treats as "leave this body alone".
 */
function matchingDivEnd(html: string, openStart: number): number {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openStart;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0][1] === "/") {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

/**
 * The alias `/sr-embed` should be asked for.
 *
 * Read off the INNER `<sr7-module data-alias>`, never the wrapper's
 * `data-slidertitle` — they disagree, and silently. On the live article the
 * second wrapper is `data-slidertitle="INFHB010_02"` while its module is
 * `data-alias="infhb010_01-1"`; keying on the title would have requested a
 * slider that does not exist and framed a 404.
 */
function readAlias(block: string): string | null {
  const m = block.match(/<sr7-module\b[^>]*\bdata-alias="([^"]+)"/i);
  return m ? m[1] : null;
}

/**
 * The module's declared geometry, recovered from the `prepareModuleHeight` stub
 * SR ships beside each module. `gw`/`gh` are per-breakpoint arrays whose first
 * entry is desktop and last is mobile.
 *
 * This stub is otherwise dead weight to us — it guards on `window._tpt`, which
 * only exists inside the frame — so reading its numbers on the way past is the
 * one useful thing it can still do.
 */
function readRatio(block: string): SliderRatio | null {
  const m = block.match(/prepareModuleHeight\(\{[\s\S]*?gh:\[([^\]]+)\][\s\S]*?gw:\[([^\]]+)\]/);
  if (!m) return null;

  const gh = m[1].split(",").map(Number);
  const gw = m[2].split(",").map(Number);
  const ok = (n: number) => Number.isFinite(n) && n > 0;

  const dw = gw[0];
  const dh = gh[0];
  const mw = gw[gw.length - 1];
  const mh = gh[gh.length - 1];
  if (!ok(dw) || !ok(dh) || !ok(mw) || !ok(mh)) return null;

  return { desktop: `${dw} / ${dh}`, mobile: `${mw} / ${mh}` };
}

/**
 * Split an article body into HTML runs and the sliders between them.
 *
 * A body with no slider comes back as a single html part holding the SAME
 * string reference it was given, so the ordinary render path is not merely
 * equivalent — it is identical.
 */
export function splitBody(html: string): BodyPart[] {
  if (!html.includes(MARKER)) return [{ type: "html", html }];

  const parts: BodyPart[] = [];
  const openRe = new RegExp(`<div\\b[^>]*class="[^"]*${MARKER}[^"]*"[^>]*>`, "gi");
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(html)) !== null) {
    const start = m.index;
    const end = matchingDivEnd(html, start);
    // Unclosed wrapper, or a module with no alias to ask for: leave the markup
    // where it is. It renders as it does today — collapsed, but no worse — and
    // that beats dropping an editor's content on the floor.
    if (end === -1) break;

    const block = html.slice(start, end);
    const alias = readAlias(block);
    if (!alias) {
      openRe.lastIndex = end;
      continue;
    }

    if (start > cursor) parts.push({ type: "html", html: html.slice(cursor, start) });
    parts.push({ type: "slider", alias, ratio: readRatio(block) });

    cursor = end;
    openRe.lastIndex = end;
  }

  if (cursor < html.length) parts.push({ type: "html", html: html.slice(cursor) });
  return parts;
}
