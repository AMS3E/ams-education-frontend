"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { css, cx } from "@/styled-system/css";
import { ac, type Status } from "../tokens";
import { Icon } from "../icons";
import { Button, Checkbox, Input, StatusPill, Textarea } from "../ui";
import type { EditablePost, PostTemplate } from "@/lib/admin/post-edit";
import type { CategoryNode } from "@/lib/admin/categories";
import { suggestTemplate } from "@/lib/admin/article-template";
import { Dropdown } from "../Dropdown";
import { savePostAction, createPostAction, type EditorPayload } from "@/lib/admin/actions";
import { searchTags, type TagOption } from "@/lib/admin/editor-actions";
import { createTag } from "@/lib/admin/screen-actions";
import MediaPicker from "../MediaPicker";
import ConfirmDialog from "../ConfirmDialog";
import LegacySiteChip, { startLegacyRefresh } from "../LegacySiteChip";
import YoastMetabox from "../seo/YoastMetabox";
import { type BodyEditorHandle } from "./BodyEditor";
import EditorSkeleton from "./EditorSkeleton";
import {
  agoLabel,
  clearDraft,
  draftKey,
  pruneDrafts,
  readDraft,
  writeDraft,
  type DraftData,
} from "@/lib/admin/editor-draft";

// The real Gutenberg canvas — @wordpress/block-editor touches `document` at
// module scope and is far too heavy for the server bundle, so it loads
// client-side only, on the editor screens that actually mount it.
const GutenbergEditor = dynamic(() => import("./GutenbergEditor"), {
  ssr: false,
  // The bundle is the SLOW half of opening an article, and this used to be an
  // empty 320px div: the top bar sat over a blank page with its status line
  // reading "Loaded". Now the canvas holds the editor's own shape and says
  // what it is waiting for.
  loading: () => <EditorSkeleton note="Preparing the editor…" />,
});

// ---------------------------------------------------------------------------
// Article editor, wired to WordPress. ONE screen: the document on the canvas,
// its settings docked in a sidebar beside it.
//
// The Write/Settings mode switch is GONE. It charged a round trip to the other
// half of the tool for every category tick and every status change, and the
// editors said so the first time they used it in anger. What replaces it is
// wp-admin's own anatomy — `Post` and `Block` tabs on one docked column — so
// there is nothing new to learn, only one fewer place to go.
//
// SAVES: title, body (Gutenberg → block markup), excerpt, status, categories,
// tags, featured image, Yoast SEO. The body is DIRTY-TRACKED: `content` rides
// the payload only when the user actually edited it here — with Gutenberg a
// save is lossless either way, but an untouched body is still not worth
// rewriting.
//
// THE TITLE is an uncontrolled contentEditable (initialised once, read on save
// through a ref) because a controlled contentEditable fights the cursor. That
// is safe only because it sits on the canvas, which is always mounted.
//
// THE EXCERPT is ordinary controlled state, and that is not a style choice. It
// moved into the sidebar, and a sidebar closes; a ref read against a panel that
// is not in the DOM returns "" and would have quietly saved an empty excerpt
// over a real one. Holding the value in React makes that impossible rather than
// merely unlikely — no invariant for the next person to trip over. The field is
// plain text, so a <textarea> costs nothing that contentEditable was buying.
// ---------------------------------------------------------------------------

const metaLabel = css({ fontSize: "12.5px" });
const rowBetween = css({ display: "flex", alignItems: "center", justifyContent: "space-between" });
const noteText = css({ fontSize: "11.5px", lineHeight: 1.6 });
/** A text action that sits under a control rather than beside it — Replace and
 *  Remove on the featured image. Not a `Button`: at 36px each, two of them
 *  under a thumbnail outweigh the thumbnail. */
const linkBtn = css({
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  border: "none",
  background: "transparent",
  padding: 0,
  _hover: { textDecoration: "underline" },
});
// The placeholder colour is written as a PANDA TOKEN (`admin.faint`), not as
// `ac.faint`. MEASURED: with `ac.faint` — the raw string "var(--colors-admin-
// faint)" — Panda put the class on the element and emitted NO RULE for it, so
// the ::before fell back to inheriting the title's own ink and "Article title"
// rendered in full-strength near-black, indistinguishable from a real headline.
// `content` and `pointerEvents` from the same block emitted fine; only the
// colour was dropped. Token names are Panda's first-class path and resolve at
// build time to the same var(), which is also theme-aware.
const editablePlaceholder = css({
  "&:empty::before": { content: "attr(data-placeholder)", color: "admin.faint", pointerEvents: "none" },
});

function toWpStatus(s: Status): string {
  return s === "Published" ? "publish" : s === "Pending" ? "pending" : s === "Private" ? "private" : "draft";
}
function fromWpStatus(s: string): Status {
  return s === "publish" ? "Published" : s === "pending" ? "Pending" : s === "private" ? "Private" : "Draft";
}
/** How a status reads in a sentence — nobody says an article is "Pending". */
function statusWord(s: Status): string {
  return s === "Pending" ? "Pending review" : s;
}

/** The statuses this admin can write, with wp-admin's own descriptions.
 *  `future` (Scheduled) is deliberately absent — the footnote in the popover
 *  says why, exactly where someone hunting for "Schedule" will look. */
const STATUS_OPTIONS: { value: Status; title: string; desc: string }[] = [
  { value: "Draft", title: "Draft", desc: "Not ready to publish." },
  { value: "Pending", title: "Pending review", desc: "Waiting for review before publishing." },
  { value: "Private", title: "Private", desc: "Only visible to site admins and editors." },
  { value: "Published", title: "Published", desc: "Visible to everyone." },
];

// (The title used to be seeded with dangerouslySetInnerHTML here, on the note
// "React skips the DOM when __html is stable". MEASURED FALSE on React 19:
// updateProperties compares that prop by OBJECT reference and an inline
// `{{ __html }}` is a fresh object every render, so any re-render of the
// element re-runs `innerHTML = …` and wipes what was typed. It only ever
// survived because the React Compiler kept the element's identity stable —
// protection that silently evaporates whenever anything in this component
// makes the compiler bail. Seeded via a run-once ref callback instead: React
// then manages NO children on the element, and no code path can reset it.)

/** Which sidebar sections are folded open. Publish is not among them — it has
 *  no header and never collapses, because status is the one thing you look at
 *  on every single visit. */
type SectionKey = "categories" | "tags" | "excerpt";

export default function ArticleEditor({
  mode = "edit",
  post = null,
  categories,
  templates = [],
}: {
  mode?: "create" | "edit";
  post?: EditablePost | null;
  categories: CategoryNode[];
  /** Post templates the live theme registers. Empty when ams-frontend-api is
   *  below 1.19.0 or the call failed — the control still renders, with
   *  "Default template" and whatever the post already carries. */
  templates?: PostTemplate[];
}) {
  const router = useRouter();
  const isCreate = mode === "create";

  /* ---- The local backup (see editor-draft.ts for why it is NOT a WP draft).
     `baselineRef` is what "clean" means: a JSON snapshot of the editor as it
     stood once mounted (and re-captured after every successful save). Dirty =
     current snapshot differs from it. `lastBackupRef` is what localStorage
     currently holds, so the heartbeat only writes on change. `guardRef` is the
     latest-closure escape hatch: the guards are wired up in mount-once effects
     and timers, and dispatch through it so they always read THIS render's
     state (the same reason GutenbergEditor reads blocks through blocksRef). */
  const backupKey = draftKey(isCreate ? null : post?.id ?? null);
  const [pendingBackup, setPendingBackup] = useState<{ at: number } | null>(null);
  const baselineRef = useRef<string | null>(null);
  const lastBackupRef = useRef<string | null>(null);
  const guardRef = useRef<{
    snapshotData: () => DraftData | null;
    flushBackup: () => boolean;
    isEditorDirty: () => boolean;
  } | null>(null);

  // Uncontrolled canvas field — seeded once by attachTitle, read through the ref.
  const titleRef = useRef<HTMLDivElement | null>(null);
  const titleSeededRef = useRef(false);
  /** The title's text, mirrored on every edit. MEASURED NECESSARY: the unmount
   *  backup flush runs from an effect cleanup, and React detaches refs BEFORE
   *  effect cleanups — titleRef is already null there, so without the mirror
   *  every back-navigation overwrote the backup with an EMPTY title (the body
   *  survived, coming from plain refs, which is what made it look like "only
   *  the title doesn't save"). The DOM stays the source of truth while the
   *  element is alive; the mirror answers after it is gone. */
  const titleTextRef = useRef("");
  /** Seeds the title's text on FIRST attach only (innerText, not innerHTML —
   *  the value is plain text, so nothing needs escaping; see the note above
   *  this component on why dangerouslySetInnerHTML had to go), and keeps
   *  titleTextRef current via an input listener. Returns a ref cleanup
   *  (React 19) so the listener and the ref are torn down together. */
  const attachTitle = useCallback(
    (el: HTMLDivElement | null) => {
      titleRef.current = el;
      if (!el) return;
      if (!titleSeededRef.current) {
        titleSeededRef.current = true;
        el.innerText = post?.title ?? "";
      }
      titleTextRef.current = el.innerText;
      const onInput = () => {
        titleTextRef.current = el.innerText;
      };
      el.addEventListener("input", onInput);
      return () => {
        el.removeEventListener("input", onInput);
        titleRef.current = null;
      };
    },
    [post],
  );

  // The body editor registers a handle here once mounted; save() consults it
  // for dirty state + HTML. Stable identity so BodyEditor's effect runs once.
  const bodyRef = useRef<BodyEditorHandle | null>(null);
  /** Registration doubles as the editor's readiness signal: GutenbergEditor
   *  registers from an effect once it has mounted and parsed the body, which is
   *  exactly when the canvas stops being a skeleton. The top bar watches it so
   *  it cannot claim "Loaded" over a page that is still coming up. */
  const [editorReady, setEditorReady] = useState(false);
  const registerBody = useCallback((h: BodyEditorHandle | null) => {
    if (h === null && bodyRef.current) {
      // Deregistration IS the reliable leave-the-page hook for client-side
      // navigation (browser back, sidebar Links, the post-create push): child
      // cleanups run before parent ones on unmount, so by the time the guard
      // effect's own cleanup fires, the body handle is already gone and a
      // flush there reads nothing. Here the handle is still alive.
      guardRef.current?.flushBackup();
    }
    bodyRef.current = h;
    setEditorReady(h !== null);
    if (h) {
      // The backup machinery arms HERE, not on mount: the baseline must read
      // the body exactly as the editor parsed it (serialize∘parse differs from
      // the stored bytes in insignificant whitespace, so comparing against the
      // raw post would read as permanently dirty). Deferred a tick because
      // guardRef is filled by an after-render effect. Everything inside is
      // idempotent — dev StrictMode runs this twice.
      setTimeout(() => {
        const data = guardRef.current?.snapshotData();
        if (!data) return; // unmounted again before the tick
        baselineRef.current ??= JSON.stringify(data);
        const existing = readDraft(backupKey);
        if (existing) {
          if (JSON.stringify(existing.data) === baselineRef.current) {
            // The backup matches what the editor already shows (a pagehide
            // write raced a save that landed) — nothing to offer.
            clearDraft(backupKey);
          } else {
            setPendingBackup({ at: existing.at });
          }
        }
        pruneDrafts();
      }, 0);
    }
  }, [backupKey]);

  // Publish. TWO statuses on purpose: `pubStatus` is what the Status panel has
  // SELECTED (the intent) and `savedStatus` is what WordPress currently holds
  // (the truth). One value cannot be both, which is how the top bar's pill used
  // to read "Draft" over an article that was still live. Null while creating —
  // nothing is saved yet, so there is no truth to show.
  const [pubStatus, setPubStatus] = useState<Status>(isCreate ? "Draft" : fromWpStatus(post?.status ?? "draft"));
  const [savedStatus, setSavedStatus] = useState<Status | null>(isCreate ? null : fromWpStatus(post?.status ?? "draft"));
  const [statusOpen, setStatusOpen] = useState(false);
  // Visibility, WordPress's model: public | private (a STATUS) | password
  // protected (a FIELD). Private is therefore driven by pubStatus, not by a
  // separate flag — the two cannot both be authoritative.
  const [password, setPassword] = useState(post?.password ?? "");
  /** Whether the "Password protected" checkbox is ticked. The TICK reveals the
   *  input (wp-admin's anatomy); whether the post IS protected stays derived
   *  from the password text itself, so a ticked box with an empty field never
   *  claims a protection that won't save. Unticking clears the field. */
  const [pwOpen, setPwOpen] = useState(() => (post?.password ?? "").trim().length > 0);
  const [sticky, setSticky] = useState(post?.sticky ?? false);
  /** A private post has no password field at all, so protection only exists in
   *  the other statuses. Derived rather than stored — two sources of truth for
   *  one WordPress concept is how the screen ends up lying about the data. */
  const passwordProtected = pubStatus !== "Private" && password.trim().length > 0;

  // Organize
  const [checked, setChecked] = useState<Record<number, boolean>>(
    Object.fromEntries((post?.categoryIds ?? []).map((id) => [id, true])),
  );
  /**
   * POST TEMPLATE — the theme file that renders the article's TAIL on the
   * WordPress site. A post left on "Default template" shows NOTHING below the
   * body, which is the defect this control exists to prevent.
   *
   * Auto-filled from the categories, then left alone the moment a human picks
   * one (owner's rule, 2026-08-24). `templateTouched` starts TRUE for a post
   * that already carries a template, because that is a choice somebody already
   * made — re-suggesting over it on the next category tick would silently
   * relayout a live article. A post with "" is treated as untouched, so opening
   * one of the articles that has no tail today fills it in.
   */
  const [template, setTemplate] = useState(
    () => post?.template || suggestTemplate(post?.categoryIds ?? [], categories),
  );
  const [templateTouched, setTemplateTouched] = useState(() => Boolean(post?.template));
  const [tplOpen, setTplOpen] = useState(false);

  const [catSearch, setCatSearch] = useState("");
  /** The "Show all" dialog — every category at once, in columns, because the
   *  320px rail shows five at a time and finding one means scrolling. */
  const [catDialogOpen, setCatDialogOpen] = useState(false);

  // Tags (typeahead-managed) + featured image (media picker)
  const [tags, setTags] = useState<TagOption[]>(post?.tags ?? []);
  const [featuredId, setFeaturedId] = useState(post?.featuredMedia ?? 0);
  const [featuredThumb, setFeaturedThumb] = useState(post?.featuredThumb ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Excerpt — controlled; see the header note on why this one is not a ref.
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");

  // Slug — the newsroom hand-writes ENGLISH slugs (checked on live posts:
  // Khmer titles, English slugs throughout; WordPress would percent-encode
  // the Khmer). Editable in the metabox until the article has EVER been
  // published, then locked: a live URL is never rewritten, because links
  // already shared would break and this site has no redirects.
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [everPublished, setEverPublished] = useState(post?.status === "publish");

  // The article's URL on the live WordPress site, exactly as WordPress computed
  // it. Loaded with the post and refreshed from every save's echo, so the
  // preview control points at the real permalink the moment a publish lands —
  // no reload, no derived URL.
  const [wpLink, setWpLink] = useState(post?.link ?? "");

  // SEO
  const [seoTitle, setSeoTitle] = useState(post?.seo.title ?? "");
  const [metaDesc, setMetaDesc] = useState(post?.seo.description ?? "");
  const [focusKw, setFocusKw] = useState(post?.seo.focus ?? "");

  /** Section state lives HERE, not in the sidebar, so closing the sidebar and
   *  reopening it does not refold everything the writer had just opened. */
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    categories: true,
    tags: true,
    excerpt: false,
  });
  const toggleSection = (k: SectionKey) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  // Save feedback
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  /** Confirm step for the one save that pulls a LIVE article off the site. */
  const [confirmOffline, setConfirmOffline] = useState(false);

  /** Snackbar for warnings that must interrupt (blocking a publish) — the top
   *  bar's quiet status line is easy to miss with your eyes on the button. */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  /* ---- Backup + leave guard ------------------------------------------- */

  /** The editor as one restorable value — the SAME serialization decides
   *  dirtiness, feeds the backup, and becomes the baseline after a save.
   *  Null until the body registers: before that there is nothing to compare. */
  const snapshotData = (): DraftData | null => {
    const body = bodyRef.current;
    if (!body) return null;
    return {
      // Live DOM while the element exists; the mirror once refs are detached
      // (the unmount flush) — see titleTextRef.
      title: (titleRef.current ? titleRef.current.innerText : titleTextRef.current).trim(),
      body: body.getHtml(),
      status: pubStatus,
      password,
      sticky,
      categories: Object.keys(checked)
        .filter((k) => checked[Number(k)])
        .map(Number)
        .sort((a, b) => a - b),
      template,
      templateTouched,
      tags,
      featuredId,
      featuredThumb,
      excerpt,
      slug,
      seo: { title: seoTitle, description: metaDesc, focus: focusKw },
    };
  };

  const isEditorDirty = (): boolean => {
    if (baselineRef.current === null) return false;
    const data = snapshotData();
    return data !== null && JSON.stringify(data) !== baselineRef.current;
  };

  /** Write the backup if the editor holds unsaved changes; returns whether a
   *  current backup now exists. HELD while a previous session's backup is
   *  still awaiting its Restore/Discard decision — writing then would destroy
   *  the very work the banner is offering to bring back. */
  const flushBackup = (): boolean => {
    if (pendingBackup || baselineRef.current === null) return false;
    const data = snapshotData();
    if (!data) return false;
    const snap = JSON.stringify(data);
    if (snap === baselineRef.current) {
      // Edited back to clean — a backup from earlier this session would now
      // claim changes that no longer exist, so it goes too.
      if (lastBackupRef.current !== null) {
        clearDraft(backupKey);
        lastBackupRef.current = null;
      }
      return false;
    }
    if (snap !== lastBackupRef.current) {
      writeDraft(backupKey, data);
      lastBackupRef.current = snap;
    }
    return true;
  };

  const restoreBackup = () => {
    const d = readDraft(backupKey);
    setPendingBackup(null);
    if (!d) return; // evaporated (another tab, cleared storage) — nothing to do
    if (titleRef.current) titleRef.current.innerText = d.data.title;
    titleTextRef.current = d.data.title; // assignment fires no input event
    // Only a body that actually differs is written back — an untouched body
    // stays untouched, which keeps BodyEditor's dirty-tracking contract: a
    // metadata-only recovery still sends no `content` on the next save.
    const body = bodyRef.current;
    if (body && d.data.body !== body.getHtml()) body.setHtml(d.data.body);
    setPubStatus(STATUS_OPTIONS.some((o) => o.value === d.data.status) ? (d.data.status as Status) : "Draft");
    setPassword(d.data.password);
    setPwOpen(d.data.password.trim().length > 0);
    setSticky(d.data.sticky);
    setChecked(Object.fromEntries(d.data.categories.map((id) => [id, true])));
    setTemplate(d.data.template);
    setTemplateTouched(d.data.templateTouched);
    setTags(d.data.tags);
    setFeaturedId(d.data.featuredId);
    setFeaturedThumb(d.data.featuredThumb);
    setExcerpt(d.data.excerpt);
    // A published article's slug is locked (live URLs never change here), so a
    // backed-up slug from before the publish must not reappear in the metabox.
    if (!everPublished) setSlug(d.data.slug);
    setSeoTitle(d.data.seo.title);
    setMetaDesc(d.data.seo.description);
    setFocusKw(d.data.seo.focus);
    // The store already holds exactly this — don't rewrite it on the next tick.
    lastBackupRef.current = JSON.stringify(d.data);
    setSaveMsg({ kind: "ok", text: "Backup restored — not saved to WordPress yet" });
  };

  const discardBackup = () => {
    clearDraft(backupKey);
    lastBackupRef.current = null;
    setPendingBackup(null);
  };

  // Refresh the guards' view of this render — same latest-through-a-ref
  // pattern as blocksRef in GutenbergEditor, for handlers wired up once below.
  useEffect(() => {
    guardRef.current = { snapshotData, flushBackup, isEditorDirty };
  });

  /** The exit guards + the backup heartbeat, wired once. What each path gets:
   *  tab close / refresh / external link → beforeunload warns AND pagehide
   *  writes; an in-app link click → confirm() in capture phase (beforeunload
   *  never fires on client-side navigation, which is exactly how work was
   *  being lost); browser back / programmatic pushes → can't be intercepted in
   *  the App Router, so the unmount flush persists instead of prompting; a
   *  crash → the 5s heartbeat had already written. The backup is the real
   *  safety net — the prompts are just courtesy. */
  useEffect(() => {
    const heartbeat = setInterval(() => guardRef.current?.flushBackup(), 5000);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const g = guardRef.current;
      if (!g) return;
      g.flushBackup();
      if (!g.isEditorDirty()) return;
      e.preventDefault();
      // Chrome still keys the prompt off returnValue; the text is ignored.
      e.returnValue = "";
    };
    const onPageHide = () => guardRef.current?.flushBackup();
    const onClickCapture = (e: MouseEvent) => {
      // Modified clicks open a new tab — this page, and its state, stay put.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!a) return;
      if (a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      if ((a.getAttribute("href") ?? "").startsWith("#")) return;
      const g = guardRef.current;
      if (!g || !g.isEditorDirty()) return;
      const kept = g.flushBackup();
      const msg = kept
        ? "This article has unsaved changes.\n\nA backup was kept on this device — you'll be offered it when you come back to this article. Leave anyway?"
        : "This article has unsaved changes that will be LOST — the earlier backup is still waiting for its Restore / Discard decision, so the new changes were not backed up.\n\nLeave anyway?";
      if (!window.confirm(msg)) {
        e.preventDefault();
        e.stopPropagation(); // before Link's own handler — the navigation never starts
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onClickCapture, true);
      // The unmount flush itself lives in registerBody's deregistration branch
      // — by this point the body handle is already gone (child cleanups run
      // first) and there is nothing left to read.
    };
  }, []);

  const selectedCount = Object.values(checked).filter(Boolean).length;
  /** The checked categories, in the tree's own order — shown under the title. */
  const selectedCategories = categories.filter((c) => checked[c.id]);

  /** Selection stays ANCESTOR-CLOSED (owner rule, 2026-08-18): a checked child
   *  always has its ancestors checked, because the site's landing pages and
   *  archive queries select by exact category id — a post only in the child
   *  can miss the parent's surfaces. Checking a child pulls its ancestors in;
   *  unchecking a parent drops its whole checked subtree ("not in this
   *  section at all"); unchecking a child leaves the parent alone (it may be
   *  there via a sibling, or on purpose). Old posts that already violate the
   *  rule are NOT rewritten on open — the rule engages only on a click. */
  const toggleCategory = (id: number) => {
    // Computed HERE rather than inside a setChecked updater: the template
    // suggestion is derived from the same result, and an updater that also
    // called setTemplate would be a side effect during React's render phase.
    // This runs in an event handler, so reading `checked` from the closure is
    // correct — and it keeps the auto-fill out of an effect, which the repo's
    // React-compiler lint forbids anyway.
    const next = { ...checked, [id]: !checked[id] };
    if (next[id]) {
      const parentOf = new Map(categories.map((c) => [c.id, c.parent]));
      for (let p = parentOf.get(id) ?? 0; p > 0; p = parentOf.get(p) ?? 0) next[p] = true;
    } else {
      const drop = (pid: number) => {
        for (const c of categories) {
          if (c.parent === pid && next[c.id]) {
            next[c.id] = false;
            drop(c.id);
          }
        }
      };
      drop(id);
    }
    setChecked(next);

    if (!templateTouched) {
      setTemplate(suggestTemplate(Object.keys(next).filter((k) => next[Number(k)]).map(Number), categories));
    }
  };

  /**
   * Where "Preview in new tab" goes: the article's page on the LIVE WordPress
   * site (owner's call, 2026-08-19 — editors should land on the site the
   * public reads, not this frontend). The URL is WordPress's own `link`,
   * never derived here: its category path follows WP's own rules and this
   * site has custom permalink overrides. When that link is missing the
   * control hides rather than guess a URL — same as for a brand-new post,
   * which has no page anywhere yet. Judged against `savedStatus` (what WP
   * holds NOW), not the status the post loaded with, so the button follows
   * an in-session publish. Unpublished posts keep WordPress's own preview,
   * which needs a wp-admin session in the same browser (the owner has one).
   */
  const previewHref = isCreate || !post
    ? undefined
    : savedStatus === "Published"
      ? wpLink || undefined
      : `${process.env.NEXT_PUBLIC_WP_ORIGIN ?? "https://infotainment.ams.com.kh"}/?p=${post.id}&preview=true`;

  /**
   * ONE button, and it commits exactly the status the panel shows.
   *
   * There used to be two, and they contradicted the panel. The primary mapped
   * everything that wasn't Pending or Private to `Published`, so ticking
   * "Draft" and pressing it PUBLISHED the article — Draft was the one status
   * the radio could not commit. The only way to reach it was a permanent
   * "Save draft" secondary which, on a live article, quietly took it off the
   * site. Now the radio is the single source of truth and the button says what
   * saving will do to a post in THIS state, read against what WordPress holds.
   */
  const primaryLabel =
    pubStatus === "Pending"
      ? "Submit for review"
      : pubStatus === "Private"
        ? savedStatus === "Private"
          ? "Update"
          : "Make private"
        : pubStatus === "Draft"
          ? savedStatus === "Published"
            ? "Switch to draft"
            : "Save draft"
          : savedStatus === "Published"
            ? "Update"
            : "Publish";

  /** A selection the writer has made but not yet saved. The top bar shows it as
   *  an arrow off the pill; the panel shows it as a line under the row. */
  const statusChanged = savedStatus !== null && pubStatus !== savedStatus;

  /** Saving would take a LIVE article off the public site — draft, pending and
   *  private all do. Nothing is destroyed, but the page and every listing it
   *  appears in go away, so it gets a confirm step rather than one click. */
  const takesOffline = savedStatus === "Published" && pubStatus !== "Published";

  const filteredCats = catSearch.trim()
    ? categories.filter((c) => c.name.includes(catSearch.trim()))
    : null;

  const checkedIds = Object.keys(checked).filter((k) => checked[Number(k)]).map(Number);

  /** Menu rows: WordPress's own "Default template" first, then the theme's.
   *  A value the theme no longer offers is appended rather than dropped — a
   *  renamed or deleted template must stay VISIBLE, because silently rendering
   *  it as "Default template" would make the control lie about the post. */
  const templateSuggestion = suggestTemplate(checkedIds, categories);
  const templateOptions = [
    { label: "Default template", value: "" },
    ...templates.map((t) => ({ label: t.name, value: t.file })),
    ...(template && !templates.some((t) => t.file === template)
      ? [{ label: `${template} (not in this theme)`, value: template }]
      : []),
  ];
  const templateLabel = templateOptions.find((o) => o.value === template)?.label ?? "Default template";

  /** Saves at the SELECTED status. Returns whether it landed, so the confirm
   *  dialog can stay open on failure. */
  async function save(): Promise<boolean> {
    const status = toWpStatus(pubStatus);
    const payload: EditorPayload = {
      title: (titleRef.current?.innerText ?? "").trim(),
      excerpt: excerpt.trim(),
      status,
      // Only while never-published, and only when non-empty — blank means
      // "let WordPress generate one", and sending "" would ask WP to do the
      // same anyway, minus the intent being visible here.
      ...(everPublished || !slug.trim() ? {} : { slug: slug.trim() }),
      categories: Object.entries(checked).filter(([, v]) => v).map(([id]) => Number(id)),
      // For scoped cache revalidation on publish (see refreshPublic).
      categorySlugs: categories.filter((c) => checked[c.id]).map((c) => c.slug),
      tags: tags.map((t) => t.id),
      featuredMedia: featuredId,
      // A private post cannot also be password-protected in WordPress, so the
      // password is dropped rather than sent alongside — sending both makes
      // WordPress silently keep one and the screen would then be lying.
      password: pubStatus === "Private" ? "" : password.trim(),
      // MEASURED, not assumed: WordPress REJECTS the whole write with
      // `rest_invalid_field` ("A post can not be sticky and have a password")
      // when both are set — a 400 that loses every other edit in the payload.
      // The checkbox is disabled in that state; this is the belt to its braces.
      sticky: passwordProtected ? false : sticky,
      template,
      seo: { title: seoTitle, description: metaDesc, focus: focusKw },
    };
    // Only a body the user actually edited is sent — an untouched (Gutenberg)
    // body must never round-trip through the editor's HTML serializer.
    if (bodyRef.current?.isDirty()) payload.content = bodyRef.current.getHtml();

    if (!payload.title) {
      setSaveMsg({ kind: "err", text: "Give the article a title first." });
      return false;
    }

    // BLOCK a publish without a slug (owner's call, 2026-08-12): left to
    // WordPress, the URL would be minted from the Khmer title as a giant
    // percent-encoded string — and a live URL is permanent here. Drafts and
    // review submissions pass freely: no URL exists yet to get wrong.
    if ((status === "publish" || status === "private") && !slug.trim()) {
      showToast("Add an English slug before publishing — it becomes the article's permanent URL. The Slug field is in the SEO panel under the article.");
      const el = document.getElementById("seo-slug");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return false;
    }

    setSaving(true);
    setSaveMsg(null);
    const res = isCreate ? await createPostAction(payload) : await savePostAction(post!.id, payload);
    setSaving(false);

    if (!res.ok) {
      setSaveMsg({ kind: "err", text: res.error ?? "Save failed." });
      return false;
    }
    // Everything the local backup holds just reached WordPress — drop it,
    // close the banner if one was still up (the writer saved their own work
    // over it), and re-arm the guard. Baseline goes null FIRST: it gates
    // every backup write, so the deregistration flush after a create's
    // router.push below cannot resurrect the backup this just cleared. The
    // recapture waits a tick, for the state React is about to commit.
    clearDraft(backupKey);
    lastBackupRef.current = null;
    baselineRef.current = null;
    setPendingBackup(null);
    setTimeout(() => {
      const data = guardRef.current?.snapshotData();
      if (data) baselineRef.current = JSON.stringify(data);
    }, 0);
    // WordPress echoes the status it actually stored — trust that over the
    // intent, and move BOTH values onto it so the pill and the panel agree.
    const stored = res.status ? fromWpStatus(res.status) : pubStatus;
    setPubStatus(stored);
    setSavedStatus(stored);
    // WordPress echoes the slug it actually stored (sanitized, deduped) — show
    // that, not what was typed. Publishing locks the field from here on.
    if (res.slug) setSlug(res.slug);
    // The permalink WordPress computed for what it just stored — on a publish,
    // the article's final live URL. This is what lets the preview button work
    // right after publishing, without anyone reloading the editor.
    if (res.link) setWpLink(res.link);
    if (res.status === "publish") setEverPublished(true);
    setSaveMsg({ kind: "ok", text: "Saved" });
    // The WP site serves this article's pages from its own cache, and our
    // writes deliberately skip its purge hooks (that skip is the fast save).
    // So when this save changed anything the OLD site shows — it's published
    // now, or it was published before (an update, an unpublish, going
    // private) — kick off the background purge+re-warm. `everPublished` here
    // is the pre-save value: a never-published draft skips this entirely.
    const legacyId = post?.id ?? res.id;
    if (legacyId && (res.status === "publish" || everPublished)) startLegacyRefresh(legacyId);
    if (isCreate && res.id) router.push(`/admin/articles/${res.id}`);
    return true;
  }

  /** The one save button. Everything except taking a live article down commits
   *  straight away; that one asks first. */
  const onPrimary = () => {
    if (!takesOffline) {
      void save();
      return;
    }
    setSaveMsg(null); // the dialog reports its own failure — not the last one
    setConfirmOffline(true);
  };

  /** The confirmed take-it-offline save. The dialog stays up while the write
   *  runs and keeps a failure in place — same contract as the trash flow. */
  const applyOffline = async () => {
    if (await save()) setConfirmOffline(false);
  };

  /* ---- The `Post` tab ---------------------------------------------------
     Hairline-divided sections on the sidebar's own surface, NOT a stack of
     cards: the sidebar is already a bordered surface, so cards inside it would
     be boxes in a box. Every collapsed header carries its own count, which is
     the point of collapsing them — you can see that there are 3 categories and
     no excerpt without opening anything. */
  const postPanel = (
    <div className={css({ paddingBottom: "32px" })}>
      {/* FEATURED IMAGE, first and headerless — wp-admin's summary panel opens
          with the picture rather than a row that says a picture exists. It has
          no fold of its own on purpose: a collapsed "Featured image ✓" is
          strictly less information than the thumbnail it would be hiding, and
          it is the one thing on this tab you check at a glance. */}
      <div className={css({ padding: "14px 16px 16px" })}>
        {featuredThumb ? (
          <>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={css({ display: "block", width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", position: "relative", borderRadius: "8px", overflow: "hidden", "&:hover [data-cover-hint]": { opacity: 1 } })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-only preview; next/image would need remotePatterns for the S3 host */}
              <img
                src={featuredThumb}
                alt=""
                className={css({ width: "100%", display: "block" })}
                style={{ aspectRatio: "16 / 9", objectFit: "cover", background: ac.surfaceSunken }}
              />
              <span data-cover-hint className={css({ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12.5px", fontWeight: 600, color: "#fff", opacity: 0, transition: "opacity .15s" })} style={{ background: ac.overlay }}>
                Replace
              </span>
            </button>
            <div className={css({ display: "flex", alignItems: "center", gap: "12px", marginTop: "9px" })}>
              <button type="button" onClick={() => setPickerOpen(true)} className={linkBtn} style={{ color: ac.accentText }}>
                Replace
              </button>
              {/* There was NO way to clear a featured image before — the cover
                  could only ever be swapped, so an article that should run
                  without one had to be fixed in wp-admin. */}
              <button
                type="button"
                onClick={() => {
                  setFeaturedId(0);
                  setFeaturedThumb("");
                }}
                className={linkBtn}
                style={{ color: ac.muted }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={css({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "7px", width: "100%", paddingY: "24px", borderRadius: "8px", cursor: "pointer", background: "transparent", transition: "border-color .12s, color .12s", _hover: { borderColor: ac.borderStrong, color: ac.text } })}
            style={{ border: `1.5px dashed ${ac.borderStrong}`, color: ac.faint }}
          >
            <Icon name="media" size={17} strokeWidth={1.7} />
            <span className={css({ fontSize: "12.5px" })}>Set a featured image</span>
          </button>
        )}
      </div>

      {/* Publish — wp-admin's own anatomy, per the owner's screenshot: one
          Status summary row (label left, value as a link), with the CONTROLS
          behind a "Status & visibility" popover instead of living inline. The
          inline version spent ~200px of the rail on a password field and a
          sticky checkbox that almost never change; the row says it at a
          glance and the popover holds the rest one click away. */}
      <div className={css({ position: "relative", padding: "8px 16px 12px" })} style={{ borderTop: `1px solid ${ac.rowLine}` }}>
        {/* ONE row, as wp-admin has: a separate Visibility row read out the
            same popover and listed near-identical values — Private appeared in
            both — which read as two settings when it is one. The password state
            still shows here, appended, so protection is never invisible. */}
        <SummaryRow
          label="Status"
          value={
            (pubStatus === "Pending" ? "Pending review" : pubStatus) +
            (passwordProtected ? " · password protected" : "")
          }
          expanded={statusOpen}
          onClick={() => setStatusOpen((v) => !v)}
        />

        {/* The panel states the intent, the top bar commits it — and they are
            most of a screen apart. This line is what connects them. */}
        {statusChanged ? (
          <p className={cx(noteText, css({ margin: "2px 4px 0" }))} style={{ color: ac.muted }}>
            Not saved yet — press <strong style={{ color: ac.text, fontWeight: 600 }}>{primaryLabel}</strong> to apply it.
          </p>
        ) : null}

        {/* TEMPLATE — which theme layout renders the article's TAIL on the
            WordPress site ("Default template" renders nothing below the body).
            A summary row beside Status rather than a section of its own (owner,
            2026-08-24): it is one value, it is auto-filled from the categories,
            and a fold with a single control in it is a fold that is always
            either noise or in the way. */}
        <div className={cx(rowBetween, css({ gap: "14px" }))} style={{ minHeight: 32 }}>
          <span className={metaLabel} style={{ color: ac.muted, flex: "none" }}>Template</span>
          <Dropdown
            variant="link"
            label={shortTemplateName(templateLabel)}
            hasValue={template !== ""}
            open={tplOpen}
            onToggle={() => setTplOpen((o) => !o)}
            onClose={() => setTplOpen(false)}
            options={templateOptions}
            selected={template}
            onSelect={(v) => {
              setTemplate(v);
              // Picking the value the categories already suggest is AGREEMENT,
              // not an override — auto-fill stays live so a later category
              // change still moves it. Anything else takes the field over.
              setTemplateTouched(v !== templateSuggestion);
              setTplOpen(false);
            }}
            minWidth={248}
            align="right"
            className={css({ minWidth: 0 })}
          />
        </div>

        {statusOpen ? (
          <>
            {/* Outside-click anatomy borrowed from Dropdown: an invisible fixed
                backdrop, so nothing runs in an effect. */}
            <div onClick={() => setStatusOpen(false)} className={css({ position: "fixed", inset: 0, zIndex: 25 })} />
            <div
              role="dialog"
              aria-label="Status & visibility"
              className={css({ position: "absolute", top: "42px", left: "12px", right: "12px", zIndex: 30, borderRadius: "12px", padding: "12px 8px 10px" })}
              style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}
            >
              <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 6px 8px" })}>
                <span className={css({ fontSize: "13px", fontWeight: 600 })}>Status &amp; visibility</span>
                <button
                  type="button"
                  onClick={() => setStatusOpen(false)}
                  aria-label="Close"
                  className={css({ width: "24px", height: "24px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", flex: "none", _hover: { background: ac.surfaceHover } })}
                  style={{ color: ac.muted }}
                >
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              </div>

              {/* Choosing a status keeps the popover open, as wp-admin does —
                  the checkboxes below react to the choice, and closing on every
                  click would hide that reaction. */}
              {STATUS_OPTIONS.map((o) => (
                <RadioRow key={o.value} title={o.title} desc={o.desc} checked={pubStatus === o.value} onSelect={() => setPubStatus(o.value)} />
              ))}

              {/* NO "Scheduled". WordPress has `future`, this server cannot
                  honour it: the site's loopback is broken, so WP-Cron never
                  fires and a scheduled post stays scheduled forever. */}
              <p className={cx(noteText, css({ padding: "4px 8px 2px" }))} style={{ color: ac.faint }}>
                No &ldquo;Scheduled&rdquo; option — this server&rsquo;s cron is broken, so a scheduled post would never publish.
              </p>

              <div className={css({ height: "1px", marginY: "8px" })} style={{ background: ac.rowLine }} />

              <CheckRow
                title="Password protected"
                desc="Only visible to those who know the password. A private post cannot carry one."
                checked={pwOpen && pubStatus !== "Private"}
                disabled={pubStatus === "Private"}
                onChange={(v) => {
                  setPwOpen(v);
                  if (!v) setPassword("");
                }}
              />
              {pwOpen && pubStatus !== "Private" ? (
                <div className={css({ padding: "2px 8px 8px 34px" })}>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter a password…" />
                </div>
              ) : null}

              <CheckRow
                title="Sticky"
                desc="Stick to the top of WordPress's own archives."
                checked={sticky && !passwordProtected}
                disabled={passwordProtected}
                onChange={setSticky}
              />
              {passwordProtected && sticky ? (
                // WordPress refuses the pair outright (rest_invalid_field), and
                // a rejected write loses every other edit in the same save — so
                // say it here rather than let the save 400.
                <p className={cx(noteText, css({ padding: "0 8px 6px 34px" }))} style={{ color: ac.faint }}>
                  WordPress won&rsquo;t allow a sticky post to have a password — sticky is off while one is set.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <Section
        title="Categories"
        badge={<Count n={selectedCount} />}
        open={openSections.categories}
        onToggle={() => toggleSection("categories")}
      >
        <div className={css({ position: "relative", marginBottom: "10px" })}>
          <Icon name="search" size={13} style={{ position: "absolute", left: 12, top: 11, color: ac.faint, pointerEvents: "none" }} />
          <Input
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
            placeholder={`Filter ${categories.length} categories…`}
            // Inline, not a class: `controlBase` sets the `padding` shorthand,
            // and which of two atomic rules wins is Panda's sort order, not
            // ours. An inline style is simply not in that argument.
            style={{ paddingLeft: 34 }}
          />
        </div>

        {/* The old two-column grid does not survive a 320px column, and does not
            need to: the filter is what makes a few dozen categories navigable,
            not seeing them all at once. Indent still carries depth. */}
        <div className={css({ maxHeight: "264px", overflowY: "auto", marginX: "-6px", paddingX: "6px" })}>
          {filteredCats && filteredCats.length === 0 ? (
            <div className={css({ fontSize: "12.5px", padding: "8px 2px" })} style={{ color: ac.muted }}>
              No categories match “{catSearch}”.
            </div>
          ) : (
            (filteredCats ?? categories).map((c) => (
              <CatRow
                key={c.id}
                c={c}
                // A filtered list is not a tree — indenting a child whose parent
                // was filtered out points at nothing.
                indent={!filteredCats}
                checked={!!checked[c.id]}
                onToggle={() => toggleCategory(c.id)}
              />
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => setCatDialogOpen(true)}
          className={linkBtn}
          style={{ color: ac.accentText, marginTop: "10px" }}
        >
          Show all {categories.length} categories
        </button>
      </Section>

      <Section
        title="Tags"
        badge={<Count n={tags.length} />}
        open={openSections.tags}
        onToggle={() => toggleSection("tags")}
      >
        <TagsEditor tags={tags} onChange={setTags} />
      </Section>

      <Section
        title="Excerpt"
        badge={<Counter len={excerpt.length} max={160} />}
        open={openSections.excerpt}
        onToggle={() => toggleSection("excerpt")}
      >
        <Textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={4}
          placeholder="A sentence or two…"
        />
        <p className={css({ fontSize: "11.5px", lineHeight: 1.6, marginTop: "8px" })} style={{ color: ac.faint }}>
          Shown on listing cards, and used as the search-result description when the SEO panel under the article has none. Leave it blank and WordPress cuts the first ~55 words of the body, usually mid-sentence.
        </p>
      </Section>

      {/* SEO moved OUT of this rail: the Yoast-style metabox now sits under the
          document, where wp-admin puts it and where the editors look for it.
          Same three fields, same payload — only the address changed. */}
    </div>
  );

  return (
    <div className={css({ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 })}>
      {/* ---- Top bar --------------------------------------------------- */}
      <div
        className={css({ display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", height: "56px", flex: "none", position: "sticky", top: 0, zIndex: 30 })}
        style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}
      >
        <Link href="/admin/articles" className={css({ width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", _hover: { background: ac.surfaceHover } })} style={{ color: ac.muted }}>
          <Icon name="back" size={16} strokeWidth={1.8} />
        </Link>
        {/* The pill is the SAVED status — the truth about the public site. An
            unsaved selection shows as an arrow beside it, never by rewriting
            the pill, which is what made it lie about live articles. */}
        <StatusPill status={savedStatus ?? pubStatus} />
        {statusChanged ? (
          <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap", flex: "none" })} style={{ color: ac.muted }}>
            &rarr; {statusWord(pubStatus)}
          </span>
        ) : null}
        <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap" })} style={{ color: saveMsg?.kind === "err" ? ac.danger : ac.faint }}>
          {saving
            ? "Saving…"
            : saveMsg
              ? saveMsg.text
              : !editorReady
                ? "Preparing the editor…"
                : isCreate
                  ? "New article · not saved yet"
                  : "Loaded"}
        </span>
        <LegacySiteChip postId={post?.id} />

        {/* The Write / Settings segmented control used to live here. Both are
            on screen at once now, so there is nothing to switch between. */}
        <div className={css({ flex: 1 })} />

        {/* ONE button — see `primaryLabel`. The "Save draft" secondary that
            stood here is gone: it duplicated a status the panel already owns
            and, on a published article, unpublished it without saying so. */}
        <button
          type="button"
          disabled={saving}
          onClick={onPrimary}
          className={css({ height: "34px", padding: "0 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", flex: "none", whiteSpace: "nowrap", transition: "background .12s", _hover: { background: ac.accentHover } })}
          style={{ background: ac.accent, opacity: saving ? 0.7 : 1 }}
        >
          {primaryLabel}
        </button>
      </div>

      {/* The local-backup banner — a backup of unsaved changes from an earlier
          visit is waiting for a decision. A BANNER, not a toast: it must stay
          up until Restore or Discard is pressed, because the heartbeat holds
          all backup writes while the decision is open (writing would destroy
          the recoverable work) — so it cannot be dismissible into limbo.
          Gated on editorReady: Restore needs the body handle to exist. */}
      {pendingBackup && editorReady ? (
        <div
          role="status"
          className={css({ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 12px", padding: "10px 20px", fontSize: "13px", lineHeight: 1.5 })}
          style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}`, borderLeft: `3px solid ${ac.warn}`, color: ac.text }}
        >
          <Icon name="clock" size={15} strokeWidth={1.9} style={{ color: ac.warn, flex: "none" }} />
          <span>
            Unsaved changes from{" "}
            <strong style={{ fontWeight: 600 }}>{agoLabel(pendingBackup.at)}</strong> were backed up on
            this device — that work never reached WordPress.
          </span>
          <div className={css({ display: "flex", gap: "8px", marginLeft: "auto", flex: "none" })}>
            <Button size="sm" variant="primary" onClick={restoreBackup}>
              Restore backup
            </Button>
            <Button size="sm" variant="ghost" onClick={discardBackup}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {/* The media dialog is `position: fixed`, so it is rendered HERE rather
          than inside the sidebar section that opens it — a modal owned by a
          320px column with its own `overflow-y: auto` is one stacking-context
          change away from being clipped by it. */}
      {/* Same fixed-position reasoning as MediaPicker below: modals render at
          this level, never inside the scrolling sidebar column that opens them. */}
      {catDialogOpen ? (
        <CategoriesDialog
          categories={categories}
          checked={checked}
          onToggle={toggleCategory}
          onClose={() => setCatDialogOpen(false)}
        />
      ) : null}

      {/* The blocking-warning snackbar. role="alert" so it is announced. */}
      {toast ? (
        <div
          role="alert"
          className={css({ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 1000060, display: "flex", alignItems: "center", gap: "12px", maxWidth: "520px", padding: "12px 14px 12px 16px", borderRadius: "10px", fontSize: "13px", lineHeight: 1.5 })}
          style={{ background: ac.surface, border: `1px solid ${ac.border}`, borderLeft: `3px solid ${ac.warn}`, boxShadow: ac.shadowMd, color: ac.text }}
        >
          {toast}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className={css({ width: "24px", height: "24px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", flex: "none", _hover: { background: ac.surfaceHover } })}
            style={{ color: ac.muted }}
          >
            <Icon name="x" size={12} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      {/* Going Published -> anything else. Rendered here with the other
          overlays, not in the sidebar that set the status. */}
      {confirmOffline ? (
        <ConfirmDialog
          title={pubStatus === "Private" ? "Make this live article private?" : "Take this article off the site?"}
          confirmLabel={primaryLabel}
          busyLabel="Saving…"
          busy={saving}
          error={saveMsg?.kind === "err" ? saveMsg.text : null}
          onConfirm={() => void applyOffline()}
          onCancel={() => setConfirmOffline(false)}
        >
          This article is published. Saving it as{" "}
          <strong style={{ color: ac.text, fontWeight: 600 }}>{statusWord(pubStatus).toLowerCase()}</strong> takes the
          public page down and drops it out of every listing it appears in. Nothing is deleted &mdash; publishing it
          again restores it at the same URL.
        </ConfirmDialog>
      ) : null}

      {pickerOpen ? (
        <MediaPicker
          title="Featured image"
          onClose={() => setPickerOpen(false)}
          onPick={(m) => {
            setFeaturedId(m.id);
            // `m.thumb` is the picker GRID's image — 150px on this library, and
            // visibly mushy even in the sidebar's own preview. `m.url` is the
            // full source; CSS caps how big it is ever drawn.
            setFeaturedThumb(m.url || m.thumb);
            setPickerOpen(false);
          }}
        />
      ) : null}

      {/* ---- The one screen -------------------------------------------
          The editor owns the layout: band across the top, canvas in the middle,
          the block library docked left and the settings sidebar docked right.
          The document's own chrome — the title and its category readout — is
          handed to it as a slot, and so is the `Post` tab. They still live
          here, and save() still reads them; only where they render changed. */}
      <GutenbergEditor
        initialContent={isCreate ? "" : post?.bodyRaw ?? ""}
        register={registerBody}
        previewHref={previewHref}
        sidebar={postPanel}
        belowDocument={
          // wp-admin's anatomy: the Yoast metabox under the post. Controlled by
          // this editor's own SEO state — Save/Publish above carries the fields,
          // so the metabox brings no save button of its own.
          <YoastMetabox
            focusKw={focusKw}
            onFocusKwChange={setFocusKw}
            seoTitle={seoTitle}
            onSeoTitleChange={setSeoTitle}
            metaDesc={metaDesc}
            onMetaDescChange={setMetaDesc}
            headline={post?.title ?? ""}
            slug={slug}
            onSlugChange={everPublished ? undefined : setSlug}
            excerpt={excerpt}
            featuredThumb={featuredThumb}
            date={post?.date ?? ""}
          />
        }
        header={
          <>
            {/* Title (editable) — seeded once by attachTitle, read on save.
                React manages no children here, so re-renders can't touch it. */}
            <div
              ref={attachTitle}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Article title"
              // Focus fill is SUNKEN, not `surface`: the title sits on the
              // document sheet, which is #FFFFFF in light mode — so a white
              // fill was a no-op there and the focus state lost half its
              // signal. Sunken reads as a recessed field on both sheets.
              // No top margin: the cover moved to the sidebar, so the headline
              // is the first thing on the page and the sheet's own 32px padding
              // is the whole of the top rhythm. Any margin here stacks on that.
              className={cx(editablePlaceholder, css({ fontSize: "32px", fontWeight: 600, lineHeight: 1.55, letterSpacing: "-0.01em", padding: "6px 12px", marginX: "-12px", borderRadius: "8px", cursor: "text", _focus: { outline: "none", background: ac.surfaceSunken, boxShadow: `inset 0 0 0 1px ${ac.border}` } }))}
            />

            {/* The article's categories, as a readout. Editing them is the
                sidebar's job — this says what the article is filed under while
                you write, without spending a tab switch to find out. Renders
                nothing at all when there are none. */}
            {selectedCategories.length > 0 ? (
              <div className={css({ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "20px", marginBottom: "18px" })}>
                {selectedCategories.map((c) => (
                  <span
                    key={c.id}
                    className={css({ fontSize: "11.5px", fontWeight: 600, padding: "3px 9px", borderRadius: "99px", whiteSpace: "nowrap" })}
                    style={{ color: ac.muted, background: ac.canvas, border: `1px solid ${ac.border}` }}
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className={css({ marginTop: "20px", marginBottom: "18px" })} />
            )}
          </>
        }
      />
    </div>
  );
}

// --- sidebar sections --------------------------------------------------------

/** One folding section of the `Post` tab. The divider is drawn on TOP of each
 *  section rather than around it, so the strip reads as one panel with rules in
 *  it and no rule ever lands on the sidebar's own edge. */
function Section({
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ borderTop: `1px solid ${ac.rowLine}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={css({ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "13px 16px", cursor: "pointer", border: "none", background: "transparent", fontSize: "13px", fontWeight: 600, textAlign: "left", _hover: { background: ac.surfaceHover } })}
      >
        <Icon
          name="chevronRight"
          size={12}
          strokeWidth={2.2}
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: ac.muted, flex: "none" }}
        />
        <span className={css({ flex: 1 })}>{title}</span>
        {badge}
      </button>
      {open ? <div className={css({ padding: "0 16px 18px" })}>{children}</div> : null}
    </div>
  );
}

/** Template display names all end in "-Article Block", which is 14 characters of
 *  noise in a 320px rail where every one of them carries it. Dropped for the
 *  header badge and the closed trigger; the full name stays in the menu and in
 *  the title attribute. */
function shortTemplateName(name: string): string {
  return name.replace(/\s*-\s*Article Block$/i, "").trim() || name;
}

/** A selected-items count for a section header. Teal when there is something to
 *  count, faint when there is not — colour informs, it does not decorate. */
function Count({ n }: { n: number }) {
  return (
    <span className={css({ fontSize: "11.5px", fontVariantNumeric: "tabular-nums" })} style={{ color: n ? ac.data : ac.faint }}>
      {n}
    </span>
  );
}

// --- tags ------------------------------------------------------------------

// Typeahead over the ~5.5k post tags: debounced server search (most-used
// first), chips for the selected set, and create-on-demand for a name with no
// match. Only the selected ids leave this component — the save payload sends
// term ids, never names.
//
// It renders bare, with no card or heading of its own: the sidebar Section that
// wraps it supplies both, and carries the count in its header.
function TagsEditor({ tags, onChange }: { tags: TagOption[]; onChange: (t: TagOption[]) => void }) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<TagOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = input.trim();
  const has = (id: number) => tags.some((t) => t.id === id);

  // State updates only inside the timer callback, never synchronously in the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      if (!q) {
        setOptions([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      // Degrade to "no suggestions" if the action itself throws.
      const found = await searchTags(q).catch(() => []);
      if (stale) return;
      setOptions(found);
      setSearching(false);
    }, q ? 300 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const add = (t: TagOption) => {
    if (!has(t.id)) onChange([...tags, t]);
    setInput("");
    setOptions([]);
  };

  const createAndAdd = async () => {
    if (!q || creating) return;
    setCreating(true);
    setError(null);
    const res = await createTag(q);
    setCreating(false);
    if (!res.ok || !res.id) {
      // WP answers "term exists" for an exact duplicate — surface whatever it said.
      setError(res.error ?? "Couldn't create the tag.");
      return;
    }
    add({ id: res.id, name: q });
  };

  const exactMatch = options.find((o) => o.name.toLowerCase() === q.toLowerCase());

  return (
    <>
      {tags.length ? (
        <div className={css({ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" })}>
          {tags.map((t) => (
            <span key={t.id} className={css({ height: "26px", padding: "0 5px 0 10px", display: "flex", alignItems: "center", gap: "5px", borderRadius: "99px", fontSize: "12px", maxWidth: "100%" })} style={{ background: ac.surfaceSunken, color: ac.text }}>
              <span className={css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{t.name}</span>
              <button type="button" onClick={() => onChange(tags.filter((x) => x.id !== t.id))} aria-label={`Remove tag ${t.name}`} className={css({ width: "16px", height: "16px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", flex: "none", _hover: { background: ac.border } })} style={{ color: ac.muted }}>
                <Icon name="x" size={9} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={css({ position: "relative" })}>
        <Icon name="search" size={13} style={{ position: "absolute", left: 12, top: 11, color: ac.faint, pointerEvents: "none" }} />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (exactMatch) add(exactMatch);
            else void createAndAdd();
          }}
          placeholder="Search, or type a new one…"
          style={{ paddingLeft: 34 }}
        />

        {q ? (
          // 200px, not 260: this menu is absolutely positioned inside the
          // sidebar's own scroller, so anything taller than the space below it
          // has to be scrolled to twice — once for the sidebar, once for the
          // menu.
          <div className={css({ position: "absolute", top: "40px", left: 0, right: 0, zIndex: 20, borderRadius: "10px", overflow: "hidden", maxHeight: "200px", overflowY: "auto" })} style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}>
            {options
              .filter((o) => !has(o.id))
              .map((o) => (
                <button key={o.id} type="button" onClick={() => add(o)} className={css({ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: "13px", cursor: "pointer", border: "none", background: "transparent", _hover: { background: ac.surfaceHover } })}>
                  {o.name}
                </button>
              ))}
            {!exactMatch ? (
              <button type="button" disabled={creating} onClick={() => void createAndAdd()} className={css({ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: "13px", cursor: "pointer", border: "none", background: "transparent", fontWeight: 600, _hover: { background: ac.surfaceHover } })} style={{ color: ac.accentText, borderTop: options.length ? `1px solid ${ac.rowLine}` : "none" }}>
                {creating ? "Creating…" : `Create “${q}”`}
              </button>
            ) : null}
            {searching && options.length === 0 ? (
              <div className={css({ padding: "8px 12px", fontSize: "12.5px" })} style={{ color: ac.faint }}>Searching…</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className={css({ fontSize: "12.5px", marginTop: "10px" })} style={{ color: ac.danger }}>{error}</p>
      ) : null}
    </>
  );
}

// --- categories dialog ------------------------------------------------------

/** Every category at once — the rail's list shows five at a time, so "find the
 *  right category" there is a scroll hunt. Same CatRow, same `checked` state,
 *  so a tick here IS a tick in the sidebar. MediaPicker's modal anatomy
 *  (overlay above the editor band, click-outside closes, panel clicks stay
 *  inside).
 *
 *  Each parent WITH children gets a block of its own — parent as the block's
 *  header, children inside — on the owner's call: one flowing multi-column
 *  tree read as a wall of names, and where a family broke across columns its
 *  structure vanished. Childless roots share one block at the end. */
function CategoriesDialog({
  categories,
  checked,
  onToggle,
  onClose,
}: {
  categories: CategoryNode[];
  checked: Record<number, boolean>;
  onToggle: (id: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? categories.filter((c) => c.name.includes(q.trim())) : null;
  const selectedCount = categories.filter((c) => checked[c.id]).length;

  // The flat, ordered tree regrouped into families: a block per root that has
  // descendants, and the childless roots pooled into one trailing block.
  const groups: { parent: CategoryNode; children: CategoryNode[] }[] = [];
  for (const c of categories) {
    if (c.depth === 0) groups.push({ parent: c, children: [] });
    else groups[groups.length - 1]?.children.push(c);
  }
  const standalone = groups.filter((g) => g.children.length === 0).map((g) => g.parent);
  // Busiest family first (owner request: ព្រឹត្តិការណ៍ before បទយកការណ៍) —
  // ranked by the family's total post count rather than a pinned name, so the
  // order follows real usage instead of the Khmer alphabet.
  const familyCount = (g: { parent: CategoryNode; children: CategoryNode[] }) =>
    g.parent.count + g.children.reduce((sum, c) => sum + c.count, 0);
  const families = groups.filter((g) => g.children.length > 0).sort((a, b) => familyCount(b) - familyCount(a));

  return (
    <div
      className={css({ position: "fixed", inset: 0, zIndex: 1000050, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" })}
      style={{ background: ac.overlay }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="All categories"
        onClick={(e) => e.stopPropagation()}
        className={css({ width: "min(780px, 100%)", maxHeight: "min(620px, 100%)", display: "flex", flexDirection: "column", borderRadius: "14px", overflow: "hidden" })}
        style={{ background: ac.surface, border: `1px solid ${ac.border}`, boxShadow: ac.shadowMd }}
      >
        <div className={css({ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", flex: "none" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
          <span className={css({ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" })}>All categories</span>
          <div className={css({ position: "relative", flex: 1, maxWidth: "300px" })}>
            <Icon name="search" size={13} style={{ position: "absolute", left: 12, top: 11, color: ac.faint, pointerEvents: "none" }} />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" style={{ paddingLeft: 34 }} />
          </div>
          <div className={css({ flex: 1 })} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={css({ width: "28px", height: "28px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", flex: "none", _hover: { background: ac.surfaceHover } })}
            style={{ color: ac.muted }}
          >
            <Icon name="x" size={14} strokeWidth={2.2} />
          </button>
        </div>

        <div className={css({ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px" })}>
          {filtered ? (
            // A filtered list is matches, not families — flat rows, like the rail.
            filtered.length === 0 ? (
              <div className={css({ fontSize: "13px", padding: "24px 0", textAlign: "center" })} style={{ color: ac.muted }}>
                No categories match “{q}”.
              </div>
            ) : (
              <div className={css({ maxWidth: "340px" })}>
                {filtered.map((c) => (
                  <CatRow key={c.id} c={c} indent={false} checked={!!checked[c.id]} onToggle={() => onToggle(c.id)} />
                ))}
              </div>
            )
          ) : (
            // CSS columns rather than a grid: blocks vary in height, and
            // columns pack them without the grid's row-height ties. Each block
            // is atomic (breakInside), so a family never splits mid-list.
            <div className={css({ columnWidth: "236px", columnGap: "14px" })}>
              {families.map((g) => (
                <CatBlock key={g.parent.id}>
                  <div className={css({ padding: "4px 6px" })} style={{ background: ac.surfaceSunken, borderBottom: `1px solid ${ac.rowLine}` }}>
                    <CatRow c={g.parent} indent={false} checked={!!checked[g.parent.id]} onToggle={() => onToggle(g.parent.id)} />
                  </div>
                  <div className={css({ padding: "5px 6px" })}>
                    {g.children.map((c) => (
                      // depth is re-based to the block: the parent is the
                      // header, so its children start at the block's left edge.
                      <CatRow key={c.id} c={{ ...c, depth: c.depth - 1 }} indent checked={!!checked[c.id]} onToggle={() => onToggle(c.id)} />
                    ))}
                  </div>
                </CatBlock>
              ))}
              {standalone.length ? (
                <CatBlock>
                  <div className={css({ fontSize: "11px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", padding: "8px 14px" })} style={{ color: ac.muted, background: ac.surfaceSunken, borderBottom: `1px solid ${ac.rowLine}` }}>
                    No subcategories
                  </div>
                  <div className={css({ padding: "5px 6px" })}>
                    {standalone.map((c) => (
                      <CatRow key={c.id} c={c} indent={false} checked={!!checked[c.id]} onToggle={() => onToggle(c.id)} />
                    ))}
                  </div>
                </CatBlock>
              ) : null}
            </div>
          )}
        </div>

        <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 18px", flex: "none" })} style={{ borderTop: `1px solid ${ac.border}`, background: ac.surfaceSunken }}>
          <span className={css({ fontSize: "12.5px" })} style={{ color: selectedCount ? ac.data : ac.muted }}>
            {selectedCount} selected
          </span>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

/** One family's bordered block in the dialog. Atomic in the column flow —
 *  `breakInside: avoid` is the whole reason the blocks read as families. */
function CatBlock({ children }: { children: ReactNode }) {
  return (
    <div
      className={css({ breakInside: "avoid", borderRadius: "10px", overflow: "hidden", marginBottom: "14px" })}
      style={{ border: `1px solid ${ac.border}` }}
    >
      {children}
    </div>
  );
}

// --- small pieces ----------------------------------------------------------

/** The Publish block's summary row: label left, the current value right as a
 *  link-style button that opens the Status & visibility popover — wp-admin's
 *  anatomy. */
function SummaryRow({ label, value, expanded, onClick }: { label: string; value: string; expanded: boolean; onClick: () => void }) {
  return (
    <div className={rowBetween} style={{ minHeight: 32 }}>
      <span className={metaLabel} style={{ color: ac.muted }}>{label}</span>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        className={css({ fontSize: "12.5px", fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", padding: "2px 0", _hover: { textDecoration: "underline" } })}
        style={{ color: ac.accentText }}
      >
        {value}
      </button>
    </div>
  );
}

const optionRow = css({ display: "flex", alignItems: "flex-start", gap: "10px", padding: "6px 8px", borderRadius: "8px" });
const optionRowHover = css({ cursor: "pointer", _hover: { background: ac.surfaceHover } });

/** The title + one-line description column the popover's rows share. */
function RowText({ title, desc }: { title: string; desc: string }) {
  return (
    <span className={css({ minWidth: 0 })}>
      <span className={css({ display: "block", fontSize: "12.5px", fontWeight: 500, lineHeight: 1.5 })}>{title}</span>
      <span className={css({ display: "block", fontSize: "11.5px", lineHeight: 1.5 })} style={{ color: ac.faint }}>{desc}</span>
    </span>
  );
}

/** A radio option in the Status & visibility popover. A real
 *  <input type="radio">, for the same reason Checkbox is a real checkbox —
 *  keyboard and group semantics come free. */
function RadioRow({ title, desc, checked, onSelect }: { title: string; desc: string; checked: boolean; onSelect: () => void }) {
  return (
    <label className={cx(optionRow, optionRowHover)}>
      <span className={css({ position: "relative", display: "inline-flex", flex: "none", marginTop: "1px" })}>
        <input
          type="radio"
          name="ams-post-status"
          checked={checked}
          onChange={onSelect}
          className={css({
            appearance: "none",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            cursor: "pointer",
            margin: 0,
            border: "1px solid var(--colors-admin-border-strong)",
            background: "var(--colors-admin-surface)",
            transition: "border-color .12s",
            _checked: { borderColor: "var(--colors-admin-accent)" },
            _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
          })}
        />
        {checked ? (
          <span className={css({ position: "absolute", left: "4px", top: "4px", width: "8px", height: "8px", borderRadius: "50%", pointerEvents: "none" })} style={{ background: ac.accent }} />
        ) : null}
      </span>
      <RowText title={title} desc={desc} />
    </label>
  );
}

/** A checkbox with the same title + description anatomy as RadioRow. */
function CheckRow({
  title,
  desc,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={cx(optionRow, disabled ? undefined : optionRowHover)} style={{ opacity: disabled ? 0.55 : 1 }}>
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} label={title} className={css({ marginTop: "1px" })} />
      <RowText title={title} desc={desc} />
    </label>
  );
}

function CatRow({ c, checked, onToggle, indent }: { c: CategoryNode; checked: boolean; onToggle: () => void; indent: boolean }) {
  return (
    <label
      className={css({ display: "flex", alignItems: "center", gap: "9px", padding: "5px 8px", borderRadius: "6px", cursor: "pointer", _hover: { background: ac.surfaceHover } })}
      style={{ paddingLeft: 8 + (indent ? c.depth * 14 : 0) }}
    >
      <Checkbox checked={checked} onChange={onToggle} label={c.name} />
      <span className={css({ fontSize: "13px", lineHeight: 1.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} style={{ fontWeight: c.depth === 0 ? 600 : 400 }}>{c.name}</span>
      <span className={css({ fontSize: "11px", fontVariantNumeric: "tabular-nums", marginLeft: "auto", paddingLeft: "6px" })} style={{ color: ac.faint }}>{c.count.toLocaleString("en-US")}</span>
    </label>
  );
}

function Counter({ len, max }: { len: number; max: number }) {
  const over = len > max;
  return (
    <span className={css({ fontSize: "11px", fontVariantNumeric: "tabular-nums" })} style={{ color: over ? ac.warn : ac.faint }}>
      {len} / {max}
    </span>
  );
}
