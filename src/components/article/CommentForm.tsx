"use client";

import { useActionState } from "react";
import { css } from "@/styled-system/css";
import { submitComment, type CommentFormState } from "@/lib/comment-action";

const field = css({
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "text",
  background: "page.bg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "divider",
  borderRadius: "4px",
  _focus: { outline: "none", borderColor: "brand.blue" },
});

const label = css({ display: "block", fontSize: "13px", color: "muted", marginBottom: "6px" });

const initial: CommentFormState = { ok: false, message: "" };

/** The comment form — name, email, comment, same required fields as live's
 *  `#commentform`. Submission goes through a server action so the WordPress
 *  origin never has to accept a browser call (no CORS involvement). */
export default function CommentForm({ postId }: { postId: number }) {
  const [state, action, pending] = useActionState(submitComment, initial);

  return (
    <form action={action} className={css({ marginTop: "18px" })}>
      <input type="hidden" name="post" value={postId} />

      <div className={css({ marginBottom: "14px" })}>
        <label htmlFor="cf-comment" className={label}>
          មតិយោបល់ *
        </label>
        <textarea id="cf-comment" name="comment" required rows={4} className={field} />
      </div>

      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", md: "1fr 1fr" },
          gap: "14px",
          marginBottom: "14px",
        })}
      >
        <div>
          <label htmlFor="cf-author" className={label}>
            ឈ្មោះ *
          </label>
          <input id="cf-author" name="author" type="text" required className={field} />
        </div>
        <div>
          <label htmlFor="cf-email" className={label}>
            អ៊ីមែល *
          </label>
          <input id="cf-email" name="email" type="email" required className={field} />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={css({
          padding: "11px 28px",
          fontSize: "14px",
          fontWeight: 600,
          fontFamily: "inherit",
          color: "#fff",
          background: "brand.blue",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          transition: "opacity .2s",
          _hover: { opacity: 0.85 },
          _disabled: { opacity: 0.6, cursor: "default" },
        })}
      >
        {pending ? "កំពុងផ្ញើ…" : "បញ្ចេញមតិយោបល់"}
      </button>

      {state.message && (
        <p
          role="status"
          className={css({ marginTop: "12px", fontSize: "13.5px" })}
          style={{ color: state.ok ? "#1a7f37" : "#c62828" }}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
