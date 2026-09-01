"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon, type IconName } from "../icons";
import MediaPicker from "../MediaPicker";

// TipTap rich-text editor for article bodies. Produces clean semantic HTML for
// `post_content` (paragraphs, h2/h3, lists, quotes, links, images) — the same
// vocabulary the public site renders from `content.rendered`.
//
// DIRTY-TRACKING is the load-bearing contract: existing posts are Gutenberg
// block markup, and any save of this editor's output flattens that to static
// HTML. So the parent only includes `content` in its save payload when
// `isDirty()` — i.e. the user actually typed/changed something here. Loading a
// post into the editor and saving metadata leaves the stored body byte-for-byte
// untouched. (onUpdate only fires on real document transactions, never on the
// initial parse.)

export interface BodyEditorHandle {
  /** Serialized body HTML ("" for an empty document). */
  getHtml(): string;
  /** True once the user has actually edited the body in this session. */
  isDirty(): boolean;
}

// The ProseMirror contenteditable itself. Class must be a plain string (TipTap
// applies it via editorProps), so it's built once at module scope.
const proseClass = css({
  outline: "none",
  fontSize: "16px",
  lineHeight: 1.9,
  minHeight: "260px",
  paddingBottom: "40px",
  "& p": { margin: "0 0 18px" },
  "& h2": { fontSize: "24px", fontWeight: 600, lineHeight: 1.6, margin: "28px 0 12px" },
  "& h3": { fontSize: "19px", fontWeight: 600, lineHeight: 1.6, margin: "22px 0 10px" },
  "& ul": { listStyle: "disc", paddingLeft: "26px", margin: "0 0 18px" },
  "& ol": { listStyle: "decimal", paddingLeft: "26px", margin: "0 0 18px" },
  "& li": { margin: "4px 0" },
  "& li p": { margin: 0 },
  "& blockquote": { margin: "0 0 18px", paddingLeft: "16px" },
  "& img": { maxWidth: "100%", height: "auto", borderRadius: "8px", display: "block", margin: "0 0 18px" },
  "& img.ProseMirror-selectednode": { outline: "2px solid ${ac.data}", outlineOffset: "2px" },
  "& a": { textDecoration: "underline", textUnderlineOffset: "3px" },
  "& hr": { border: "none", margin: "26px 0" },
  // Placeholder (from @tiptap/extensions) renders via this data attribute.
  "& p.is-editor-empty:first-child::before": {
    content: "attr(data-placeholder)",
    color: ac.faint,
    float: "left",
    height: 0,
    pointerEvents: "none",
  },
});

export default function BodyEditor({
  initialHtml,
  register,
}: {
  initialHtml: string;
  register: (h: BodyEditorHandle | null) => void;
}) {
  const dirtyRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useEditor({
    // Rendered inside a Next page — skip the SSR render pass (TipTap requires
    // this to be explicit in an SSR framework).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }, // h1 is the article title, not body content
        code: false,
        codeBlock: false, // news copy never needs code blocks
        link: {
          openOnClick: false, // clicking edits; ctrl-click would navigate away mid-edit
          autolink: true,
          defaultProtocol: "https",
        },
      }),
      TiptapImage,
      Placeholder.configure({ placeholder: "Write the story…" }),
    ],
    content: initialHtml,
    onUpdate: () => {
      dirtyRef.current = true;
    },
    editorProps: { attributes: { class: proseClass } },
  });

  useEffect(() => {
    if (!editor) return;
    register({
      getHtml: () => (editor.isEmpty ? "" : editor.getHTML()),
      isDirty: () => dirtyRef.current,
    });
    return () => register(null);
  }, [editor, register]);

  // Toolbar highlight state, recomputed per transaction without re-rendering
  // the whole editor tree (v3's opt-in model).
  const state = useEditorState({
    editor,
    selector: ({ editor: e }: { editor: Editor | null }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            blockquote: e.isActive("blockquote"),
            link: e.isActive("link"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  if (!editor) {
    // First client render (immediatelyRender: false) — hold the space.
    return <div className={css({ minHeight: "300px" })} />;
  }

  const editLink = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    // window.prompt is deliberate v1 plumbing — a one-field modal with extra
    // state buys nothing for an internal tool.
    const url = window.prompt("Link URL (empty removes the link)", prev || "https://");
    if (url === null) return;
    const href = url.trim();
    if (!href || href === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div>
      {/* Toolbar — sticks just below the editor's 56px top bar */}
      <div
        className={css({ position: "sticky", top: "56px", zIndex: 20, display: "flex", alignItems: "center", gap: "2px", padding: "6px 8px", borderRadius: "10px", flexWrap: "wrap" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowSm }}
      >
        <ToolBtn icon="bold" label="Bold" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolBtn icon="italic" label="Italic" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolBtn icon="strike" label="Strikethrough" active={state?.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <Divider />
        <ToolBtn text="H2" label="Heading" active={state?.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolBtn text="H3" label="Subheading" active={state?.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolBtn icon="quote" label="Blockquote" active={state?.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <Divider />
        <ToolBtn icon="list" label="Bullet list" active={state?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolBtn icon="orderedList" label="Numbered list" active={state?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Divider />
        <ToolBtn icon="link" label="Link" active={state?.link} onClick={editLink} />
        <ToolBtn icon="media" label="Insert image" onClick={() => setPickerOpen(true)} />
        <div className={css({ flex: 1 })} />
        <ToolBtn icon="undo" label="Undo" disabled={!state?.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <ToolBtn icon="redo" label="Redo" disabled={!state?.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      <div className={css({ marginTop: "14px" })} style={{ color: ac.sub }}>
        <EditorContent editor={editor} />
      </div>

      {pickerOpen ? (
        <MediaPicker
          title="Insert image"
          onClose={() => setPickerOpen(false)}
          onPick={(m) => {
            editor.chain().focus().setImage({ src: m.url, alt: m.alt }).run();
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ToolBtn({
  icon,
  text,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon?: IconName;
  text?: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep focus in the editor — a toolbar click must not blur the selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={css({ height: "30px", minWidth: "30px", padding: "0 6px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", fontSize: "12px", fontWeight: 600, transition: "background .12s, color .12s", _hover: { background: ac.surfaceHover }, _disabled: { cursor: "default", _hover: { background: "transparent" } } })}
      style={{
        background: active ? ac.surfaceSunken : "transparent",
        color: disabled ? ac.faint : active ? ac.text : ac.muted,
      }}
    >
      {icon ? <Icon name={icon} size={15} strokeWidth={1.9} /> : text}
    </button>
  );
}

function Divider() {
  return <div className={css({ width: "1px", height: "18px", margin: "0 4px" })} style={{ background: ac.border }} />;
}
