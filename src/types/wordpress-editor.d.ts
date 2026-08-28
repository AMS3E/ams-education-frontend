// Ambient types for the WordPress editor packages we embed.
//
// @wordpress/blocks ships real .d.ts files; @wordpress/block-editor,
// @wordpress/block-library and @wordpress/keyboard-shortcuts ship NONE (their
// package.json has an empty or absent `types`), so TypeScript falls back to
// an implicit-any error under `noImplicitAny`.
//
// These declarations cover exactly the surface GutenbergEditor.tsx uses, typed
// as honestly as is useful — a blanket `any` module would let a real mistake
// (a renamed prop, a removed export) compile silently. Extend as more of the
// editor gets used; do NOT widen these to `any`.

declare module "@wordpress/block-editor" {
  import type { ComponentType, ReactNode } from "react";
  import type { Block } from "@wordpress/blocks";

  export interface BlockEditorSettings {
    hasFixedToolbar?: boolean;
    focusMode?: boolean;
    allowedBlockTypes?: string[] | boolean;
    mediaUpload?: unknown;
    canLockBlocks?: boolean;
    [key: string]: unknown;
  }

  export const BlockEditorProvider: ComponentType<{
    value: Block[];
    settings?: BlockEditorSettings;
    /** Fires for in-progress edits (typing). */
    onInput?: (blocks: Block[]) => void;
    /** Fires for committed edits (block added/removed/reordered). */
    onChange?: (blocks: Block[]) => void;
    children?: ReactNode;
  }>;

  export const BlockList: ComponentType<{ className?: string }>;
  /** The selected block's controls. Under `hasFixedToolbar` BlockTools stops
   *  rendering these itself and the host must place them. */
  export const BlockToolbar: ComponentType<{ hideDragHandle?: boolean }>;
  export const BlockTools: ComponentType<{ children?: ReactNode }>;
  export const BlockInspector: ComponentType<Record<string, never>>;
  export const WritingFlow: ComponentType<{ children?: ReactNode }>;
  export const ObserveTyping: ComponentType<{ children?: ReactNode }>;

  export const Inserter: ComponentType<{
    rootClientId?: string;
    position?: string;
    renderToggle: (props: { onToggle: () => void; isOpen: boolean }) => ReactNode;
  }>;

  /** wp-admin's full inserter panel: Blocks / Patterns / Media, categorised,
   *  searchable — what the six-block quick inserter's "Browse all" opens.
   *  Still `__experimental` upstream; pinned by the version in package.json.
   *  The props below are the ones this app passes, not the whole surface. */
  export const __experimentalLibrary: ComponentType<{
    rootClientId?: string;
    showMostUsedBlocks?: boolean;
    showInserterHelpPanel?: boolean;
    onSelect?: (block: Block) => void;
    onClose?: () => void;
  }>;
}

declare module "@wordpress/block-library" {
  /** Registers every core block type in the shared registry. Idempotent only
   *  in the sense that a second call re-registers and warns — call it once. */
  export function registerCoreBlocks(): void;
}

/** Imported only for its side effect: registering the core text formats. */
declare module "@wordpress/format-library";

declare module "@wordpress/keyboard-shortcuts" {
  import type { ComponentType, ReactNode } from "react";
  export const ShortcutProvider: ComponentType<{ children?: ReactNode }>;
}
