"use client";

import { useState } from "react";
import { addFilter } from "@wordpress/hooks";
import MediaPicker, { type MediaKind, type PickedMedia } from "../MediaPicker";
import { uploadImageFile } from "../upload-client";

// THE TWO HALVES that connect WordPress's blocks to OUR media library. Both are
// required; either one alone changes nothing, which is why the Image block only
// ever offered "Insert from URL" before this file existed.
//
//  1. `editor.MediaUpload` — read the package source, not the docs:
//     `const MediaUpload = () => null` wrapped in `withFilters('editor.MediaUpload')`
//     (@wordpress/block-editor/build/components/media-upload/index.cjs). With no
//     filter registered, every "Media Library" button in every block renders
//     NOTHING. wp-admin registers exactly this filter for its own modal; we
//     register ours.
//  2. `settings.mediaUpload` — `MediaUploadCheck` renders its children only
//     `if (getSettings().mediaUpload)` (…/media-upload/check.cjs). We passed
//     `undefined`, so both the Upload AND the Media Library buttons were
//     suppressed together, everywhere.
//
// The blocks call us through a render-prop contract measured off
// MediaPlaceholder's source:
//     <MediaUpload multiple gallery addToGallery value onSelect allowedTypes
//                  mode="browse" render={({ open }) => <Button onClick={open}/>} />
// and `mediaUpload({ allowedTypes, filesList, onFileChange, onError, multiple })`
// hands its results back as an ARRAY even in the single case.

/** The subset of WordPress's media shape the core blocks actually read in
 *  `onSelect` (id/url/alt/caption for image, plus type/mime for the file and
 *  video blocks). `sizes` is deliberately absent — the size dropdown resolves
 *  it through @wordpress/core-data's getMedia(), which has no REST route in
 *  this app, so offering a half-populated list would be worse than none. */
export interface WpMediaShape {
  id: number;
  url: string;
  alt: string;
  caption: string;
  title: string;
  mime: string;
  type: string;
}

function toWpMedia(m: PickedMedia): WpMediaShape {
  return {
    id: m.id,
    url: m.url,
    alt: m.alt,
    // Empty, not m.title: WordPress prefills the visible CAPTION from this, and
    // a filename showing up under every inserted image is worse than no caption.
    caption: "",
    title: m.title ?? "",
    mime: m.mime ?? "",
    type: m.type ?? "image",
  };
}

/** What the blocks pass us. Loosely typed on purpose: this is a boundary with
 *  an untyped package, and narrowing it would be a guess rather than a check. */
interface MediaUploadProps {
  render: (props: { open: () => void }) => React.ReactNode;
  onSelect?: (media: WpMediaShape | WpMediaShape[]) => void;
  multiple?: boolean;
  title?: string;
  /** Type roots from the block ('image' | 'video' | 'audio'; the File block
   *  passes none). MediaPlaceholder also accepts full mimes, so match both. */
  allowedTypes?: string[];
}

const PICKER_TITLE: Record<MediaKind, string> = { image: "Choose image", video: "Choose video", audio: "Choose audio" };

function AmsMediaUpload({ render, onSelect, multiple, title, allowedTypes }: MediaUploadProps) {
  const [open, setOpen] = useState(false);

  // What the block can USE is what the picker may offer. Before this was
  // threaded through, every block's dialog showed all four tabs — which is how
  // an mp3 ended up inside an Image block as a broken <img>.
  const kinds = (["image", "video", "audio"] as MediaKind[]).filter((k) =>
    allowedTypes?.some((t) => t === k || t.startsWith(`${k}/`)),
  );
  const resolved = kinds.length ? kinds : (["image", "video", "audio"] as MediaKind[]);

  return (
    <>
      {render({ open: () => setOpen(true) })}
      {open ? (
        <MediaPicker
          title={title ?? (multiple ? "Add images" : kinds.length === 1 ? PICKER_TITLE[kinds[0]] : "Choose media")}
          multiple={multiple}
          kinds={resolved}
          onClose={() => setOpen(false)}
          onPick={(m) => {
            onSelect?.(toWpMedia(m));
            setOpen(false);
          }}
          onPickMany={(list) => {
            onSelect?.(list.map(toWpMedia));
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The drag-and-drop / paste / "Upload" path. Uploads run through OUR route
 * handler (raw multipart, session cookie) rather than @wordpress/media-utils,
 * which would post to a wp-json URL this app has no apiFetch middleware for.
 *
 * Sequential, not parallel: this WordPress host takes seconds per write and has
 * a documented history of banning callers that hammer it — four images at once
 * is four uploads, not a burst.
 */
export async function amsMediaUpload({
  filesList,
  onFileChange,
  onError,
}: {
  filesList: ArrayLike<File>;
  onFileChange?: (media: WpMediaShape[]) => void;
  onError?: (e: { message: string }) => void;
  allowedTypes?: string[];
  multiple?: boolean;
}): Promise<void> {
  const files = Array.from(filesList ?? []);
  const done: WpMediaShape[] = [];

  for (const file of files) {
    const res = await uploadImageFile(file); // never throws
    if (!res.ok || !res.id) {
      onError?.({ message: res.error ?? `Couldn't upload ${file.name}.` });
      continue;
    }
    done.push({
      id: res.id,
      url: res.url ?? res.thumb ?? "",
      alt: "",
      caption: "",
      title: file.name,
      mime: file.type,
      type: file.type.split("/")[0] || "file",
    });
    // Report after EVERY file: a four-image drop shows each one as it lands
    // instead of nothing for twenty seconds. onFileChange is idempotent — it
    // replaces the block's media, so the growing list is the right payload.
    if (done.length) onFileChange?.([...done]);
  }
}

// The filter registry is module-level in @wordpress/hooks, so registering twice
// logs a duplicate-namespace warning and the last registration wins — same
// hazard as registerCoreBlocks(). Guarded identically.
let registered = false;

/** Idempotent. Call before the editor mounts (see ensureBlocks in
 *  GutenbergEditor) — withFilters resolves the component at render time, so a
 *  late registration would leave already-mounted buttons rendering null. */
export function ensureMediaUploadBridge(): void {
  if (registered) return;
  registered = true;
  addFilter("editor.MediaUpload", "ams/media-upload", () => AmsMediaUpload);
}
