import { css } from "@/styled-system/css";
import PosterCarousel, { type PosterItem } from "./PosterCarousel";
import { container } from "@/components/layout/shared";

/** Dark "choose a program" band with the poster carousel. */
export default function PosterBand({
  title = "ជ្រើសរើសកម្មវិធីដែលលោកអ្នកចូលចិត្ត",
  posters,
}: {
  title?: string;
  posters: PosterItem[];
}) {
  return (
    // Painted dark in both themes, so re-scope the theme tokens to match —
    // otherwise the image placeholders inside resolve to their light-mode grays.
    <div
      data-theme='dark'
      className={css({ background: "#0c0d12", width: "100%", marginTop: "45px", padding: "40px 0" })}>
      <div className={container}>
        <h2 className={css({ margin: "0 0 20px", fontSize: "24px", color: "#fff" })}>{title}</h2>
        <PosterCarousel posters={posters} />
      </div>
    </div>
  );
}
