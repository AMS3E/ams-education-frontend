// ---------------------------------------------------------------------------
// Local backup of in-progress article edits — the safety net for a tab closed
// or a link clicked mid-write. DELIBERATELY localStorage, not a WordPress
// draft: this admin writes to the LIVE site, so a WP-style silent autosave
// would mint real posts on production every time someone opened the editor
// (including every /admin/articles/new click-through test). Saving to
// WordPress stays a decision the writer makes; this module only makes sure
// nothing typed can be lost before they make it.
//
// One key per article ("new" for the create screen), one JSON blob per key.
// ArticleEditor owns WHEN to read/write (its guard-and-heartbeat effect);
// this module owns the storage shape, so the two screens and any future
// editor agree on it. Everything is try/catch'd: private mode or a full
// quota degrades to "no backup", never to a crash mid-keystroke.
// ---------------------------------------------------------------------------

/** Everything the editor would put in a save payload, as restorable values.
 *  Mirrors ArticleEditor's snapshot — the SAME serialization is also how the
 *  editor decides it is dirty, so field order here is load-bearing only in
 *  that both sides build it with one function. */
export interface DraftData {
  title: string;
  /** Serialized block markup at backup time. On restore it is compared with
   *  the live serialization first, so an untouched body stays untouched (the
   *  round trip is stable — measured in GutenbergEditor's header note). */
  body: string;
  /** The editor's Status label ("Draft" | "Pending" | "Private" | "Published").
   *  Typed as string so this module doesn't import component tokens; the
   *  restore path validates it against the editor's own list. */
  status: string;
  password: string;
  sticky: boolean;
  categories: number[];
  template: string;
  templateTouched: boolean;
  tags: { id: number; name: string }[];
  featuredId: number;
  featuredThumb: string;
  excerpt: string;
  slug: string;
  seo: { title: string; description: string; focus: string };
}

export interface ArticleDraft {
  v: 1;
  at: number;
  data: DraftData;
}

const PREFIX = "ams-admin:article-backup:";

export function draftKey(postId: number | null): string {
  return `${PREFIX}${postId ?? "new"}`;
}

export function readDraft(key: string): ArticleDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as ArticleDraft;
    if (
      d?.v !== 1 ||
      typeof d.at !== "number" ||
      typeof d.data?.title !== "string" ||
      typeof d.data?.body !== "string" ||
      !Array.isArray(d.data?.categories)
    ) {
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, data: DraftData): void {
  try {
    const draft: ArticleDraft = { v: 1, at: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Private mode or quota — the leave-warning still fires; only recovery
    // after a hard close is lost, which is where we started.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Drop backups nobody came back for. Keys are per-article, so an edit
 *  abandoned for good would otherwise sit in localStorage forever; a month is
 *  far past any real "I lost my tab yesterday" recovery. Runs once per editor
 *  mount — cheap, and there is no better clock on a static admin. */
export function pruneDrafts(maxAgeDays = 30): void {
  try {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const d = readDraft(k);
      if (!d || d.at < cutoff) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** "5 minutes ago" for the restore banner — coarse on purpose: the reader is
 *  deciding "is this mine from just now, or from last week", not timing it. */
export function agoLabel(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return "moments ago";
  if (mins < 60) return mins === 1 ? "a minute ago" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
