// The newsroom's spacer convention, applied for the author instead of by them.
//
// MEASURED against the 25 most recent live articles (2026-08-24), not designed:
//
//   * 25 of 25 articles OPEN with a 10px spacer. Every one.
//   * 78 media runs, and 78 of 78 are preceded by a 30px spacer. No exceptions.
//   * 66 of those 78 are followed by one too; 11 run straight into text and 1
//     ends the article. Treated here as omissions, on the owner's call — a rule
//     that is sometimes-on is worse than either consistent answer, so the
//     trailing spacer is always emitted.
//   * ZERO spacers between consecutive media, across 17 multi-item runs (one of
//     them 17 images long). What the newsroom wraps is the RUN, not the block.
//   * Only two heights exist site-wide: 10px and 30px. Nothing else.
//
// The arithmetic worth keeping: 78 leading + 66 trailing = 144, and the sample
// holds 145 spacers of 30px. So virtually every 30px spacer on the site IS a
// media-run boundary — which is what lets the sweep below treat an orphaned
// 30px spacer as ours to remove.
//
// ── The rule ────────────────────────────────────────────────────────────────
//
//   ADD ONLY ON INSERT. REMOVE WHENEVER ORPHANED.
//
// Deliberately asymmetric. Inserting media adds the run's boundary spacers, in
// the SAME undo step. After that they are ordinary blocks — deletable, movable,
// resizable — and nothing re-adds them, so the editor never fights an author
// who wants a different rhythm. The only automatic behaviour afterwards is
// removal: a boundary spacer with no media beside it is finishing the author's
// own delete, not overruling it.
//
// Locking the spacers (`lock: {remove: true}`) was considered and rejected: an
// author who deletes the image would be left with two 60px gaps they could no
// longer remove, and an unselected spacer is invisible, so they would never see
// why the article had a hole in it.

import { createBlock, type Block } from "@wordpress/blocks";

/** The opener every article starts with. */
export const OPENER_HEIGHT = "10px";
/** The gap around a run of media. */
export const MEDIA_SPACER_HEIGHT = "30px";
/** Marks a spacer as one WE placed, so the sweep never eats an author's own. */
export const MEDIA_SPACER_CLASS = "ams-media-spacer";

/** Owner's call (2026-08-24): image, video and gallery. Nothing else. */
const MEDIA_BLOCKS = new Set(["core/image", "core/video", "core/gallery"]);

const isMedia = (b: Block) => MEDIA_BLOCKS.has(b.name);
const isSpacer = (b: Block) => b.name === "core/spacer";

const heightOf = (b: Block) => String((b.attributes as { height?: unknown })?.height ?? "");
const classesOf = (b: Block) =>
  String((b.attributes as { className?: unknown })?.className ?? "").split(/\s+/);

/**
 * A spacer this module owns.
 *
 * The class is the intent, but it is NOT relied on: `className` reaches the
 * block only if core/spacer keeps `customClassName` support, and a silently
 * dropped attribute would turn the sweep into a no-op without ever failing.
 * The height is the fallback and the data backs it — every 30px spacer in the
 * sample sits on a media-run boundary.
 */
const isOurSpacer = (b: Block) =>
  isSpacer(b) && (classesOf(b).includes(MEDIA_SPACER_CLASS) || heightOf(b) === MEDIA_SPACER_HEIGHT);

const makeMediaSpacer = () =>
  createBlock("core/spacer", { height: MEDIA_SPACER_HEIGHT, className: MEDIA_SPACER_CLASS });

/** What a brand-new article starts as: the 10px opener and somewhere to type.
 *  The opener is an ordinary block — the author can delete it. */
export function newDocumentBlocks(): Block[] {
  return [createBlock("core/spacer", { height: OPENER_HEIGHT }), createBlock("core/paragraph")];
}

/** Contiguous stretches of media, as [start, endExclusive]. Top level only:
 *  30px inside a narrow column reads differently and the convention was not
 *  written for it (owner, 2026-08-24). */
function mediaRuns(blocks: Block[]): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < blocks.length) {
    if (isMedia(blocks[i])) {
      let j = i;
      while (j < blocks.length && isMedia(blocks[j])) j++;
      runs.push([i, j]);
      i = j;
    } else i++;
  }
  return runs;
}

/**
 * Drop our spacers that no longer bound a media run.
 *
 * "Bounds a run" means the block on one side is media — which is true for a
 * leading spacer (media after it) and a trailing one (media before it), and
 * false the moment the media is deleted or dragged away. An author's own
 * spacer at some other height is never touched.
 */
function sweepOrphans(blocks: Block[]): Block[] {
  return blocks.filter((b, i) => {
    if (!isOurSpacer(b)) return true;
    const before = blocks[i - 1];
    const after = blocks[i + 1];
    return (before !== undefined && isMedia(before)) || (after !== undefined && isMedia(after));
  });
}

/**
 * Put the boundary spacers around every run that contains newly-inserted media.
 *
 * Runs WITHOUT new media are left exactly as they are — that is what keeps this
 * from re-adding a spacer the author just deleted.
 *
 * A run that OPENS the article gets no spacer above it (owner's call — the 10px
 * opener already did that job).
 *
 * The trailing spacer is added even when the run currently ends the document,
 * which is NOT symmetric and is deliberate. "End of document" is a transient
 * state while writing: media is almost always inserted at the bottom of the
 * draft and then written past. Skipping it there would mean the trailing spacer
 * essentially never got added — the author types a paragraph after the image
 * and nothing re-runs, because this only ever adds on INSERT.
 */
function addBoundaries(blocks: Block[], freshIds: ReadonlySet<string>): Block[] {
  const out: Block[] = [];
  const runs = mediaRuns(blocks);

  for (let i = 0; i < blocks.length; i++) {
    const run = runs.find(([s]) => s === i);
    if (!run) {
      out.push(blocks[i]);
      continue;
    }
    const [start, end] = run;
    const isNew = blocks.slice(start, end).some((b) => freshIds.has(b.clientId));

    // Never stack: if whatever precedes the run is already a spacer — ours or
    // the author's — that gap is spoken for.
    const prev = blocks[start - 1];
    if (isNew && start > 0 && !(prev !== undefined && isSpacer(prev))) out.push(makeMediaSpacer());

    for (let k = start; k < end; k++) out.push(blocks[k]);

    const nextBlock = blocks[end];
    if (isNew && !(nextBlock !== undefined && isSpacer(nextBlock))) out.push(makeMediaSpacer());
    i = end - 1;
  }
  return out;
}

/**
 * Join runs that a fresh insert split.
 *
 * The real insertion point is BELOW the selected block, and after an image
 * insert the selection sits on the image — so the next image lands after the
 * run's TRAILING spacer: `img | S30 | img(new)`. Without this step that reads
 * as two separate runs and the spacer survives between them, which is exactly
 * the pattern the site has zero of (68 stacked pairs, none spaced). So a fresh
 * media block separated from other media by one of OUR spacers pulls the run
 * together by dropping that spacer. Fresh only — an author who deliberately
 * places their own spacer between two old images is not overruled, and ours
 * never sit between media the rule built, so nothing else matches.
 */
function joinRuns(blocks: Block[], freshIds: ReadonlySet<string>): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const prev = out[out.length - 1];
    const after = blocks[i + 1];
    if (
      isOurSpacer(b) &&
      prev !== undefined &&
      after !== undefined &&
      isMedia(prev) &&
      isMedia(after) &&
      (freshIds.has(prev.clientId) || freshIds.has(after.clientId))
    ) {
      continue; // drop the spacer between; the runs become one
    }
    out.push(b);
  }
  return out;
}

/**
 * The whole rule, for one persistent edit.
 *
 * Call from the editor's `onChange` (insert / delete / move / reorder) and NOT
 * from `onInput` (typing). Returns `next` unchanged — the same array reference —
 * when there is nothing to do, so the caller can skip a needless re-render.
 */
export function applyMediaSpacers(next: Block[], previous: Block[]): Block[] {
  const before = new Set(previous.map((b) => b.clientId));
  const freshMedia = new Set(next.filter((b) => isMedia(b) && !before.has(b.clientId)).map((b) => b.clientId));

  // Join first (so a split run reads as ONE run), then sweep, then wrap. The
  // sweep still runs first relative to boundaries: an author who deleted media
  // must not have its stale spacers counted as "already there".
  const joined = freshMedia.size > 0 ? joinRuns(next, freshMedia) : next;
  const swept = sweepOrphans(joined);
  const result = freshMedia.size > 0 ? addBoundaries(swept, freshMedia) : swept;

  return result.length === next.length && result.every((b, i) => b === next[i]) ? next : result;
}
