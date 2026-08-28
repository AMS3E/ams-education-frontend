// Resolving a MasVideos video source to something playable.
//
// Episodes (`_episode_*`) and movies (`_movie_*`) store the SAME four fields, so
// both the episode page and the homepage's featured-program banner resolve them
// through here.
//
// `url` deliberately wins over `embed`: MasVideos keeps both, and `embed` goes
// stale silently — vanna-yeatra's holds an older Vimeo id than the video actually
// playing on the live site. WordPress ignores it too (it renders from `url` via
// oEmbed whenever `choice` says so), so preferring `url` is what matches WP.

/** The raw `{choice, url, attachment, embed}` object our WP endpoints return. */
export interface WpVideoSource {
  /** MasVideos `_episode_choice` / `_movie_choice`, e.g. "episode_url", "movie_url". */
  choice: string;
  /** "https://vimeo.com/<id>", or ".../<id>/<hash>" for an unlisted video. */
  url: string;
  /** Resolved media-library URL, when the video is a self-hosted upload. */
  attachment: string;
  /** Raw embed HTML, when an editor pasted one. Often stale — see above. */
  embed: string;
}

/** Every video sampled across the site when this was written is a Vimeo link, but
 *  the admin has always offered editors "Vimeo, YouTube or a direct MP4 link"
 *  (ProgramDetailsForm), and MasVideos models a pasted embed besides. All four
 *  are handled; `null` means there is no playable video.
 *
 *  `vimeo` and `youtube` are separate kinds despite both being just an iframe
 *  `src`, because one thing does differ: only Vimeo has a public oEmbed endpoint
 *  that reports a true duration (see fetchVimeoRunTime in lib/episode.ts). */
export type Video =
  | { kind: "vimeo"; src: string }
  | { kind: "youtube"; src: string }
  | { kind: "embed"; html: string }
  | { kind: "file"; url: string };

/** "https://vimeo.com/694739939" and "https://vimeo.com/650205864/bb66b3e2ec".
 *  The second path segment is an unlisted video's hash, which the player needs
 *  as `?h=` — none of the live videos require it today, but a genuinely private
 *  one would, and carrying it costs nothing. */
const VIMEO_URL = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/([0-9a-z]+))?/i;

/** Every shape a pasted YouTube link arrives in — `youtu.be/<id>`, `watch?v=`,
 *  `/embed/`, `/shorts/`, `/live/`, and the legacy `/v/`. The id is YouTube's
 *  fixed 11-character token, which is what makes matching it safe: `watch?v=`
 *  can carry a dozen other parameters in any order. */
const YOUTUBE_URL =
  /^https?:\/\/(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i;

export function toVideo(v: WpVideoSource | undefined | null): Video | null {
  if (!v) return null;

  const match = v.url?.match(VIMEO_URL);
  if (match) {
    const [, id, hash] = match;
    // Same params the WordPress oEmbed cache uses, so we inherit whatever
    // Vimeo-side behaviour the live site already relies on.
    const params = new URLSearchParams({ dnt: "1", app_id: "122963" });
    if (hash) params.set("h", hash);
    return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}?${params}` };
  }

  const yt = v.url?.match(YOUTUBE_URL);
  if (yt) {
    // `youtube-nocookie` carries the same intent as the Vimeo branch's `dnt=1`.
    // `rel=0` holds the end screen to this channel instead of letting YouTube
    // recommend anything it likes off the back of our episode.
    //
    // A `t=`/`start=` offset in the pasted URL is deliberately DROPPED: those
    // arrive from YouTube's "share at current time" checkbox, and an episode
    // should open at its beginning whatever moment the editor happened to copy.
    //
    // A query string is always emitted, because FeatureTrailer appends
    // `&autoplay=1` to `src` and would otherwise build a malformed URL.
    return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` };
  }

  if (v.embed?.trim()) return { kind: "embed", html: v.embed };
  if (v.attachment) return { kind: "file", url: v.attachment };
  return null;
}
