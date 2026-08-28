import { css } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import type { Author } from "@/lib/articles";

export default function AuthorBox({ author }: { author: Author }) {
  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        marginTop: "34px",
        padding: "16px",
        border: "2px solid #bdc3c7",
        gap: "22px",
      })}>
      <div className={css({ display: "flex", gap: "16px", alignItems: "center" })}>
        <div
          className={css({
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            overflow: "hidden",
            position: "relative",
          })}>
          <CoverImage src={author.avatar} sizes='100px' />
        </div>
        <div
          className={css({
            display: "flex",

            flexDirection: "column",
            gap: "4px",
          })}>
          <span className={css({ fontSize: "20px", fontWeight: 600 })}>{author.name}</span>
          <span className={css({ fontSize: "14px", color: "muted" })}>{author.bio}</span>
        </div>
      </div>
    </div>
  );
}
