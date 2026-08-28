"use client";

// The SEO workbench's detail view: PageHeader chrome + the shared YoastMetabox
// (see YoastMetabox.tsx) + a save bar. This is the STANDALONE flavour — it owns
// the field state and a meta-only save; the article editor embeds the same
// metabox under the document instead, controlled by its own state, saved by
// its own Save/Publish button.

import Link from "next/link";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { PageHeader, buttonClass } from "../ui";
import YoastMetabox, { Y } from "./YoastMetabox";
import type { EditablePost } from "@/lib/admin/post-edit";
import { saveSeoAction } from "@/lib/admin/seo-actions";

export default function SeoPanel({ post }: { post: EditablePost }) {
  const [focusKw, setFocusKw] = useState(post.seo.focus);
  const [seoTitle, setSeoTitle] = useState(
    // A stored value identical to the headline is Yoast's "nothing set" echo.
    post.seo.title === post.title ? "" : post.seo.title,
  );
  const [metaDesc, setMetaDesc] = useState(post.seo.description);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedState, setSavedState] = useState({ focus: post.seo.focus, title: post.seo.title, desc: post.seo.description });

  const dirty = focusKw !== savedState.focus || seoTitle !== savedState.title || metaDesc !== savedState.desc;

  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await saveSeoAction(
        post.id,
        { title: seoTitle.trim(), description: metaDesc.trim(), focus: focusKw.trim() },
        { slug: post.slug, published: post.status === "publish" },
      );
      if (res.ok) {
        setSavedState({ focus: focusKw, title: seoTitle, desc: metaDesc });
        setMessage({ ok: true, text: post.status === "publish" ? "Saved — WordPress updated and the live page refreshed." : "Saved to WordPress." });
      } else {
        setMessage({ ok: false, text: res.error ?? "Couldn't save." });
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error && e.message ? `Request failed: ${e.message}` : "Request failed — please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css({ maxWidth: "1440px" })}>
      <PageHeader
        trail={[{ label: "Site" }, { label: "SEO", href: "/admin/seo" }, { label: post.title }]}
        title="Search appearance"
        sub={post.title}
        actions={
          <Link href={`/admin/articles/${post.id}`} className={buttonClass("secondary", "md")}>
            Open in article editor
          </Link>
        }
      />

      <div className={css({ marginTop: "20px", maxWidth: "780px" })}>
        <YoastMetabox
          focusKw={focusKw}
          onFocusKwChange={setFocusKw}
          seoTitle={seoTitle}
          onSeoTitleChange={setSeoTitle}
          metaDesc={metaDesc}
          onMetaDescChange={setMetaDesc}
          headline={post.title}
          slug={post.slug}
          excerpt={post.excerpt}
          featuredThumb={post.featuredThumb}
          date={post.date}
          footer={
            <div
              className={css({ display: "flex", alignItems: "center", gap: "14px", padding: "14px 24px" })}
              style={{ borderTop: `1px solid ${Y.hairline}`, background: "#fbfbfc" }}
            >
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className={css({
                  padding: "9px 18px",
                  borderRadius: "6px",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  _disabled: { opacity: 0.55, cursor: "default" },
                  _focusVisible: { boxShadow: "0 0 0 3px rgba(164,40,106,0.35)" },
                })}
                style={{ background: Y.purple, color: "#fff" }}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <span role="status" className={css({ fontSize: "12.5px" })} style={{ color: message ? (message.ok ? "#1a7a2e" : Y.bad) : Y.sub }}>
                {message ? message.text : dirty ? "Unsaved changes" : ""}
              </span>
            </div>
          }
        />
      </div>
    </div>
  );
}
