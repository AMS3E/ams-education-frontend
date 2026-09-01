"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parse, serialize, type Block } from "@wordpress/blocks";
import { registerCoreBlocks } from "@wordpress/block-library";
import { applyMediaSpacers, newDocumentBlocks } from "./spacers";
import {
  BlockEditorProvider,
  BlockInspector,
  BlockList,
  BlockTools,
  ObserveTyping,
  WritingFlow,
  // wp-admin's own full inserter panel — Blocks / Patterns / Media, every
  // allowed block, with categories. `Inserter` (the popover) only ever showed
  // the six-block quick list.
  __experimentalLibrary as InserterLibrary,
} from "@wordpress/block-editor";
import * as blockEditorPkg from "@wordpress/block-editor";
import { SlotFillProvider, Popover } from "@wordpress/components";

// The "Type / to choose a block" row. BlockList's own root appender only
// renders for an EMPTY document — in wp-admin it is the EDITOR package that
// passes this in as renderAppender, which a bare BlockEditorProvider setup has
// to do for itself. Without it, a document whose last block is media (or its
// trailing spacer) simply ends: no affordance to keep writing below it.
//
// Cast, twice, because the package's .d.ts is behind its runtime (the same
// boundary problem the media bridge documents): DefaultBlockAppender IS
// exported (verified against build/components/index.cjs) but absent from the
// types, and BlockList's typing knows only className even though renderAppender
// is the documented prop wp-admin itself passes.
const DefaultBlockAppender = (blockEditorPkg as unknown as { DefaultBlockAppender: React.ComponentType }).DefaultBlockAppender;
const AppendableBlockList = BlockList as unknown as React.ComponentType<{
  className?: string;
  renderAppender?: React.ComponentType | false;
}>;
import { useDispatch, useRegistry } from "@wordpress/data";
import { ShortcutProvider } from "@wordpress/keyboard-shortcuts";
// Side-effect import: this is what registers the core text formats (bold,
// italic, link, inline code, …). Without it the block toolbar renders with no
// formatting controls at all.
import "@wordpress/format-library";
// WordPress's own editor stylesheets. They ship with the packages, so the
// canvas, toolbar and inserter look like wp-admin without us restyling them.
// Scoped to this chunk: the component is dynamically imported client-side, so
// pages that never open the editor never download them.
import "@wordpress/components/build-style/style.css";
import "@wordpress/block-editor/build-style/style.css";
import "@wordpress/block-editor/build-style/content.css";
import "@wordpress/block-library/build-style/style.css";
import "@wordpress/block-library/build-style/editor.css";
// The generic `.has-text-align-*` rules live in common.css, NOT style.css —
// without it the canvas ignores the "Align text" control it now offers.
import "@wordpress/block-library/build-style/common.css";
// (@wordpress/format-library's stylesheet is NOT importable — its package
// `exports` map omits ./build-style/*, unlike block-library's. The file is on
// disk but unreachable, and the formatting controls work without it; only the
// link popover loses a little of wp-admin's polish.)
//
// LAST, so it wins on order: our overrides for the stylesheets above. It has to
// be a plain .css file rather than Panda — Panda emits into @layer utilities and
// unlayered WordPress rules beat layered ones outright. See the file's header.
import "./gutenberg-overrides.css";
import { css, cx } from "@/styled-system/css";
import { ac, publishedPageBg } from "../tokens";
import { Icon, type IconName } from "../icons";
import { amsMediaUpload, ensureMediaUploadBridge } from "./media-upload-bridge";
import type { BodyEditorHandle } from "./BodyEditor";

// THE REAL GUTENBERG, not an imitation of it. @wordpress/block-editor is the
// same package wp-admin runs, so the canvas, the block toolbar, the slash
// inserter, drag handles and keyboard shortcuts behave exactly as the editors
// already know them — which is the whole point: no retraining.
//
// Why this replaces TipTap: TipTap round-tripped block markup as FLAT HTML.
// 1,999 of the newest 2,000 posts on this site are block markup, so every body
// save through TipTap silently destroyed the block structure of the post it
// touched (hence its dirty-tracking guard — the damage was real enough to need
// a guard). Gutenberg parses the stored markup INTO blocks and serializes
// blocks BACK to markup.
//
// MEASURED on 20 real production posts (verify-roundtrip2.mjs), because
// "lossless" deserved a number rather than a promise:
//   - 20/20 parse with EVERY block valid — nobody opens a post to find
//     "this block contains unexpected or invalid content".
//   - 19/20 serialize back identical or differing only in insignificant
//     whitespace (`" />` becomes `"/>`).
//   - 1/20 differs structurally in one spot: a doubled space became `&nbsp;`.
//     That is RichText doing exactly what wp-admin does with a double space,
//     not a defect here.
//   - 0/20 unstable: a second round trip changes nothing further, so repeated
//     saves don't churn the markup.
// Body writes stay dirty-tracked anyway, so a metadata-only save still sends
// no `content` at all and cannot touch the stored bytes.
//
// What does NOT come along: third-party blocks registered by WP plugins
// (Slider Revolution, Yoast's internal blocks, WPForms). Their markup survives
// a round trip untouched — it parses as `core/missing`, which serializes back
// byte-for-byte — but it renders as a "this block isn't available" placeholder
// rather than its real UI. Editing THOSE posts' special blocks still belongs
// in wp-admin. Core blocks are the vocabulary news copy actually uses.

/** Blocks the newsroom needs, in the order the inserter should offer them.
 *  Registering all of core would surface a hundred blocks nobody uses here
 *  (query loops, site title, navigation…) and make the inserter noise. */
const ALLOWED_BLOCKS = [
  "core/paragraph",
  "core/heading",
  "core/image",
  "core/list",
  "core/list-item",
  "core/quote",
  "core/embed",
  "core/video",
  "core/audio",
  "core/gallery",
  "core/table",
  "core/separator",
  "core/spacer",
  "core/columns",
  "core/column",
  "core/group",
  "core/html",
  "core/buttons",
  "core/button",
  "core/pullquote",
  "core/file",
  "core/preformatted",
  "core/code",
  // Whatever a plugin wrote and we can't render: keep it intact rather than
  // dropping it on save.
  "core/missing",
  "core/freeform",
];

// registerCoreBlocks() mutates a module-level registry, so it must run exactly
// once per page load — twice and every block logs a duplicate-registration
// warning and the second registration wins.
let blocksRegistered = false;

/** Undo-stack depth. */
const HISTORY_LIMIT = 50;
/**
 * Clicking the canvas OUTSIDE any block clears the selection — which is what
 * makes the floating block toolbar go away. Without it the toolbar stays up
 * and the block stays selected until you happen to click a different block
 * (measured: clicking below the last block and in the side margin both left
 * the selection and the toolbar in place).
 *
 * @wordpress/block-editor does export `useBlockSelectionClearer` (16.1.0 — an
 * earlier note here called it internal), but it only clears when the wrapper
 * element ITSELF is the click target, and the side margin and the space below
 * the last block are nested divs. So the behaviour is written out here — with
 * the one guard WP's native listener gets for free (see onMouseDown).
 *
 * It MUST be a child of BlockEditorProvider: the provider stands up its own
 * registry, so a dispatch resolved in the parent component would target a
 * different store instance and silently do nothing.
 */
function CanvasSelectionClearer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Addressed by store NAME rather than the `store` object: @wordpress/
  // block-editor exports that object at runtime but does not declare it in
  // its types, and the string is the documented equivalent.
  const { clearSelectedBlock } = useDispatch("core/block-editor") as {
    clearSelectedBlock: () => void;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    // React events bubble up the REACT tree, which is not the DOM tree: a
    // block's inspector controls are rendered by the block itself (inside this
    // canvas) and portaled into the sidebar — InspectorControls is a
    // bubblesVirtually slot, i.e. createPortal. So a click on a Block-tab
    // field arrived HERE and cleared the very block it was editing (measured:
    // every fill'd control in the inspector, HTML anchor and CSS class first;
    // the panel chrome the inspector renders itself was fine). Only what is
    // physically inside the canvas column is ours to judge.
    if (!e.currentTarget.contains(t)) return;
    // Inside a block, or inside WP's own floating UI — a click on the toolbar,
    // a popover or the inserter is still "working on this block".
    if (t.closest(".block-editor-block-list__block")) return;
    if (t.closest(".components-popover, .block-editor-block-contextual-toolbar, .block-editor-inserter")) return;
    clearSelectedBlock();
  };

  // mousedown rather than click: it runs before focus moves, so the toolbar
  // goes away on the press instead of blinking through the release.
  return (
    <div className={className} onMouseDown={onMouseDown}>
      {children}
    </div>
  );
}

/**
 * wp-admin's rule for the two tabs (edit-post's block-selection listener):
 * selecting a block brings `Block` up, clearing the selection goes back to
 * `Post`. The tab buttons still override by hand in between. A multi-
 * selection counts as a selection — the inspector shows a panel for it.
 *
 * Driven from a store subscription rather than useSelect + effect: the tab
 * only has to move at the moment the selection CHANGES, and the repo's lint
 * (React compiler) rejects a synchronous setState inside an effect. Seeded
 * with the selection at mount so an already-selected block does not flip the
 * tab on its own.
 *
 * Same placement rule as CanvasSelectionClearer: a child of
 * BlockEditorProvider, or useRegistry() hands back the parent registry, which
 * has no block-editor store.
 */
function SelectionTabSync({ setTab }: { setTab: (tab: SidebarTab) => void }) {
  const registry = useRegistry();
  useEffect(() => {
    const { getSelectedBlockClientId, hasMultiSelection } = registry.select("core/block-editor") as {
      getSelectedBlockClientId: () => string | null;
      hasMultiSelection: () => boolean;
    };
    const current = () => getSelectedBlockClientId() ?? (hasMultiSelection() ? "multi" : null);
    let last = current();
    return registry.subscribe(() => {
      const now = current();
      if (now === last) return;
      last = now;
      setTab(now === null ? "post" : "block");
    }, "core/block-editor");
  }, [registry, setTab]);
  return null;
}

function ensureBlocks() {
  if (blocksRegistered) return;
  registerCoreBlocks();
  // Before the first render, not in an effect: withFilters resolves the
  // component at render time, so a late registration leaves already-mounted
  // "Media Library" buttons rendering null.
  ensureMediaUploadBridge();
  blocksRegistered = true;
  // DEV ONLY: lets the round-trip harness call parse/serialize with the real
  // registry loaded, which is the only way to prove that opening a post and
  // saving it returns the stored bytes unchanged. Stripped in production.
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __amsBlocks?: unknown }).__amsBlocks = { parse, serialize };
  }
}

export default function GutenbergEditor({
  initialContent,
  register,
  previewHref,
  header,
  sidebar,
  belowDocument,
}: {
  /** The post's STORED body — `content.raw`, i.e. block markup. Empty for a
   *  new post. (Never content.rendered: that is do_blocks() output, and
   *  parsing it would turn every block into loose HTML.) */
  initialContent: string;
  register: (h: BodyEditorHandle | null) => void;
  /** Where "Preview in new tab" goes. Absent (a post with no URL yet) hides
   *  the control rather than opening something that 404s. */
  previewHref?: string;
  /** The document's own chrome, rendered INSIDE the canvas column: the cover
   *  image and the title, above the blocks. They belong to ArticleEditor (which
   *  owns the title's ref and reads it on save) and are passed in rather than
   *  moved, because the canvas column is the only place they can live now that
   *  the sidebar docks beside it. */
  header?: React.ReactNode;
  /** The `Post` tab's contents — the ARTICLE's settings (status, categories,
   *  tags, excerpt, SEO), owned by ArticleEditor. They share the docked column
   *  with WordPress's block inspector, which is the `Block` tab. Omit and the
   *  sidebar is block settings alone. */
  sidebar?: React.ReactNode;
  /** Rendered in the document COLUMN, below the sheet — wp-admin's metabox
   *  position. It is NOT on the sheet, because it never renders in the
   *  published body (same reasoning as the excerpt). */
  belowDocument?: React.ReactNode;
}) {
  ensureBlocks();

  /** A NEW article opens on the newsroom's 10px opener plus an empty paragraph
   *  (see spacers.ts — 25 of 25 live articles start that way). An EXISTING one
   *  is parsed exactly as stored and never seeded: opening an old article must
   *  not change a byte of it, which is also why nothing here marks it dirty. */
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initialContent ? parse(initialContent) : newDocumentBlocks(),
  );
  // ONE docked column, two tabs — wp-admin's anatomy, so the editors already
  // know where things are. Open by default: the point of folding the old
  // Settings screen in here was that a writer can SEE the status and the
  // categories of the thing they are writing, not go and find them.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("post");
  const [inserterOpen, setInserterOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const dirtyRef = useRef(false);

  /* ---- undo / redo ------------------------------------------------------
   *
   * Our own history, because there isn't one to borrow: undo/redo in wp-admin
   * comes from the EDITOR store (core/editor + core-data's undo manager), and
   * a bare BlockEditorProvider has none. We own the blocks array, so the
   * history is a pair of stacks over it.
   *
   * Snapshots on onChange (persistent edits: insert, delete, move, reorder)
   * and NOT on onInput (typing), which is the same granularity wp-admin's
   * persistent undo has — one press should not walk back a character at a
   * time. Cmd+Z is deliberately NOT bound: RichText already handles native
   * undo inside a field, and hijacking the key would break typing undo. */
  const historyRef = useRef<{ past: Block[][]; future: Block[][] }>({ past: [], future: [] });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const commit = (next: Block[], previous: Block[]) => {
    const h = historyRef.current;
    h.past.push(previous);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setCanUndo(true);
    setCanRedo(false);
    dirtyRef.current = true;
    setBlocks(next);
  };

  const undo = () => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(blocks);
    setCanUndo(h.past.length > 0);
    setCanRedo(true);
    dirtyRef.current = true;
    setBlocks(prev);
  };

  const redo = () => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(blocks);
    setCanUndo(true);
    setCanRedo(h.future.length > 0);
    dirtyRef.current = true;
    setBlocks(next);
  };
  /** Whether the document already ends on an empty paragraph — the one case
   *  where the appender row must NOT also render (see renderAppender below).
   *  `content` is a RichTextData in this Gutenberg version; String() covers it
   *  and the plain-string form older serializations produce. */
  const lastBlock = blocks[blocks.length - 1];
  const lastIsEmptyParagraph =
    lastBlock?.name === "core/paragraph" &&
    String((lastBlock.attributes as { content?: unknown })?.content ?? "").length === 0;

  // Serialization is the save payload, so it must read the LATEST blocks —
  // register() runs once with a stable handle, so it reads through a ref.
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const settings = useMemo(
    () => ({
      // FLOATING, as wp-admin does: the toolbar belongs over the block it acts
      // on. It was docked (`hasFixedToolbar: true`) because in the old cramped
      // layout the floating one overlapped our sticky bar and swallowed its
      // clicks — that finding was made against a 704px column with a wrapping
      // 108px bar, and does not survive the new layout. The band now sits above
      // WP's popover layer (see bandClass) so it keeps its clicks either way.
      //
      // Docking it also cost the DRAG HANDLE: with a fixed toolbar the handle
      // lives in it, and `hideDragHandle` removed it — which is exactly why
      // paragraphs and headings could not be dragged while images (natively
      // draggable) could.
      hasFixedToolbar: false,
      focusMode: false,
      allowedBlockTypes: ALLOWED_BLOCKS,
      // MediaUploadCheck gates on this ONE value (…/media-upload/check.cjs):
      // while it was undefined, every block's Upload *and* Media Library
      // buttons were suppressed together — which is why the Image block only
      // offered "Insert from URL". Uploads go through our route handler; the
      // library button opens our picker via the editor.MediaUpload filter.
      // Both halves live in media-upload-bridge.tsx.
      mediaUpload: amsMediaUpload,
      canLockBlocks: false,
      // Theme.json-style feature flags. BlockEditorProvider merges in NO
      // defaults (wp-admin gets the classic-theme defaults from the server),
      // so every block-support UI is hidden until enabled here — this is why
      // paragraphs had no "Align text" control while wp-admin showed one.
      // `textAlign` puts it back on paragraph/heading/list toolbars; the rest
      // of typography (font size, spacing, …) stays deliberately off.
      // Wide/full block alignment stays off too: the public article column is
      // fixed-width, so `alignwide` markup would be a silent no-op.
      __experimentalFeatures: { typography: { textAlign: true } },
      // THIS is what puts "Browse all" under the canvas's quick inserter. Read
      // the source, not the docs: QuickInserter renders that button only when
      // `settings.__experimentalSetIsInserterOpened` exists, because the button
      // has nothing to open otherwise — the host owns the full inserter panel.
      // Ours is the left panel below. Edit-site calls this with an OBJECT
      // (rootClientId/insertionIndex), so coerce rather than store the value.
      __experimentalSetIsInserterOpened: (v: unknown) => setInserterOpen(!!v),
    }),
    [],
  );

  useEffect(() => {
    const handle: BodyEditorHandle = {
      // serialize() emits canonical block markup — the same bytes wp-admin
      // would write for the same document.
      getHtml: () => (blocksRef.current.length ? serialize(blocksRef.current) : ""),
      isDirty: () => dirtyRef.current,
    };
    register(handle);
    // DEV ONLY: the same handle, reachable from a test harness. It is the only
    // way to assert what a save WOULD write without writing it — the editor DOM
    // is not the save payload (an image block carries its attachment id in the
    // serialized markup, never in the rendered <img> class). Stripped in prod.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __amsEditor?: BodyEditorHandle }).__amsEditor = handle;
    }
    return () => register(null);
  }, [register]);

  return (
    <div className={css({ position: "relative" })}>
      {/* One provider around EVERYTHING that reads block state: the docked
          toolbar, the canvas and the inspector all subscribe to the same
          store, so none of them can sit outside it. */}
      <ShortcutProvider>
        <SlotFillProvider>
          <BlockEditorProvider
            value={blocks}
            settings={settings}
            // onInput = in-progress edits (typing): no history entry.
            onInput={(next: Block[]) => {
              dirtyRef.current = true;
              setBlocks(next);
            }}
            // onChange = persistent edits (insert, remove, move, reorder):
            // one undo step each.
            // The spacer convention rides on the SAME commit as the edit that
            // triggered it, so `previous` is the pre-insert document and one
            // Cmd+Z takes the image and both of its spacers back together.
            onChange={(next: Block[]) => commit(applyMediaSpacers(next, blocks), blocks)}
          >
            <SelectionTabSync setTab={setSidebarTab} />
            {/* ONE band, spanning the whole editor above both columns — the
                anatomy wp-admin uses. It is fixed-height and never wraps: the
                old version mixed 30px controls with WP's 40px toolbar buttons
                inside a wrapping row, which measured 44px empty and 108px with
                a block selected (three rows of misaligned icons). */}
            <div className={cx("ams-editor-band", bandClass)} style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}>
              {/* Opens the FULL panel, as wp-admin's header + does. It used to
                  open WP's quick-inserter popover, which shows six blocks and
                  no way to reach the rest — the "Browse all" button that would
                  have led there cannot render without the host providing a
                  panel (see __experimentalSetIsInserterOpened above). */}
              <button
                type="button"
                onClick={() => setInserterOpen((v) => !v)}
                aria-expanded={inserterOpen}
                aria-label="Add block"
                title="Add block"
                className={css({ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", flex: "none", cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", transition: "transform .12s" })}
                style={{ background: ac.accent, transform: inserterOpen ? "rotate(45deg)" : "none" }}
              >
                <Icon name="plus" size={16} strokeWidth={2.2} />
              </button>
              <span className={dividerClass} style={{ background: ac.border }} />

              {/* Undo / redo, where wp-admin puts them. The block's own controls
                  are NOT here any more — they float over the block they act on
                  (see settings.hasFixedToolbar), which is also what gives text
                  blocks their drag handle back. */}
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo"
                title="Undo"
                className={bandIconBtnClass}
                style={{ color: canUndo ? ac.text : ac.faint, cursor: canUndo ? "pointer" : "default" }}
              >
                <Icon name="undo" size={17} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo"
                title="Redo"
                className={bandIconBtnClass}
                style={{ color: canRedo ? ac.text : ac.faint, cursor: canRedo ? "pointer" : "default" }}
              >
                <Icon name="redo" size={17} strokeWidth={1.9} />
              </button>

              <div className={css({ flex: 1 })} />

              {/* Preview width. It resizes the DOCUMENT, not an iframe — the
                  canvas is inline, so this shows how the copy breaks at each
                  width, not the front-end's own responsive CSS. "Open" is the
                  real thing, in a new tab. */}
              <div className={css({ display: "flex", gap: "2px", padding: "2px", borderRadius: "8px", flex: "none" })} style={{ background: ac.canvas, border: `1px solid ${ac.border}` }}>
                {DEVICES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDevice(d.id)}
                    aria-pressed={device === d.id}
                    title={`${d.label} — ${d.width}px column`}
                    aria-label={d.label}
                    className={css({ width: "32px", height: "32px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", transition: "background .12s" })}
                    style={{ background: device === d.id ? ac.surface : "transparent", color: device === d.id ? ac.text : ac.muted }}
                  >
                    <Icon name={d.icon} size={15} strokeWidth={1.8} />
                  </button>
                ))}
                {previewHref ? (
                  <a
                    href={previewHref}
                    target="_blank"
                    rel="noreferrer"
                    title="Preview in new tab"
                    aria-label="Preview in new tab"
                    className={css({ width: "32px", height: "32px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .12s", _hover: { background: ac.surface } })}
                    style={{ color: ac.muted }}
                  >
                    <Icon name="external" size={14} strokeWidth={1.9} />
                  </a>
                ) : null}
              </div>

              {/* One toggle for the whole column, not a "Block settings"
                  button: the panel it opens now holds the article's own
                  settings too, and the tabs inside it choose between them. */}
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-pressed={sidebarOpen}
                aria-label={sidebarOpen ? "Hide the settings sidebar" : "Show the settings sidebar"}
                className={bandBtnClass}
                style={{ background: sidebarOpen ? ac.canvas : "transparent", border: `1px solid ${ac.border}`, color: sidebarOpen ? ac.text : ac.muted }}
              >
                <Icon name="settings" size={15} strokeWidth={1.9} />Settings
              </button>
            </div>

            <div className={css({ display: "flex", alignItems: "flex-start", minHeight: 0 })}>
              {inserterOpen ? (
                // The block library, docked LEFT like wp-admin's. Same sticky
                // treatment as the inspector on the right, for the same reason:
                // this admin scrolls the document, not an app frame.
                <aside className={inserterPanelClass} style={{ background: ac.surface, borderRight: `1px solid ${ac.border}` }}>
                  {/* No header of our own: the Library renders its OWN close
                      button ("Close Block Inserter") beside the tabs, so adding
                      one gave the panel two. Wiring onClose makes WP's work.
                      It stays open after an insert, as wp-admin does — building
                      a layout means inserting several blocks in a row. */}
                  <InserterLibrary showMostUsedBlocks onClose={() => setInserterOpen(false)} />
                </aside>
              ) : null}

              {/* The canvas AREA takes the whole window; the DOCUMENT inside it
                  stays at reading width and re-centres. That is what keeps the
                  inspector from costing canvas: opening it shrinks the area
                  (1080px -> 780px at 1600px wide), not the 768px document. */}
              <CanvasSelectionClearer className={css({ flex: 1, minWidth: 0 })}>
                <div className={documentAreaClass}>
                  <div className={documentColClass} style={{ maxWidth: DEVICE_WIDTH[device] }}>
                    {/* THE SHEET — the page itself, and the reason this is not
                        just a paint job: it carries the PUBLIC site's own
                        background, so an image with a white backdrop stops
                        showing a box edge here that vanishes once published.
                        Cover, title and blocks sit ON it because they ARE the
                        document; the excerpt does not, because it never renders
                        in the article body and putting it here would say it
                        does. Edges also give the device control something
                        visible to resize. */}
                    <div
                      className={sheetClass}
                      style={{ background: publishedPageBg, border: `1px solid ${ac.border}`, boxShadow: ac.shadowSm }}
                    >
                      {header}
                      {/* editor-styles-wrapper is what WP's own stylesheets target;
                          without it the canvas renders unstyled. */}
                      <div className={`editor-styles-wrapper ${canvasClass}`}>
                        <BlockTools>
                          <WritingFlow>
                            <ObserveTyping>
                              <AppendableBlockList
                                // wp-admin's rule: the appender row shows
                                // UNLESS the last block is an empty paragraph,
                                // which already renders the same placeholder —
                                // both at once would read as two type-here
                                // rows. `false` (not undefined) is the
                                // explicit "none": undefined would fall back
                                // to BlockList's own empty-document logic.
                                renderAppender={lastIsEmptyParagraph ? false : DefaultBlockAppender}
                              />
                            </ObserveTyping>
                          </WritingFlow>
                        </BlockTools>
                      </div>
                    </div>
                    {belowDocument ? <div className={css({ marginTop: "28px" })}>{belowDocument}</div> : null}
                  </div>
                </div>
              </CanvasSelectionClearer>

              {sidebarOpen ? (
                // Sticky rather than a fixed-height scroller: this admin scrolls
                // the DOCUMENT (the shell is min-height:100vh, not a 100vh
                // app frame), so a full-height flex child would have no height
                // to fill. Sticky gives the docked feel without changing the
                // shell's scroll model.
                <aside className={sidebarClass} style={{ background: ac.surface, borderLeft: `1px solid ${ac.border}` }}>
                  <div className={sidebarTabsClass} style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}>
                    <div className={css({ display: "flex", gap: "2px" })} role="tablist" aria-label="Editor settings">
                      {SIDEBAR_TABS.map((t) => {
                        const on = sidebarTab === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-controls={`ams-sidebar-${t.key}`}
                            onClick={() => setSidebarTab(t.key)}
                            className={sidebarTabClass}
                            // Underline rather than a filled pill: the tabs sit
                            // ON the panel they label, so a fill would read as a
                            // second surface stacked on the first.
                            style={{ color: on ? ac.text : ac.muted, boxShadow: on ? `inset 0 -2px 0 ${ac.accent}` : "none" }}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className={css({ flex: 1 })} />
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(false)}
                      aria-label="Hide the settings sidebar"
                      className={sidebarCloseClass}
                      style={{ color: ac.muted }}
                    >
                      <Icon name="x" size={13} strokeWidth={2.2} />
                    </button>
                  </div>

                  {/* Both panels stay MOUNTED and toggle with `display`.
                      Switching to Block and back must not scroll the Post panel
                      to the top, collapse its sections, or make WP's inspector
                      rebuild every control it had just drawn. */}
                  <div id="ams-sidebar-post" role="tabpanel" aria-label="Post settings" style={{ display: sidebarTab === "post" ? "block" : "none" }}>
                    {sidebar}
                  </div>
                  <div id="ams-sidebar-block" role="tabpanel" aria-label="Block settings" style={{ display: sidebarTab === "block" ? "block" : "none" }}>
                    <BlockInspector />
                  </div>
                </aside>
              ) : null}
            </div>
            {/* Popovers (block toolbar, link editor, inserter) portal into
                this slot — omit it and the toolbar never appears. */}
            <Popover.Slot />
          </BlockEditorProvider>
        </SlotFillProvider>
      </ShortcutProvider>

    </div>
  );
}
// The band's standalone "Media library" button is GONE, and with it the
// append-an-image-at-the-end picker it opened. It existed because the blocks
// could not reach the library themselves; now they can (media-upload-bridge),
// so a media control that ignores where the cursor is has no reason to sit in
// a toolbar next to Block settings. Media arrives through the Image, Gallery,
// Video, Audio and File blocks — and the cover image, which has its own
// picker in ArticleEditor.

/** Preview widths. The document is not iframed, so this changes the COLUMN,
 *  which is what shows how a headline and its paragraphs break at each size.
 *  Front-end media queries are not simulated — "Open" is for that. */
type Device = "desktop" | "tablet" | "mobile";
const DEVICES: { id: Device; label: string; icon: IconName; width: number }[] = [
  // 768 is the reading column the public article page actually uses; the other
  // two are the column at a tablet and a phone. Tablet was 780 first, which is
  // WIDER than desktop — the control measured as a no-op (704 vs 716) because
  // the document is capped for readability, not by the viewport.
  { id: "desktop", label: "Desktop", icon: "monitor", width: 768 },
  { id: "tablet", label: "Tablet", icon: "tablet", width: 620 },
  { id: "mobile", label: "Mobile", icon: "phone", width: 390 },
];
const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "768px",
  tablet: "620px",
  mobile: "390px",
};

/** The band: one row, fixed height, never wraps. Sticky under the 56px app top
 *  bar. Everything in it is 40px tall so WP's controls and ours share a
 *  baseline — the misalignment was a 30-vs-40 mismatch, not a spacing bug. */
const bandClass = css({
  position: "sticky",
  top: "56px",
  // ABOVE WordPress's popover layer (z-index 1000000). The block toolbar
  // floats again, and a block near the top of the viewport puts it over this
  // bar — where it used to intercept the bar's clicks. The bar wins now, and
  // the toolbar tucks under it, which is what a sticky header should do.
  zIndex: 1000001,
  display: "flex",
  alignItems: "center",
  flexWrap: "nowrap",
  gap: "8px",
  height: "56px",
  padding: "0 16px",
});

const dividerClass = css({ width: "1px", height: "24px", flex: "none" });

/** The band's own buttons, sized to WP's `is-next-40px-default-size`. */
const bandBtnClass = css({
  height: "40px",
  padding: "0 12px",
  borderRadius: "8px",
  fontSize: "13px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "7px",
  flex: "none",
  whiteSpace: "nowrap",
  transition: "background .12s",
  _hover: { background: ac.surfaceHover },
});

/** Square icon button for the band (undo/redo). Same 40px as everything else. */
const bandIconBtnClass = css({
  width: "40px",
  height: "40px",
  flex: "none",
  borderRadius: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  transition: "background .12s",
  _hover: { background: ac.surfaceHover },
  _disabled: { _hover: { background: "transparent" } },
});

/** The gutter the sheet floats in. It needs air on every side or it reads as a
 *  panel bolted to the chrome rather than a page lying on a desk. */
const documentAreaClass = css({
  padding: "32px 24px 120px",
});

/** The document column: reading width, centred in whatever space the canvas
 *  area has. This is the 768px that used to be the WHOLE editor. It wraps the
 *  sheet AND the off-sheet excerpt so both track the device width together —
 *  an excerpt field that stayed 768px while the page narrowed to 390px would
 *  look like part of the chrome. */
const documentColClass = css({
  maxWidth: "768px",
  margin: "0 auto",
});

/** The page. Horizontal padding is the 32px the document column used to carry,
 *  so the reading measure is unchanged (704px at desktop) — what moved is only
 *  what sits behind it. Deliberately NO `overflow: hidden`: WP's drag handles,
 *  the block appender and the inserter's drop indicator all paint outside the
 *  block list, and clipping them breaks the affordances. */
const sheetClass = css({
  // Square corners, on the owner's call. A rounded sheet read as a CARD in the
  // tool; a sharp one reads as a sheet of paper, which is what it is.
  padding: "32px 32px 56px",
  // A near-empty document still fills the viewport (owner request): 112px of
  // sticky chrome + the area's 32px top gutter + a matching 32px at the bottom.
  minHeight: "calc(100vh - 176px)",
});

/** The block library, docked left. Wider than the inspector because it holds a
 *  three-column block grid plus the Patterns/Media tabs. */
const inserterPanelClass = css({
  // 350 is WP's own inserter width and its menu asserts it, so the column has
  // to be wider than that or the vertical scrollbar (9px here) steals from the
  // content and the panel scrolls sideways — measured: 341 client vs 350
  // scroll. overflowX is belt to that braces.
  width: "360px",
  flex: "none",
  position: "sticky",
  top: "112px", // 56px app bar + 56px band
  height: "calc(100vh - 112px)",
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
});

/** The two tabs, in wp-admin's order. The active tab FOLLOWS the selection —
 *  see SelectionTabSync — and the buttons override it by hand. (An earlier
 *  version deliberately did not follow it, to protect a half-typed category
 *  filter in the Post panel; but both panels stay mounted and only toggle
 *  `display`, so nothing there is lost by switching, and the editors expect
 *  wp-admin's behaviour: click a block, see its settings.) */
type SidebarTab = "post" | "block";
const SIDEBAR_TABS: { key: SidebarTab; label: string }[] = [
  { key: "post", label: "Post" },
  { key: "block", label: "Block" },
];

/** The docked sidebar: the article's settings and WP's block inspector sharing
 *  one column. 320px — 20 wider than the inspector alone was, because the Post
 *  tab carries a category list with counts and a 0/160 counter beside a label,
 *  and both were wrapping at 300. Its own scroll, sticky below the band. */
const sidebarClass = css({
  width: "320px",
  flex: "none",
  position: "sticky",
  top: "112px", // 56px app bar + 56px band
  height: "calc(100vh - 112px)",
  overflowY: "auto",
});

/** The tab strip, sticky INSIDE the sidebar's own scroller — the Post panel is
 *  taller than the viewport with two sections open, and tabs you have to scroll
 *  back up to reach are tabs nobody uses. */
const sidebarTabsClass = css({
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  padding: "0 8px 0 6px",
  height: "44px",
  flex: "none",
});

const sidebarTabClass = css({
  height: "43px",
  padding: "0 12px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  border: "none",
  background: "transparent",
  transition: "color .12s, box-shadow .12s",
});

const sidebarCloseClass = css({
  width: "28px",
  height: "28px",
  borderRadius: "7px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  border: "none",
  background: "transparent",
  flex: "none",
  _hover: { background: ac.surfaceHover },
});

// The canvas inherits WP's editor styles (imported above); these are OUR
// overrides so it sits in the dashboard's type scale rather than wp-admin's.
const canvasClass = css({
  minHeight: "320px",
  padding: "8px 0 40px",
  fontSize: "16px",
  lineHeight: 1.9,
  "& .block-editor-block-list__layout": { maxWidth: "100%" },
  "& p": { margin: "0 0 18px" },
  "& h2": { fontSize: "24px", fontWeight: 600, lineHeight: 1.6, margin: "28px 0 12px" },
  "& h3": { fontSize: "19px", fontWeight: 600, lineHeight: 1.6, margin: "22px 0 10px" },
  "& img": { maxWidth: "100%", height: "auto" },
});
