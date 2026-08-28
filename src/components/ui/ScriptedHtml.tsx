"use client";

import { useEffect, useMemo, useRef } from "react";

// CMS HTML whose <script> tags actually run.
//
// The bug this exists for: browsers do not execute scripts inserted via
// innerHTML, which is exactly how dangerouslySetInnerHTML works. Land on an
// article directly and the server-rendered script tag runs; click through from
// the homepage and it never does — so TikTok embeds degraded to their fallback
// blockquote and the /contact form's plugin never initialised (AUDIT.md Tier 2
// §13 and the Session A discovery).
//
// The fix: the scripts are STRIPPED from the rendered HTML — so the browser
// never runs them natively on a full load either — and re-created with
// document.createElement after mount, which does execute. One code path for
// hard loads and soft navigations alike, each script running exactly once.

interface ExtractedScript {
  attrs: [string, string][];
  text: string;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const ATTR_RE = /([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/g;

/** Split CMS HTML into script-free markup + the scripts to run. Deterministic
 *  string work only — it runs during render on server and client, and the two
 *  must agree or hydration fails. */
function extractScripts(html: string): { safe: string; scripts: ExtractedScript[] } {
  const scripts: ExtractedScript[] = [];
  const safe = html.replace(SCRIPT_RE, (_, rawAttrs: string, text: string) => {
    const attrs: [string, string][] = [];
    for (const m of rawAttrs.matchAll(ATTR_RE)) {
      attrs.push([m[1], m[3] ?? m[4] ?? (m[2] && !m[2].startsWith('"') && !m[2].startsWith("'") ? m[2] : "")]);
    }
    scripts.push({ attrs, text });
    return "";
  });
  return { safe, scripts };
}

/** Renders `html` and executes its script tags after mount — sequentially, so a
 *  library and the inline snippet that calls it keep their order. */
export default function ScriptedHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Which html string the scripts have already run for — makes the effect
  // idempotent under Strict Mode's double-invoke and prop-stable re-renders.
  const ranFor = useRef<string | null>(null);

  const { safe, scripts } = useMemo(() => extractScripts(html), [html]);

  useEffect(() => {
    const root = ref.current;
    if (!root || scripts.length === 0 || ranFor.current === html) return;
    ranFor.current = html;

    let cancelled = false;
    (async () => {
      for (const s of scripts) {
        if (cancelled) return;
        const el = document.createElement("script");
        for (const [name, value] of s.attrs) el.setAttribute(name, value);
        el.text = s.text;
        root.appendChild(el);
        // An external script must finish before the next (possibly inline,
        // possibly depending on it) one starts.
        if (el.src) {
          await new Promise<void>((resolve) => {
            el.addEventListener("load", () => resolve());
            el.addEventListener("error", () => resolve());
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html, scripts]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
