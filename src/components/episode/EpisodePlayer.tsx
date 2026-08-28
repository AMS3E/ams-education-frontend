import { css } from "@/styled-system/css";
import type { EpisodeVideo } from "@/lib/episode";

// 990×557 on the live site — 16:9 to within a pixel. Reserving the box by ratio
// rather than by height keeps the player from shifting the page as it loads.
const frame = css({
  position: "relative",
  width: "100%",
  aspectRatio: "16/9",
  background: "black",
  overflow: "hidden",
  "& iframe, & video": { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 },
});

const empty = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "muted",
  fontSize: "14px",
  background: "skeleton.base",
});

/**
 * The episode's video.
 *
 * Most episodes are Vimeo links, but the admin offers YouTube too, and MasVideos
 * also models a self-hosted upload and a pasted embed. All four are handled
 * rather than rendering a silent blank box when an editor reaches for one.
 *
 * `video` is null when the detail request failed or the episode has no source —
 * the rest of the page is still worth showing, so this degrades to a placeholder
 * instead of throwing.
 */
export default function EpisodePlayer({ video, title }: { video: EpisodeVideo | null; title: string }) {
  if (!video) {
    return (
      <div className={frame}>
        <div className={empty}>វីដេអូមិនអាចមើលបាន</div>
      </div>
    );
  }

  // Both are an iframe over a `src`; only the host differs, so they share it.
  if (video.kind === "vimeo" || video.kind === "youtube") {
    return (
      <div className={frame}>
        <iframe
          src={video.src}
          title={title}
          // Mirrors the live site's embed, minus `loading="lazy"`: this is the
          // page's LCP element, so deferring it would be a self-inflicted delay.
          allow='autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share'
          referrerPolicy='strict-origin-when-cross-origin'
          allowFullScreen
        />
      </div>
    );
  }

  if (video.kind === "file") {
    return (
      <div className={frame}>
        <video src={video.url} controls playsInline preload='metadata' />
      </div>
    );
  }

  // Raw embed HTML straight from the CMS. Same trust boundary as ArticleBody,
  // which renders `post_content` the same way: WordPress is authenticated, and
  // sanitising here would strip the very <iframe> the field exists to carry.
  return <div className={frame} dangerouslySetInnerHTML={{ __html: video.html }} />;
}
