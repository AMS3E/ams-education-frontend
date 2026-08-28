// The post category tree for the editor's category picker. 26 terms, so one
// request; returned depth-ordered (each parent immediately before its children)
// with a `depth` for indentation — the shape the editor's CatRow already renders.

import { adminFetch } from "./client";
import { fastFetch, withRestFallback } from "./fast";
import { decodeEntities } from "@/lib/api/mappers";

interface RawCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  depth: number;
  count: number;
  /** Parent term id (0 = top level). The manager needs it to collapse subtrees
   *  and to exclude a term's own descendants from its "move under" picker —
   *  `depth` alone can't answer either question. */
  parent: number;
}

/** Owner-pinned sibling tweaks (2026-08-18): each [mover, anchor] pair places
 *  `mover` immediately before `anchor` when both are siblings; everything else
 *  keeps WordPress's Khmer-alphabetical order (where ប sorts before ព — the
 *  reason ព្រឹត្តិការណ៍ trailed បទយកការណ៍). Names compared decoded+trimmed,
 *  exactly as rendered. Extend the list for future ordering requests. */
const PLACE_BEFORE: ReadonlyArray<readonly [string, string]> = [
  ["ព្រឹត្តិការណ៍", "បទយកការណ៍"],
];

function orderSiblings(list: RawCategory[]): RawCategory[] {
  const out = [...list];
  const nameOf = (c: RawCategory) => decodeEntities(c.name).trim();
  for (const [mover, anchor] of PLACE_BEFORE) {
    const mi = out.findIndex((c) => nameOf(c) === mover);
    if (mi < 0) continue;
    const [m] = out.splice(mi, 1);
    const ai = out.findIndex((c) => nameOf(c) === anchor);
    if (ai < 0) {
      out.splice(mi, 0, m); // anchor isn't a sibling — put the mover back
      continue;
    }
    out.splice(ai, 0, m);
  }
  return out;
}

/** Flat terms -> depth-ordered tree. SHARED by the REST and fast paths (the
 *  fast endpoint returns the same {id,name,slug,parent,count} rows), so the
 *  two cannot drift on ordering or entity decoding. */
function buildTree(data: RawCategory[]): CategoryNode[] {
  const byParent = new Map<number, RawCategory[]>();
  for (const c of data) {
    const list = byParent.get(c.parent) ?? [];
    list.push(c);
    byParent.set(c.parent, list);
  }

  // Depth-first from the roots (parent 0), so a parent is always immediately
  // followed by its descendants; siblings keep the name order from the query,
  // adjusted by the pinned pairs above.
  const out: CategoryNode[] = [];
  const walk = (parent: number, depth: number) => {
    for (const c of orderSiblings(byParent.get(parent) ?? [])) {
      out.push({ id: c.id, name: decodeEntities(c.name).trim(), slug: c.slug, depth, count: c.count, parent: c.parent });
      walk(c.id, depth + 1);
    }
  };
  walk(0, 0);
  return out;
}

/** `token` = explicit session token from the BFF route; omitted, the cookie
 *  is read here. */
export async function listCategories(token?: string): Promise<CategoryNode[]> {
  const { data } = await adminFetch<RawCategory[]>("/wp/v2/categories", {
    token,
    query: {
      per_page: 100,
      orderby: "name",
      order: "asc",
      hide_empty: false,
      _fields: "id,name,slug,parent,count",
    },
  });

  return buildTree(data ?? []);
}

/** The same tree from the fast path — identical rows, same buildTree. */
export async function listCategoriesFast(token?: string): Promise<CategoryNode[]> {
  const body = await fastFetch<{ items: RawCategory[] }>("categories", {}, { token });
  return buildTree(body.data.items ?? []);
}

/** The read the BFF should call: fast path first, WP REST if unavailable. */
export function readCategories(token?: string): Promise<CategoryNode[]> {
  return withRestFallback(
    "categories",
    () => listCategoriesFast(token),
    () => listCategories(token),
  );
}
