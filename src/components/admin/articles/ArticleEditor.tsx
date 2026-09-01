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
import { useQueryClient } from "@tanstack/react-query";
import { savePostAction, createPostAction, autosaveArticleAction, type EditorPayload } from "@/lib/admin/actions";
import { adminKeys } from "@/lib/admin/queries";
import { searchTags, type TagOption } from "@/lib/admin/editor-actions";
import { createTag } from "@/lib/admin/screen-actions";
import MediaPicker from "../MediaPicker";
import ConfirmDialog from "../ConfirmDialog";
import LegacySiteChip, { startLegacyRefresh } from "../LegacySiteChip";
import YoastMetabox from "../seo/YoastMetabox";
import { type BodyEditorHandle } from "./BodyEditor";
import EditorSkeleton from "./EditorSkeleton";

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
// AUTOSAVE — WordPress's own rule, on WordPress's own terms (2026-08-27,
// replacing a localStorage backup + Restore/Discard banner the writers could
// not read): a DRAFT is written to WordPress by itself — at most once a
// minute, always as a draft, the Status radio's intent never included; a
// LIVE article (and Pending / Private) is written only by the button, and
// leaving it with unsaved edits gets one plain confirm. A new article is
// created by its first autosave — once something is written, never on open —
// and edited in place from then on. Nothing is kept in the browser: after a
// crash the last minute of a draft is gone, and so is anything unsaved on a
// live article, which is exactly what wp-admin accepts.
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

type SaveKind = "manual" | "auto";

/** The editor as one comparable value — see snapshotData. */
interface EditorSnapshot {
  title: string;
  body: string;
  password: string;
  sticky: boolean;
  categories: number[];
  template: string;
  templateTouched: boolean;
  tags: TagOption[];
  featuredId: number;
  featuredThumb: string;
  excerpt: string;
  slug: string;
  seo: { title: string; description: string; focus: string };
}

/** wp-admin's AUTOSAVE_INTERVAL. Each write costs ~4s of WordPress time on
 *  this host, so this is a ceiling on writes, not a debounce on typing. */
const AUTOSAVE_INTERVAL_MS = 60_000;

/** wp-admin's own line — "You have unsaved changes. If you proceed, they will
 *  be lost." — in Khmer, because the newsroom staff read no English. Owner's
 *  rule (2026-08-26): no closing "leave anyway?" — OK / Cancel carry the
 *  question. Only ever shown for a LIVE article; a draft saves itself. */
const LEAVE_MSG = "អត្ថបទនេះមានការផ្លាស់ប្តូរដែលមិនទាន់បានរក្សាទុក — បើអ្នកបន្ត ការផ្លាស់ប្តូរនោះនឹងបាត់បង់";

/** "Saved 3 minutes ago" — coarse on purpose: the reader wants "is it safe",
 *  not a stopwatch. */
function agoLabel(at: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins === 1 ? "a minute ago" : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "an hour ago" : `${hours} hours ago`;
}

/** Which sidebar sections are folded open. Publish is not among them — it has
 *  no header and never collapses, because status is the one thing you look at
 *  on every single visit. */
type SectionKey = "categories" | "tags" | "excerpt";

export default function ArticleEditor({
  post = null,
  categories,
  templates = [],
}: {
  post?: EditablePost | null;
  categories: CategoryNode[];
  /** Post templates the live theme registers. Empty when ams-frontend-api is
   *  below 1.19.0 or the call failed — the control still renders, with
   *  "Default template" and whatever the post already carries. */
  templates?: PostTemplate[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  /** Whether anything reached WordPress during this visit — decides whether
   *  leaving must evict the client caches (see registerBody). */
  const savedThisVisitRef = useRef(false);

  /* ---- Identity: which WordPress post this editor writes to. Null until the
     first autosave of a NEW article creates the draft; from then on the editor
     edits that draft in place — URL swapped underneath it, no remount, no
     lost caret. State drives rendering; the ref is what the save lane reads,
     so a button press queued behind the creating autosave already knows the
     id it must update rather than creating a second post. */
  const [postId, setPostId] = useState<number | null>(post?.id ?? null);
  const postIdRef = useRef<number | null>(post?.id ?? null);
  const isCreate = postId === null;

  /* ---- Autosave + leave guard (the rule is in the header note).
     `baselineRef` is what "clean" means: a JSON snapshot of the editor as
     WordPress last saw it — captured once the body registers, then replaced
     by the snapshot each successful save was BUILT from (not the editor as it
     stands when the response lands: keystrokes typed during the ~4s write
     must stay dirty, or the next tick would skip them). `guardRef` is the
     latest-closure escape hatch: the guards are wired up in a mount-once
     effect and timers, and dispatch through it so they always read THIS
     render's state (the same reason GutenbergEditor reads blocks through
     blocksRef). */
  const baselineRef = useRef<string | null>(null);
  /** When the last save landed — the autosave clock. Stamped at mount (in the
   *  effect: the React compiler forbids Date.now() during render), so a new
   *  article's first autosave is a minute in, as wp-admin's is. */
  const lastSaveAtRef = useRef(0);
  const guardRef = useRef<{
    snapshotData: () => EditorSnapshot | null;
    contentChanged: () => boolean;
    isEditorDirty: () => boolean;
    autosaveEligible: () => boolean;
    tick: () => void;
    flushOnLeave: () => Promise<boolean>;
    noteEdit: () => void;
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
      // navigation the click guard never saw (a programmatic push, a
      // forward-button traversal): child cleanups run before parent ones on
      // unmount, so the handle is still alive here. A draft with unsaved
      // edits gets its last autosave from this moment — fire-and-forget, the
      // request outlives the component.
      void guardRef.current?.flushOnLeave();
      // MEASURED 2026-08-27: with `staleTimes.dynamic: 180` (next.config) the
      // router serves this editor's page from its client cache for 3 minutes,
      // so leaving after a save and coming back showed the PRE-save article
      // until a hard refresh — and a draft re-opened that way would then
      // autosave the stale text back over the real one. Nothing on the server
      // side evicts it: an action only evicts when revalidateTag is called
      // WITHOUT a profile (Next 16 `addRevalidationHeader`), and ours passes
      // "max" for the public ISR tags. `router.refresh()` bumps the GLOBAL
      // segment-cache version and the back/forward cache, so every cached
      // page — this one included — is refetched on its next visit; queued
      // here it runs after the navigation away, so what it re-renders is the
      // destination, never this editor (a refresh IN the editor would cost a
      // ~4s server render per save, and remount an article created in place).
      if (savedThisVisitRef.current) router.refresh();
    }
    bodyRef.current = h;
    setEditorReady(h !== null);
    if (h) {
      // The baseline arms HERE, not on mount: it must read the body exactly as
      // the editor parsed it (serialize∘parse differs from the stored bytes in
      // insignificant whitespace, so comparing against the raw post would read
      // as permanently dirty). Deferred a tick because guardRef is filled by
      // an after-render effect. Idempotent — dev StrictMode runs this twice.
      setTimeout(() => {
        const data = guardRef.current?.snapshotData();
        if (data) baselineRef.current ??= JSON.stringify(data);
      }, 0);
    }
  }, [router]);

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
  /** The autosave's own in-flight flag — the button stays usable while a tick
   *  writes (a press queues behind it), so it cannot share `saving`. */
  const [autosaving, setAutosaving] = useState(false);
  /** The top bar's "Unsaved changes" readout. Refreshed by the 5s tick and
   *  flipped on at once by typing — the title and canvas render nothing
   *  through React, so nothing else would notice a keystroke. */
  const [dirtyShown, setDirtyShown] = useState(false);
  /** When the last save (either kind) landed, for "Saved 3 minutes ago";
   *  `now` ticks every 30s so the label ages without a render per second. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Confirm step for the one save that pulls a LIVE article off the site. */
  const [confirmOffline, setConfirmOffline] = useState(false);
  /** wp-admin's "Are you ready to publish?" step — see onPrimary. */
  const [confirmPublish, setConfirmPublish] = useState(false);

  /** Snackbar for warnings that must interrupt (blocking a publish) — the top
   *  bar's quiet status line is easy to miss with your eyes on the button. */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  /* ---- Snapshot + dirtiness ------------------------------------------- */

  /** The editor as one comparable value — the SAME serialization decides
   *  dirtiness and becomes the baseline after a save. Deliberately WITHOUT
   *  the Status radio: autosave never writes status (see the header note), so
   *  a selection the button has not committed must not read as changed
   *  content on every tick — it is tracked on its own in isEditorDirty. Null
   *  until the body registers: before that there is nothing to compare. */
  const snapshotData = (): EditorSnapshot | null => {
    const body = bodyRef.current;
    if (!body) return null;
    return {
      // Live DOM while the element exists; the mirror once refs are detached
      // (the unmount flush) — see titleTextRef.
      title: (titleRef.current ? titleRef.current.innerText : titleTextRef.current).trim(),
      body: body.getHtml(),
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

  /** Content or metadata WordPress does not hold yet. */
  const contentChanged = (): boolean => {
    if (baselineRef.current === null) return false;
    const data = snapshotData();
    return data !== null && JSON.stringify(data) !== baselineRef.current;
  };

  /** Everything leaving would lose: unsaved content, or a Status selection
   *  the button has not committed — autosave keeps the draft, never the
   *  intent, same as wp-admin. */
  const isEditorDirty = (): boolean =>
    contentChanged() || (savedStatus !== null && pubStatus !== savedStatus);

  /** THE RULE: autosave only where WordPress holds a draft — or nothing yet.
   *  A live article is written by the button alone; so are Pending and
   *  Private, which wp-admin's autosave also leaves to its revision path. */
  const autosaveEligible = (): boolean => savedStatus === null || savedStatus === "Draft";

  /** The exit guards + the autosave clock, wired once. What each path gets:
   *  - the 5s tick refreshes the "Unsaved changes" readout, plants the Back
   *    sentinel, and — at most once a minute, wp-admin's own cadence — writes
   *    a dirty draft;
   *  - an in-app link click on a dirty DRAFT is held, the draft is saved, and
   *    THEN the navigation runs, so the list it lands on already shows the
   *    article (the App Router discards a pending action's state the moment
   *    a navigation starts — the write would land, the list would miss it).
   *    On a dirty LIVE article: one plain confirm — beforeunload never fires
   *    on client-side navigation, which is exactly how work used to be lost;
   *  - browser back: the App Router cannot intercept a history traversal, so
   *    a sentinel entry is planted the first time the editor turns dirty and
   *    Back lands on it (same URL) instead of leaving. From there a draft
   *    saves and goes back for real; a live article asks first and re-plants
   *    the sentinel if the writer stays;
   *  - tab close / refresh / external link: the browser's own prompt when
   *    dirty, with a draft's save already started — it lands if they stay.
   *    (A server action cannot be sent keepalive, so it may not if they go.)
   *  A draft never prompts: what it wrote is saved, and a Status selection it
   *  had not committed is simply not applied — the same place it was before
   *  the radio was touched. */
  useEffect(() => {
    lastSaveAtRef.current = Date.now();
    let backArmed = false;
    const armBack = () => {
      if (backArmed) return;
      backArmed = true;
      // Next's patched pushState copies its own router state onto the entry,
      // so popping back to the real one restores this same page, no reload.
      window.history.pushState(null, "", window.location.href);
    };
    const clock = setInterval(() => {
      const g = guardRef.current;
      if (!g) return;
      if (g.isEditorDirty()) armBack();
      g.tick();
    }, 5000);
    const ager = setInterval(() => setNow(Date.now()), 30_000);
    const onInput = (e: Event) => {
      // Typing in the title or the canvas — the two fields React never
      // renders. Sidebar inputs re-render on their own; the tick catches
      // them within 5s.
      if (!(e.target as HTMLElement | null)?.isContentEditable) return;
      guardRef.current?.noteEdit();
      armBack();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const g = guardRef.current;
      if (!g) return;
      if (g.autosaveEligible()) {
        if (!g.contentChanged()) return;
        void g.flushOnLeave();
      } else if (!g.isEditorDirty()) {
        return;
      }
      e.preventDefault();
      // Chrome still keys the prompt off returnValue; the text is ignored.
      e.returnValue = "";
    };
    const onPopState = () => {
      if (!backArmed) return;
      backArmed = false;
      const g = guardRef.current;
      if (g?.autosaveEligible()) {
        if (g.contentChanged()) {
          void g.flushOnLeave().then((landed) => {
            if (landed) window.history.back();
            else armBack(); // the readout says why; the work stays on screen
          });
          return;
        }
      } else if (g?.isEditorDirty() && !window.confirm(LEAVE_MSG)) {
        armBack();
        return;
      }
      window.history.back();
    };
    const onClickCapture = (e: MouseEvent) => {
      // Modified clicks open a new tab — this page, and its state, stay put.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!a) return;
      if (a.getAttribute("target") === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      const g = guardRef.current;
      if (!g) return;
      if (g.autosaveEligible()) {
        if (!g.contentChanged()) return;
        e.preventDefault();
        e.stopPropagation(); // before Link's own handler — the navigation waits for the save
        void g.flushOnLeave().then((landed) => {
          if (landed) router.push(href);
        });
        return;
      }
      if (g.isEditorDirty() && !window.confirm(LEAVE_MSG)) {
        e.preventDefault();
        e.stopPropagation(); // the navigation never starts
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("input", onInput, true);
    return () => {
      clearInterval(clock);
      clearInterval(ager);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("input", onInput, true);
      // The unmount flush lives in registerBody's deregistration branch — by
      // this point the body handle is already gone (child cleanups run first).
    };
  }, [router]);

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
  const previewHref = postId === null
    ? undefined
    : savedStatus === "Published"
      ? wpLink || undefined
      : `${process.env.NEXT_PUBLIC_WP_ORIGIN ?? "https://education.ams.com.kh"}/?p=${postId}&preview=true`;

  /**
   * The button says what pressing it DOES, read against what WordPress holds.
   *
   * History: there were two buttons and they contradicted the panel — the
   * primary mapped everything that wasn't Pending or Private to `Published`,
   * so ticking "Draft" and pressing it PUBLISHED the article, and a permanent
   * "Save draft" secondary quietly took LIVE articles off the site. So it
   * became one button committing exactly the radio's status.
   *
   * 2026-08-27 (owner): an article that has never been published gets
   * wp-admin's own default — **Publish** — with a quiet "Save draft" beside it
   * (`showSaveDraft`: offered only while nothing is live, the one place it
   * cannot take anything down). The Status radio STAYS on Draft, because that
   * is the truth while autosave keeps it a draft; Publish is an action, not a
   * status echo, and it asks first (see onPrimary / confirmPublish). Moving
   * the radio still works as before: Pending → "Submit for review", Private →
   * "Make private", and Draft on an article WordPress holds as Pending/Private
   * → "Save draft" (the one case where Draft is a change to commit).
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
            : savedStatus === "Pending" || savedStatus === "Private"
              ? "Save draft"
              : "Publish"
          : savedStatus === "Published"
            ? "Update"
            : "Publish";
  /** Pressing the primary takes the article LIVE — the pre-publish step. */
  const primaryPublishes = primaryLabel === "Publish";

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

  /* ---- Saving: one lane, two callers ---------------------------------- */

  /** The write payload, shared by the button and the autosave. `kind` decides
   *  the status: manual commits the radio; auto always writes `draft` (the
   *  server action forces it as well — see autosaveArticleAction). */
  const buildPayload = (kind: SaveKind, statusOverride?: string): EditorPayload => {
    const payload: EditorPayload = {
      // Live DOM while the element exists; the mirror once refs are detached
      // (the unmount flush) — see titleTextRef.
      title: (titleRef.current ? titleRef.current.innerText : titleTextRef.current).trim(),
      excerpt: excerpt.trim(),
      status: kind === "auto" ? "draft" : statusOverride ?? toWpStatus(pubStatus),
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
    return payload;
  };

  /** ONE save at a time, in order. A button press during an autosave waits
   *  for it — and, on a brand-new article, then UPDATES the id that autosave
   *  created instead of creating a second post (performSave reads postIdRef
   *  when it runs, not when it was queued). The tick simply skips while
   *  anything is in flight. Without the lane, an autosave response landing
   *  after a publish would rewrite the screen with stale echoes. */
  const laneRef = useRef<Promise<unknown>>(Promise.resolve());
  const inFlightRef = useRef(false);
  /** A leave-flush already on its way for exactly this content, so the second
   *  leave hook (the unmount, right after the click) does not send it twice. */
  const pendingFlushRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const runExclusive = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = laneRef.current.then(fn, fn);
    laneRef.current = run.catch(() => undefined);
    return run;
  };

  /** The write. `snap` is the snapshot the payload was built from and becomes
   *  the baseline on success — NOT the editor as it stands when the response
   *  lands (see baselineRef). Returns whether it landed. */
  const performSave = async (kind: SaveKind, payload: EditorPayload, snap: EditorSnapshot): Promise<boolean> => {
    const id = postIdRef.current;
    inFlightRef.current = true;
    if (kind === "manual") setSaving(true);
    else setAutosaving(true);
    setSaveMsg(null);
    const res =
      kind === "auto"
        ? await autosaveArticleAction(id, payload)
        : id === null
          ? await createPostAction(payload)
          : await savePostAction(id, payload);
    inFlightRef.current = false;
    if (kind === "manual") setSaving(false);
    else setAutosaving(false);

    if (!res.ok) {
      setSaveMsg({
        kind: "err",
        text:
          kind === "manual"
            ? res.error ?? "Save failed."
            : res.expired
              ? "Not saved — your session has expired. Sign in again in another tab; autosave then resumes."
              : `Not saved — ${res.error ?? "WordPress did not answer in time"}; trying again in a minute.`,
      });
      return false;
    }

    // A brand-new article now exists: edit it in place from here on. The URL
    // follows, so a refresh lands on the real editor; no router.push —
    // remounting mid-sentence would drop the caret.
    if (id === null && res.id) {
      postIdRef.current = res.id;
      setPostId(res.id);
      window.history.replaceState(null, "", `/admin/articles/${res.id}`);
    }
    lastSaveAtRef.current = Date.now();
    savedThisVisitRef.current = true;
    // The Articles list is a react-query screen (30s staleTime): mark it stale
    // so the next visit refetches — a title, status or a brand-new draft must
    // be there when the writer goes back to look for it.
    void queryClient.invalidateQueries({ queryKey: adminKeys.postsRoot });
    setSavedAt(lastSaveAtRef.current);
    setDirtyShown(false);
    // WordPress echoes the status it actually stored — trust that over the
    // intent. A manual save moves BOTH values onto it so the pill and the
    // panel agree; an autosave moves only the truth (the radio keeps the
    // writer's intent, and the panel keeps saying it is not applied yet).
    const stored = res.status ? fromWpStatus(res.status) : kind === "auto" ? "Draft" : pubStatus;
    setSavedStatus(stored);
    if (kind === "manual") {
      setPubStatus(stored);
      // WordPress echoes the slug it actually stored (sanitized, deduped) —
      // show that, not what was typed. Publishing locks the field from here
      // on. An autosave leaves the field alone: rewriting it under a writer
      // mid-word is exactly what makes an autosave feel haunted.
      if (res.slug) setSlug(res.slug);
    }
    // The permalink WordPress computed for what it just stored — on a publish,
    // the article's final live URL. This is what lets the preview button work
    // right after publishing, without anyone reloading the editor.
    if (res.link) setWpLink(res.link);
    if (res.status === "publish") setEverPublished(true);
    baselineRef.current = JSON.stringify(kind === "manual" && res.slug ? { ...snap, slug: res.slug } : snap);
    if (kind === "manual") {
      // The WP site serves this article's pages from its own cache, and our
      // writes deliberately skip its purge hooks (that skip is the fast save).
      // So when this save changed anything the OLD site shows — it's published
      // now, or it was published before (an update, an unpublish, going
      // private) — kick off the background purge+re-warm. `everPublished`
      // here is the pre-save value: a never-published draft skips this.
      const legacyId = id ?? res.id;
      if (legacyId && (res.status === "publish" || everPublished)) startLegacyRefresh(legacyId);
    }
    return true;
  };

  /** Whether a NEW article has been written into at all. A category tick with
   *  no title and no body is not an article yet — and a click-through that
   *  types nothing must create nothing on the live site. */
  const hasWriting = (snap: EditorSnapshot): boolean =>
    postIdRef.current !== null || snap.title.length > 0 || Boolean(bodyRef.current?.isDirty());

  /** The 5s tick: the readout, then — at most once a minute — a dirty draft. */
  const tick = () => {
    const changed = contentChanged();
    setDirtyShown(changed);
    if (!changed || !autosaveEligible() || inFlightRef.current) return;
    if (Date.now() - lastSaveAtRef.current < AUTOSAVE_INTERVAL_MS) return;
    const snap = snapshotData();
    if (!snap || !hasWriting(snap)) return;
    void runExclusive(() => performSave("auto", buildPayload("auto"), snap));
  };

  /** A draft's last save before the page goes — ignores the minute clock.
   *  Resolves to whether the work is safe to leave behind: it landed, or
   *  there was nothing to send. Idempotent per content (pendingFlushRef). */
  const flushOnLeave = (): Promise<boolean> => {
    if (!autosaveEligible() || !contentChanged()) return Promise.resolve(true);
    const snap = snapshotData();
    if (!snap || !hasWriting(snap)) return Promise.resolve(true);
    const key = JSON.stringify(snap);
    if (pendingFlushRef.current?.key === key) return pendingFlushRef.current.promise;
    const promise = runExclusive(() => performSave("auto", buildPayload("auto"), snap));
    pendingFlushRef.current = { key, promise };
    return promise;
  };

  /** Saves at the SELECTED status — or the one the button names, when the
   *  button is an action rather than a status echo (Publish on a draft).
   *  Returns whether it landed, so the confirm dialogs can stay open on
   *  failure. */
  async function save(statusOverride?: string): Promise<boolean> {
    const status = statusOverride ?? toWpStatus(pubStatus);
    const payload = buildPayload("manual", status);
    const snap = snapshotData();
    if (!snap) return false; // the body has not registered yet

    if (!payload.title) {
      setSaveMsg({ kind: "err", text: "Give the article a title first." });
      return false;
    }

    // WordPress silently substitutes Uncategorized when the array is empty.
    // That creates /post-slug/ and defeats the newsroom's required
    // /category-slug/post-slug/ contract, so stop before anything is written.
    if (payload.categories.length === 0) {
      setSaveMsg({ kind: "err", text: "Choose a category before saving — it becomes the first part of the article URL." });
      return false;
    }

    // BLOCK a publish without a slug (owner's call, 2026-08-12): left to
    // WordPress, the URL would be minted from the Khmer title as a giant
    // percent-encoded string — and a live URL is permanent here. Drafts and
    // review submissions pass freely: no URL exists yet to get wrong.
    if ((status === "publish" || status === "private") && !slug.trim()) {
      promptForSlug();
      return false;
    }

    return runExclusive(() => performSave("manual", payload, snap));
  }

  /** Take the writer to the slug field: it lives in the SEO panel under the
   *  article, so the toast says where and the scroll shows it. (Owner's call,
   *  2026-08-27: this, not a slug field inside the publish dialog — a second
   *  form popping up is exactly the kind of thing that confuses a writer.) */
  const promptForSlug = () => {
    showToast("Add an English slug before publishing — it becomes the article's permanent URL. The Slug field is in the SEO panel under the article.");
    const el = document.getElementById("seo-slug");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };

  /** The primary button. Two moves ask first — going LIVE (one bare "Ready to
   *  publish?", so an accidental press costs nothing) and taking a live
   *  article down. Everything else commits straight away. Publish with no
   *  slug yet does not ask at all: it walks the writer to the slug field
   *  (promptForSlug) and the question comes on the next press. */
  const onPrimary = () => {
    setSaveMsg(null); // a dialog reports its own failure — not the last one
    if (primaryPublishes) {
      if (!slug.trim()) {
        promptForSlug();
      } else {
        setToast(null); // the slug hint from a previous press must not sit under the question
        setConfirmPublish(true);
      }
      return;
    }
    if (!takesOffline) {
      void save();
      return;
    }
    setConfirmOffline(true);
  };

  /** The confirmed publish — status forced to `publish` whatever the radio
   *  shows (it is on Draft for a new article; that is the point). */
  const applyPublish = async () => {
    if (await save("publish")) setConfirmPublish(false);
  };

  /** The confirmed take-it-offline save. The dialog stays up while the write
   *  runs and keeps a failure in place — same contract as the trash flow. */
  const applyOffline = async () => {
    if (await save()) setConfirmOffline(false);
  };

  /** The quiet "Save draft" beside Publish — only while nothing is live, so it
   *  can never take anything down. Reads "Saved" on a clean draft (wp-admin's
   *  own idle state). Autosave does this job on its own; the button is for the
   *  writer who wants it done NOW. It goes through the autosave lane on
   *  purpose: always a draft, the radio's intent untouched, the slug never
   *  rewritten under them. */
  const showSaveDraft = !everPublished && (savedStatus === null || savedStatus === "Draft");
  const saveDraftIdle = savedStatus === "Draft" && !dirtyShown;
  const saveDraftNow = () => {
    const snap = snapshotData();
    if (!snap) return;
    if (!hasWriting(snap)) {
      setSaveMsg({ kind: "err", text: "Write a title or some text first." });
      return;
    }
    setSaveMsg(null);
    void runExclusive(() => performSave("auto", buildPayload("auto"), snap));
  };

  // Refresh the guards' view of this render — same latest-through-a-ref
  // pattern as blocksRef in GutenbergEditor, for the handlers wired up once
  // above and the timers that call them.
  useEffect(() => {
    guardRef.current = {
      snapshotData,
      contentChanged,
      isEditorDirty,
      autosaveEligible,
      tick,
      flushOnLeave,
      noteEdit: () => setDirtyShown(true),
    };
  });


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
        {/* The readout — the whole autosave UI, on purpose: "Unsaved changes"
            → "Saving…" → "Saved just now", the shape writers already know
            from Docs. Nothing to decide, nothing to restore. */}
        <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap" })} style={{ color: saveMsg?.kind === "err" ? ac.danger : ac.faint }}>
          {saving || autosaving
            ? "Saving…"
            : saveMsg
              ? saveMsg.text
              : !editorReady
                ? "Preparing the editor…"
                : dirtyShown
                  ? autosaveEligible()
                    ? "Unsaved changes · autosaves every minute"
                    : "Unsaved changes"
                  : savedAt
                    ? `Saved ${agoLabel(savedAt, now)}`
                    : isCreate
                      ? "New article"
                      : "Loaded"}
        </span>
        <LegacySiteChip postId={postId ?? undefined} />

        {/* The Write / Settings segmented control used to live here. Both are
            on screen at once now, so there is nothing to switch between. */}
        <div className={css({ flex: 1 })} />

        {/* Two buttons while nothing is live — wp-admin's anatomy, Save draft
            beside Publish — and ONE once it is. See `primaryLabel` for why the
            secondary must never exist on a live article. */}
        {showSaveDraft ? (
          <button
            type="button"
            disabled={saving || autosaving || saveDraftIdle}
            onClick={saveDraftNow}
            className={css({ height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", flex: "none", whiteSpace: "nowrap", transition: "background .12s", _hover: { background: ac.surfaceHover } })}
            style={{ background: "transparent", border: `1px solid ${ac.border}`, color: ac.text, opacity: saving || autosaving || saveDraftIdle ? 0.6 : 1, cursor: saveDraftIdle ? "default" : undefined }}
          >
            {autosaving ? "Saving…" : saveDraftIdle ? "Saved" : "Save draft"}
          </button>
        ) : null}
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

      {/* The one question before an article goes live — and ONLY the question
          (owner's call, 2026-08-27): no address, no summary, no note. The slug
          was already checked before this opened (onPrimary), so there is
          nothing left to fill in here. */}
      {confirmPublish ? (
        <ConfirmDialog
          title="Ready to publish?"
          confirmLabel="Publish"
          busyLabel="Publishing…"
          tone="default"
          busy={saving}
          error={saveMsg?.kind === "err" ? saveMsg.text : null}
          onConfirm={() => void applyPublish()}
          onCancel={() => setConfirmPublish(false)}
        />
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
        initialContent={post?.bodyRaw ?? ""}
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
