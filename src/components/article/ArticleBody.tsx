import { css, cx } from "@/styled-system/css";
import ScriptedHtml from "@/components/ui/ScriptedHtml";
import SrEmbed from "@/components/article/SrEmbed";
import { splitBody } from "@/lib/article-sliders";

// Typography for the WordPress `post_content` HTML (Gutenberg blocks). Styles
// target the rendered tags/classes so the article reads like the rest of the
// site. Content is first-party (our own CMS), so it's rendered as-is.
const prose = css({
  marginTop: "8px",
  "& p": { fontSize: "18px", lineHeight: 1.95, color: "text", marginTop: "18px" },
  "& h2": { fontSize: "21px", fontWeight: 700, color: "text", marginTop: "28px", marginBottom: "2px" },
  "& h3": { fontSize: "19px", fontWeight: 700, color: "text", marginTop: "24px", marginBottom: "2px" },
  "& figure": { marginTop: "24px", marginBottom: "24px" },
  "& img": { width: "100%", height: "auto", display: "block" },
  "& figcaption": { fontSize: "12.5px", color: "muted", marginTop: "8px", textAlign: "center", fontStyle: "italic" },
  "& a": { color: "brand.blue", textDecoration: "underline" },
  "& ul, & ol": { marginTop: "18px", paddingLeft: "24px" },
  "& li": { fontSize: "18px", lineHeight: 1.95, color: "text" },
  "& blockquote": {
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: "brand.blue",
    paddingLeft: "16px",
    marginTop: "18px",
    color: "muted",
    fontStyle: "italic",
  },

  // ── Galleries ──────────────────────────────────────────────────────────────
  // ~a third of recent posts carry a `wp-block-gallery` — the most common rich
  // block on the site. Without these rules the flex row never forms and the
  // blanket `img { width: 100% }` above stacks every photo full-bleed.
  // Mirrors core's layout: a wrapping flex row with a 16px gutter, three to a
  // row by default (`columns-default`), overridden by an explicit columns-N.
  "& .wp-block-gallery": {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
  },
  "& .wp-block-gallery figure.wp-block-image": {
    // The gallery's own gutter replaces the standalone figure margins.
    margin: 0,
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    width: { base: "calc(50% - 8px)", md: "calc(33.33% - 10.67px)" },
  },
  "& .wp-block-gallery.columns-1 figure.wp-block-image": { width: "100%" },
  "& .wp-block-gallery.columns-2 figure.wp-block-image": { width: "calc(50% - 8px)" },
  "& .wp-block-gallery.columns-4 figure.wp-block-image": {
    width: { base: "calc(50% - 8px)", md: "calc(25% - 12px)" },
  },
  // `is-cropped`: every row's photos share a height, cover-cropped.
  "& .wp-block-gallery.is-cropped figure.wp-block-image img": {
    height: "100%",
    objectFit: "cover",
    flex: 1,
  },

  // ── Embeds (TikTok, Facebook, …) ───────────────────────────────────────────
  "& .wp-block-embed": { marginTop: "24px", marginBottom: "24px" },
  "& .wp-block-embed .wp-block-embed__wrapper": {
    display: "flex",
    justifyContent: "center",
  },
  "& .wp-block-embed iframe": { maxWidth: "100%" },
});

/** Renders an article's HTML body from WordPress. ScriptedHtml (rather than a
 *  bare dangerouslySetInnerHTML) is what makes script-driven embeds — TikTok,
 *  the /contact form plugin — actually run, on soft navigations included.
 *
 *  Slider Revolution modules are the one thing lifted OUT of that HTML: their
 *  runtime never travels in `post_content`, so they are framed from WordPress
 *  instead (see splitBody / SrEmbed). Articles without one — every article in a
 *  40-post sample — take the single-part path below, which renders the exact
 *  same element tree this component always did. */
export default function ArticleBody({ html }: { html: string }) {
  const parts = splitBody(html);

  // The overwhelmingly common case, kept byte-identical to the original render
  // rather than merely equivalent: no wrapper div, no keys, no reflow risk.
  if (parts.length === 1 && parts[0].type === "html") {
    return <ScriptedHtml html={parts[0].html} className={cx(prose)} />;
  }

  // `prose` moves to the wrapper so its descendant selectors (& p, & h2, & img)
  // still reach the copy inside each run.
  return (
    <div className={cx(prose)}>
      {parts.map((part, i) =>
        part.type === "html" ? (
          <ScriptedHtml key={i} html={part.html} />
        ) : (
          <SrEmbed key={i} alias={part.alias} ratio={part.ratio} />
        ),
      )}
    </div>
  );
}
