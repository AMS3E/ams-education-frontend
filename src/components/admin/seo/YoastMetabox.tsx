"use client";

// The Yoast-lookalike metabox, extracted so it renders in TWO places off one
// component: under the article in the editor (wp-admin's anatomy — controlled,
// no save button of its own, the editor's Save/Publish carries the fields) and
// inside the SEO workbench (SeoPanel wraps it and passes a save bar as
// `footer`). Focus keyphrase, Google preview (mobile/desktop), SEO title /
// slug / meta description, and the analysis list.
//
// DELIBERATELY LIGHT-ONLY, like the Gutenberg canvas (design doc §3): Yoast's
// UI is light-only, and the Google preview is a preview of a white Google
// results page — painting it with admin dark tokens would break the fidelity
// that is its entire point. The chrome AROUND the sheet stays on ac.* tokens.
//
// The analysis is deterministic checks only (lengths, presence, pixel width) —
// Yoast's real scoring engine has no Khmer support, so its traffic-light
// verdicts would be noise here. Decided with the owner; we take that L.

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { css } from "@/styled-system/css";
import { Icon } from "../icons";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/* ---- Yoast's own light palette (literals on purpose — see header) ---- */
export const Y = {
  purple: "#a4286a", // Yoast primary
  purpleSoft: "rgba(164, 40, 106, 0.12)",
  text: "#1e1e1e",
  label: "#303030",
  sub: "#50575e",
  border: "#c3c4c7", // WP metabox border
  hairline: "#f0f0f1",
  inputBorder: "#949494",
  inputBg: "#ffffff",
  readonlyBg: "#f6f7f7",
  good: "#7ad03a",
  warn: "#ee7c1b",
  bad: "#dc3232",
  gLink: "#1a0dab",
  gMeta: "#4d5156",
  gSite: "#202124",
} as const;

/** Google truncates titles by rendered width, not characters — the only honest
 *  ruler for Khmer, whose glyphs run wide. ~600px is the desktop limit. */
const TITLE_LIMIT_PX = 600;

let measureCanvas: HTMLCanvasElement | null = null;
function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return 0;
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Client-mount flag WITHOUT setState-in-effect (forbidden by the repo lint):
 *  the server snapshot is false, the client store is permanently true, so the
 *  hydration render matches the server HTML and the measured bits (canvas
 *  text widths) appear on the first client re-render. */
const noopSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** "2026-07-30T10:42:02" -> "30 Jul 2026" (how Google prefixes dated snippets). */
function googleDate(iso: string): string {
  const [d] = (iso ?? "").split("T");
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return "";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

type Verdict = "good" | "warn" | "bad";
interface Check {
  verdict: Verdict;
  text: string;
}

const dot = (v: Verdict) => (v === "good" ? Y.good : v === "warn" ? Y.warn : Y.bad);

/* ---- tiny styled pieces ---------------------------------------------- */

const labelClass = css({ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" });
const fieldClass = css({
  width: "100%",
  padding: "9px 12px",
  borderRadius: "6px",
  fontSize: "13.5px",
  lineHeight: 1.5,
  outline: "none",
  _focusVisible: { boxShadow: "0 0 0 3px rgba(164,40,106,0.25)" },
});
const fieldStyle = { background: Y.inputBg, border: `1px solid ${Y.inputBorder}`, color: Y.text } as const;

/** Yoast's little length gauge under a snippet field. */
function LengthBar({ ratio, verdict }: { ratio: number; verdict: Verdict }) {
  return (
    <div className={css({ height: "5px", borderRadius: "3px", marginTop: "7px", overflow: "hidden" })} style={{ background: "#e0e0e0", maxWidth: "600px" }}>
      <div
        className={css({ height: "100%", borderRadius: "3px", transition: "width .15s, background .15s" })}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`, background: dot(verdict) }}
      />
    </div>
  );
}

/** The tab strip's score smiley — a filled circle in the overall colour. */
function ScoreDot({ color }: { color: string }) {
  return (
    <span aria-hidden className={css({ width: "13px", height: "13px", borderRadius: "50%", flex: "none", display: "inline-block" })} style={{ background: color }} />
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ borderTop: `1px solid ${Y.hairline}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={css({
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: 600,
          textAlign: "left",
        })}
        style={{ color: Y.label }}
      >
        {title}
        <Icon name={open ? "chevronDown" : "chevronRight"} size={16} strokeWidth={2} style={{ color: Y.sub, transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open ? <div className={css({ padding: "0 24px 22px" })}>{children}</div> : null}
    </div>
  );
}

/* ---- Google preview ---------------------------------------------------- */

function Favicon({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className={css({ borderRadius: "50%", display: "grid", placeItems: "center", flex: "none" })}
      style={{ width: size, height: size, background: "#f1f3f4" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset at favicon size */}
      <img src="/ams-logo.svg" alt="" width={Math.round(size * 0.64)} height={Math.round(size * 0.64)} className={css({ borderRadius: "4px", display: "block" })} />
    </span>
  );
}

function GooglePreview({
  mode,
  title,
  description,
  date,
  slug,
  thumb,
}: {
  mode: "mobile" | "desktop";
  title: string;
  description: string;
  date: string;
  slug: string;
  /** Featured image URL; "" renders the text-only result, exactly like Google. */
  thumb: string;
}) {
  const host = SITE_URL.replace(/^https?:\/\//, "");
  const crumb = `${host} › article › ${slug || "…"}`;
  const mobile = mode === "mobile";

  // Google's article thumbnail: right of the snippet text, rounded square —
  // ~104px on mobile results, ~92px on desktop.
  const thumbImg = thumb ? (
    // eslint-disable-next-line @next/next/no-img-element -- same CDN URLs as the editor's own featured-image preview
    <img
      src={thumb}
      alt=""
      className={css({ flex: "none", objectFit: "cover", display: "block" })}
      style={mobile ? { width: 104, height: 104, borderRadius: 12, marginTop: 10 } : { width: 92, height: 92, borderRadius: 8, marginTop: 8 }}
    />
  ) : null;

  const head = (
    <div className={css({ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 })}>
      <Favicon size={mobile ? 28 : 26} />
      <span className={css({ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.35 })}>
        <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })} style={{ color: Y.gSite }}>
          {SITE_NAME}
        </span>
        <span className={css({ fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })} style={{ color: Y.gMeta }}>
          {crumb}
        </span>
      </span>
    </div>
  );

  const body = (
    <>
      {/* Desktop Google truncates the title with an ellipsis at ~600px; the
          browser's own nowrap+ellipsis reproduces that pixel behaviour exactly,
          Khmer included. Mobile wraps to two lines instead. */}
      <div
        className={
          mobile
            ? css({ fontSize: "16px", lineHeight: 1.3, marginTop: "10px", lineClamp: 2 })
            : css({ fontSize: "20px", lineHeight: 1.3, marginTop: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "600px" })
        }
        style={{ color: Y.gLink }}
      >
        {title}
      </div>
      <div
        className={mobile ? css({ fontSize: "14px", lineHeight: 1.57, marginTop: "4px", lineClamp: 3 }) : css({ fontSize: "14px", lineHeight: 1.57, marginTop: "4px", lineClamp: 2 })}
        style={{ color: Y.gMeta, maxWidth: mobile ? undefined : "600px" }}
      >
        {date ? <span>{date} — </span> : null}
        {description}
      </div>
    </>
  );

  return mobile ? (
    <div
      className={css({ borderRadius: "10px", padding: "14px 16px", maxWidth: "400px" })}
      style={{ background: "#fff", border: "1px solid #dfe1e5", boxShadow: "0 1px 6px rgba(32,33,36,0.12)" }}
    >
      {head}
      <div className={css({ display: "flex", gap: "14px" })}>
        <div className={css({ flex: 1, minWidth: 0 })}>{body}</div>
        {thumbImg}
      </div>
    </div>
  ) : (
    <div className={css({ maxWidth: "640px" })}>
      {head}
      <div className={css({ display: "flex", gap: "18px" })}>
        <div className={css({ flex: 1, minWidth: 0 })}>{body}</div>
        {thumbImg}
      </div>
    </div>
  );
}

/** URL-safe English at the keystroke: lowercase, spaces/underscores become
 *  hyphens, and everything else — Khmer included — never lands in the field.
 *  Rejecting at input beats flagging after: there is no invalid state to
 *  explain. Hyphen runs are left alone while typing (WordPress collapses them
 *  on save), so the cursor never fights the writer. */
function sanitizeSlugInput(v: string): string {
  return v.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/* ---- the metabox -------------------------------------------------------- */

export default function YoastMetabox({
  focusKw,
  onFocusKwChange,
  seoTitle,
  onSeoTitleChange,
  metaDesc,
  onMetaDescChange,
  headline,
  slug,
  onSlugChange,
  excerpt,
  featuredThumb,
  date,
  footer,
}: {
  focusKw: string;
  onFocusKwChange: (v: string) => void;
  seoTitle: string;
  onSeoTitleChange: (v: string) => void;
  metaDesc: string;
  onMetaDescChange: (v: string) => void;
  /** The article's real headline — the SEO-title fallback, like Yoast's template. */
  headline: string;
  /** "" on an unsaved article; the preview shows a placeholder crumb. */
  slug: string;
  /** Present while the slug may still be chosen — an article that has never
   *  been published. Absent → the field is read-only: this newsroom writes
   *  English slugs by hand (WordPress would percent-encode the Khmer title),
   *  but a LIVE article's URL is never rewritten — links already shared would
   *  break, and this site has no redirects. */
  onSlugChange?: (v: string) => void;
  /** Description fallback chain: metaDesc → excerpt → "Google improvises". */
  excerpt: string;
  /** Feeds the featured-image check AND renders as the Google preview's
   *  snippet thumbnail; "" shows the text-only result. */
  featuredThumb: string;
  /** Site-local ISO publish date; "" hides the snippet's date prefix. */
  date: string;
  /** Extra bottom band — the workbench's save bar. The editor passes none:
   *  its own Save/Publish button carries these fields. */
  footer?: ReactNode;
}) {
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [open, setOpen] = useState({ keyphrase: true, appearance: true, analysis: true });

  const mounted = useMounted();

  // What the public site will actually render (mirrors mapArticle's fallbacks).
  const effectiveTitle = seoTitle.trim() || `${headline.trim() || "(untitled)"} — AMS Infotainment`;
  const effectiveDesc = metaDesc.trim() || excerpt.trim() || "Google will improvise a snippet from the article body.";

  // Measured on the client only (canvas); 0 until mounted.
  const titlePx = mounted ? textWidth(effectiveTitle, "20px Arial, 'Battambang', sans-serif") : 0;
  const titleVerdict: Verdict = titlePx === 0 ? "warn" : titlePx <= TITLE_LIMIT_PX ? "good" : "warn";
  const descLen = metaDesc.trim().length;
  const descVerdict: Verdict = descLen === 0 ? "bad" : descLen < 50 ? "warn" : descLen <= 160 ? "good" : "warn";

  const checks = useMemo((): Check[] => {
    const out: Check[] = [];
    const kw = focusKw.trim().toLowerCase();
    const inTitle = kw !== "" && effectiveTitle.toLowerCase().includes(kw);
    const inDesc = kw !== "" && metaDesc.trim().toLowerCase().includes(kw);

    if (descLen === 0) {
      out.push(
        excerpt.trim()
          ? { verdict: "warn", text: "No meta description — Google gets the excerpt instead. Write one to control the snippet." }
          : { verdict: "bad", text: "No meta description and no excerpt — Google will improvise from the article body." },
      );
    } else if (descLen < 50) {
      out.push({ verdict: "warn", text: "The meta description is quite short — there is room to say more." });
    } else if (descLen > 160) {
      out.push({ verdict: "warn", text: "The meta description is over ~160 characters — Google will cut it off." });
    } else {
      out.push({ verdict: "good", text: "The meta description is a good length." });
    }

    if (mounted && titlePx > 0) {
      out.push(
        titlePx <= TITLE_LIMIT_PX
          ? { verdict: "good", text: "The SEO title fits within Google's display width." }
          : { verdict: "warn", text: "The SEO title is wider than Google displays — it will be cut off in results." },
      );
    }

    if (kw === "") {
      out.push({ verdict: "warn", text: "No focus keyphrase set for this article." });
    } else {
      out.push(
        inTitle
          ? { verdict: "good", text: "The focus keyphrase appears in the SEO title." }
          : { verdict: "warn", text: "The focus keyphrase does not appear in the SEO title." },
      );
      if (descLen > 0) {
        out.push(
          inDesc
            ? { verdict: "good", text: "The focus keyphrase appears in the meta description." }
            : { verdict: "warn", text: "The focus keyphrase does not appear in the meta description." },
        );
      }
    }

    out.push(
      featuredThumb
        ? { verdict: "good", text: "A featured image is set — shares get a picture." }
        : { verdict: "warn", text: "No featured image — Facebook and Telegram shares will have no picture." },
    );

    return out;
  }, [focusKw, metaDesc, effectiveTitle, descLen, titlePx, mounted, excerpt, featuredThumb]);

  const problems = checks.filter((c) => c.verdict === "bad");
  const improvements = checks.filter((c) => c.verdict === "warn");
  const good = checks.filter((c) => c.verdict === "good");
  const overall = problems.length ? Y.bad : improvements.length ? Y.warn : Y.good;

  const checkRow = (c: Check, i: number) => (
    <li key={i} className={css({ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", lineHeight: 1.55 })} style={{ color: Y.sub }}>
      <span aria-hidden className={css({ width: "10px", height: "10px", borderRadius: "50%", flex: "none", marginTop: "5px" })} style={{ background: dot(c.verdict) }} />
      {c.text}
    </li>
  );

  const checkGroup = (heading: string, list: Check[]) =>
    list.length === 0 ? null : (
      <div className={css({ marginTop: "14px", _first: { marginTop: 0 } })}>
        <div className={css({ fontSize: "12.5px", fontWeight: 600, marginBottom: "8px" })} style={{ color: Y.label }}>
          {heading} ({list.length})
        </div>
        <ul className={css({ display: "flex", flexDirection: "column", gap: "7px", listStyle: "none", padding: 0, margin: 0 })}>{list.map(checkRow)}</ul>
      </div>
    );

  return (
    <div
      className={css({ borderRadius: "8px", overflow: "hidden" })}
      style={{ background: "#fff", border: `1px solid ${Y.border}`, color: Y.text }}
    >
      {/* Tab strip — SEO is the only tab that exists here; the smiley carries
          the overall verdict like Yoast's does. */}
      <div className={css({ display: "flex", alignItems: "flex-end", gap: "4px", padding: "8px 12px 0" })} style={{ background: "#f0f0f1", borderBottom: `1px solid ${Y.border}` }}>
        <span
          className={css({ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 16px", fontSize: "13.5px", fontWeight: 600, borderRadius: "6px 6px 0 0", position: "relative", top: "1px" })}
          style={{ background: "#fff", border: `1px solid ${Y.border}`, borderBottom: "1px solid #fff", color: Y.label }}
        >
          <ScoreDot color={mounted ? overall : "#c3c4c7"} />
          SEO
        </span>
      </div>

      <Section title="Focus keyphrase" open={open.keyphrase} onToggle={() => setOpen((o) => ({ ...o, keyphrase: !o.keyphrase }))}>
        <label className={labelClass} style={{ color: Y.label }} htmlFor="seo-focus-kw">
          Focus keyphrase
        </label>
        <input
          id="seo-focus-kw"
          className={fieldClass}
          style={fieldStyle}
          value={focusKw}
          onChange={(e) => onFocusKwChange(e.target.value)}
          placeholder="The word or phrase this article should be found for"
        />
        <p className={css({ fontSize: "12.5px", marginTop: "7px", lineHeight: 1.5 })} style={{ color: Y.sub }}>
          Used by the checks below. Khmer works — the checks here are presence and length only, not Yoast&rsquo;s English-grammar analysis.
        </p>
      </Section>

      <Section title="Search appearance" open={open.appearance} onToggle={() => setOpen((o) => ({ ...o, appearance: !o.appearance }))}>
        <p className={css({ fontSize: "12.5px", margin: "0 0 14px", lineHeight: 1.5 })} style={{ color: Y.sub }}>
          Determine how this article should look in Google&rsquo;s search results.
        </p>

        <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px", flexWrap: "wrap" })}>
          <span className={css({ fontSize: "13px", fontWeight: 600 })} style={{ color: Y.label }}>
            Google preview
          </span>
          {/* Yoast's Mobile ⇄ Desktop switch. */}
          <span className={css({ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "12.5px" })} style={{ color: Y.sub }}>
            Mobile
            <button
              type="button"
              role="switch"
              aria-checked={previewMode === "desktop"}
              aria-label="Preview as desktop result"
              onClick={() => setPreviewMode((m) => (m === "mobile" ? "desktop" : "mobile"))}
              className={css({ width: "38px", height: "20px", borderRadius: "10px", border: "none", cursor: "pointer", position: "relative", flex: "none", _focusVisible: { boxShadow: "0 0 0 3px rgba(164,40,106,0.25)" } })}
              style={{ background: Y.purple }}
            >
              <span
                aria-hidden
                className={css({ position: "absolute", top: "3px", width: "14px", height: "14px", borderRadius: "50%", transition: "left .12s" })}
                style={{ background: "#fff", left: previewMode === "mobile" ? "4px" : "20px" }}
              />
            </button>
            Desktop
          </span>
        </div>

        <GooglePreview mode={previewMode} title={effectiveTitle} description={effectiveDesc} date={googleDate(date)} slug={slug} thumb={featuredThumb} />

        <div className={css({ marginTop: "20px" })}>
          <label className={labelClass} style={{ color: Y.label }} htmlFor="seo-title">
            SEO title
          </label>
          <input
            id="seo-title"
            className={fieldClass}
            style={fieldStyle}
            value={seoTitle}
            onChange={(e) => onSeoTitleChange(e.target.value)}
            placeholder={`${headline.trim() || "(untitled)"} — AMS Infotainment`}
          />
          <LengthBar ratio={titlePx / TITLE_LIMIT_PX} verdict={titleVerdict} />
        </div>

        <div className={css({ marginTop: "16px" })}>
          <label className={labelClass} style={{ color: Y.label }} htmlFor="seo-slug">
            Slug
          </label>
          <input
            id="seo-slug"
            className={fieldClass}
            style={onSlugChange ? fieldStyle : { ...fieldStyle, background: Y.readonlyBg, color: Y.sub }}
            value={slug}
            placeholder={onSlugChange ? "english-words-with-hyphens" : "Assigned on first save"}
            readOnly={!onSlugChange}
            onChange={onSlugChange ? (e) => onSlugChange(sanitizeSlugInput(e.target.value)) : undefined}
          />
          <p className={css({ fontSize: "12px", marginTop: "6px", lineHeight: 1.5 })} style={{ color: Y.sub }}>
            {onSlugChange
              ? "English letters, numbers and hyphens only — anything else is dropped as you type. Required before the article can publish; locks once it has."
              : "Read-only — changing a live article’s URL breaks shared links, and this site has no redirects."}
          </p>
        </div>

        <div className={css({ marginTop: "16px" })}>
          <label className={labelClass} style={{ color: Y.label }} htmlFor="seo-desc">
            Meta description
          </label>
          <textarea
            id="seo-desc"
            rows={3}
            className={fieldClass}
            style={{ ...fieldStyle, resize: "vertical" }}
            value={metaDesc}
            onChange={(e) => onMetaDescChange(e.target.value)}
            placeholder={excerpt.trim() ? "Empty — Google gets the excerpt instead. Write one to control the snippet." : "Describe this article in one or two sentences for the search result."}
          />
          <LengthBar ratio={descLen / 160} verdict={descVerdict} />
          <p className={css({ fontSize: "12px", marginTop: "6px" })} style={{ color: Y.sub }}>
            {descLen} characters — aim for the bar staying green (about 50–160).
          </p>
        </div>
      </Section>

      <Section title="SEO analysis" open={open.analysis} onToggle={() => setOpen((o) => ({ ...o, analysis: !o.analysis }))}>
        {mounted ? (
          <>
            {checkGroup("Problems", problems)}
            {checkGroup("Improvements", improvements)}
            {checkGroup("Good results", good)}
          </>
        ) : (
          <p className={css({ fontSize: "12.5px" })} style={{ color: Y.sub }}>
            Analyzing…
          </p>
        )}
      </Section>

      {footer}
    </div>
  );
}
