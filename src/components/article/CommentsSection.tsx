import Image from "next/image";
import { css } from "@/styled-system/css";
import CommentForm from "./CommentForm";
import type { Comment } from "@/lib/comments";

/** One comment. Replies are the same row, indented one level — WordPress
 *  threads deeper, but nothing on this site ever has. */
function CommentRow({ c, reply }: { c: Comment; reply: boolean }) {
  return (
    <div
      className={css({ display: "flex", gap: "14px", alignItems: "flex-start" })}
      style={reply ? { marginLeft: "44px" } : undefined}
    >
      <div
        className={css({
          width: "40px",
          height: "40px",
          flex: "0 0 auto",
          position: "relative",
          borderRadius: "50%",
          overflow: "hidden",
          background: "skeleton.base",
        })}
      >
        {c.avatar && <Image src={c.avatar} alt="" fill sizes="40px" />}
      </div>
      <div className={css({ minWidth: 0 })}>
        <div className={css({ fontSize: "14px", fontWeight: 600, color: "text" })}>
          {c.author}
          <span className={css({ fontWeight: 400, fontSize: "12px", color: "muted", marginLeft: "10px" })}>{c.date}</span>
        </div>
        <p className={css({ fontSize: "14px", lineHeight: 1.8, color: "text", marginTop: "4px" })}>{c.text}</p>
      </div>
    </div>
  );
}

/** The comment thread + form below an article — the block live renders as
 *  `#comments` / `#commentform` and we rendered nothing at all. The meta line's
 *  "Leave a comment" link lands on the `id` here. */
export default function CommentsSection({ postId, comments }: { postId: number; comments: Comment[] }) {
  // Replies grouped under their parent, both levels in date order.
  const top = comments.filter((c) => !c.parent);
  const repliesTo = (id: number) => comments.filter((c) => c.parent === id);

  return (
    <section id="comments" className={css({ marginTop: "34px" })}>
      <h2
        className={css({
          fontSize: "18px",
          fontWeight: 700,
          color: "text",
          paddingBottom: "8px",
          marginBottom: "18px",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "divider",
        })}
      >
        មតិយោបល់ {comments.length > 0 && `(${comments.length})`}
      </h2>

      {comments.length > 0 && (
        <div className={css({ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "10px" })}>
          {top.map((c) => (
            <div key={c.id} className={css({ display: "flex", flexDirection: "column", gap: "16px" })}>
              <CommentRow c={c} reply={false} />
              {repliesTo(c.id).map((r) => (
                <CommentRow key={r.id} c={r} reply />
              ))}
            </div>
          ))}
        </div>
      )}

      <CommentForm postId={postId} />
    </section>
  );
}
