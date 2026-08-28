import Link from "next/link";
import { css } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";

const frame = css({
  position: "relative",
  width: "100%",
  aspectRatio: "16/9",
  overflow: "hidden",
  background: "#000",
});
const art = css({ position: "absolute", inset: 0 });
const controls = css({
  position: "absolute",
  left: "8px",
  right: "8px",
  bottom: "8px",
  height: "34px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  px: "8px",
  borderRadius: "4px",
  background: "rgba(10,10,12,.9)",
  color: "#fff",
});
const play = css({
  width: "56px",
  height: "30px",
  display: "grid",
  placeItems: "center",
  borderRadius: "3px",
  background: "#161719",
  fontSize: "19px",
  lineHeight: 1,
});
const track = css({ flex: 1, height: "3px", background: "rgba(255,255,255,.48)", borderRadius: "2px" });
const tools = css({ display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", whiteSpace: "nowrap" });

/** Paused-player state for the legacy episode rail. `thumbnail` is always a
 * wide Vimeo poster (or the program's wide backdrop while it resolves), never
 * the rail's portrait editorial card — stretching that card caused the giant
 * cropped faces this component exists to prevent. */
export default function EpisodePosterPlayer({ href, thumbnail, title }: { href: string; thumbnail: string; title: string }) {
  return (
    <div className={frame}>
      <div className={art}>
        <CoverImage src={thumbnail} alt={title} sizes="(max-width: 1024px) 100vw, 1040px" priority unoptimized />
      </div>
      <Link href={href} className={controls} aria-label={`មើល ${title}`}>
        <span className={play} aria-hidden>▶</span>
        <span className={track} aria-hidden />
        <span className={tools} aria-hidden>
          <span>◖</span><span>⚙</span><span>◱</span><span>⛶</span>
        </span>
      </Link>
    </div>
  );
}
