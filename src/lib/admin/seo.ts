// Read layer for the SEO workbench: a page of posts WITH their Yoast fields.
//
// Core wp/v2/posts under context=edit is the only list read that carries post
// meta (the curated map from plugin ≥1.7.1 — Yoast's keys included), so this
// screen reads REST directly; there is no fast-path variant. The row set stays
// small (_fields keeps it to id/date/slug/status/title/excerpt/meta), and the
// workbench is a low-traffic screen, so the ~1s REST read is acceptable where
// it wasn't for the Articles list.

import { adminFetch } from "./client";
import { decodeEntities } from "@/lib/api/mappers";
import { DEFAULT_STATUSES } from "./constants";

interface RawSeoPost {
  id: number;
  date: string; // "2026-07-30T10:42:02" — site-local
  slug: string;
  status: string;
  title: { raw?: string; rendered?: string };
  excerpt: { raw?: string };
  meta?: Record<string, unknown>;
}

export interface SeoRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  /** Display date, "30/07/2026". */
  date: string;
  /** Yoast SEO title as stored — "" when the editor never set one. */
  seoTitle: string;
  /** Yoast meta description as stored — "" means the excerpt is what Google gets. */
  seoDescription: string;
  focusKeyphrase: string;
  /** Whether the post has an excerpt to fall back on when seoDescription is "". */
  hasExcerpt: boolean;
}

export interface SeoListResult {
  items: SeoRow[];
  total: number;
  totalPages: number;
  page: number;
}

export interface SeoListParams {
  page?: number;
  perPage?: number;
  search?: string;
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v.trim() : "";
}

/** "2026-07-30T10:42:02" -> "30/07/2026". Site-local already, no zone math. */
function displayDate(dt: string): string {
  const [d] = (dt ?? "").split("T");
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dt;
}

export async function listSeoRows(params: SeoListParams = {}): Promise<SeoListResult> {
  const page = Math.max(1, params.page ?? 1);
  const perPage = params.perPage ?? 20;

  const { data, total, totalPages } = await adminFetch<RawSeoPost[]>("/wp/v2/posts", {
    query: {
      context: "edit",
      page,
      per_page: perPage,
      search: params.search,
      status: DEFAULT_STATUSES,
      orderby: "date",
      order: "desc",
      _fields: "id,date,slug,status,title,excerpt,meta",
    },
  });

  const items = (data ?? []).map((p): SeoRow => {
    const title = decodeEntities(p.title?.raw ?? p.title?.rendered ?? "").trim() || "(untitled)";
    const seoTitle = decodeEntities(metaStr(p.meta, "_yoast_wpseo_title"));
    return {
      id: p.id,
      title,
      slug: p.slug ?? "",
      status: p.status,
      date: displayDate(p.date ?? ""),
      // A stored SEO title identical to the headline changes nothing anywhere
      // it is consumed; the list treats it as unset so the "custom" column
      // means what it says.
      seoTitle: seoTitle === title ? "" : seoTitle,
      seoDescription: decodeEntities(metaStr(p.meta, "_yoast_wpseo_metadesc")),
      focusKeyphrase: decodeEntities(metaStr(p.meta, "_yoast_wpseo_focuskw")),
      hasExcerpt: (p.excerpt?.raw ?? "").trim().length > 0,
    };
  });

  return { items, total, totalPages, page };
}
