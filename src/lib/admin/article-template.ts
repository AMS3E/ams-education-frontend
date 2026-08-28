// Which WordPress POST TEMPLATE an article should carry.
//
// The live theme registers ~16 post templates ("Celebrity-Article Block",
// "Movie and Music-Article Block", …). They are what renders the tail BELOW the
// article body on the WordPress site — a post left on "Default template" shows
// nothing after the body, which is the bug this file exists to prevent.
//
// The map below was MINED, not designed. 940 posts were sampled (up to 100 from
// each of the 24 non-empty categories) on 2026-08-24 and their stored `template`
// read back. Two things that sampling settled, and that no amount of reading the
// names would have told you:
//
//   * THE TEMPLATE NAMES LIE about which category they serve. ព័ត៌មានប្លែកៗ (963)
//     uses `entertainment-news-template.php`, and ព័ត៌មានកម្សាន្ត (959) used
//     `celebrity-template.php` on 99 of 102 sampled posts. Deriving a template
//     from a category name gets at least three of them wrong.
//   * REPORTS ARTICLES CARRY NO TEMPLATE. 170 of 172 sampled reports-side posts
//     are on "Default template", against 8 of 768 on the news side. That was a
//     convention, not forgetfulness — and it is exactly the "nothing renders
//     after the body" complaint, so the owner's call (2026-08-24) is to give the
//     reports subtrees a template too. That is why 972/973 appear below.
//
// Where the data was thin or split the OWNER chose, and those choices are marked
// so a later reader can tell measurement from decision:
//
//   * 959 ព័ត៌មានកម្សាន្ត → entertainment-news, NOT the celebrity template 97% of
//     its articles actually carry. Deliberate: it follows the celebrity →
//     entertainment rename, and this is the single highest-traffic category, so
//     the tail visibly changes for new articles. One line to revert.
//   * 970 ទេសចរណ៍ → life-style. The data was a coin-flip (life-style 54,
//     food-and-hangout 38) because no Travel template was ever built.
//   * 6915 វប្បធម៌ ប្រពៃណី → entertainment-news (measured celebrity, but only 62%).
//   * 7325 ព័ត៌មានសង្គម has zero posts, so it has no precedent at all; it inherits
//     entertainment-news from its 957 parent.
//
// This is a RELEASE-GRADE GUESS by design. The owner's plan is to ship it, watch
// what editors actually override, and re-derive from that feedback — so keep the
// shape easy to retune: the three overrides and the four subtree defaults are
// the whole model.

import type { CategoryNode } from "./categories";

/** WordPress's own value for "Default template" — no tail. */
export const DEFAULT_TEMPLATE = "";

/** ព័ត៌មាន (news) and របាយការណ៍ព័ត៌មានកម្សាន្ត (its reports mirror). */
const ENTERTAINMENT = "templates/entertainment-news-template.php";
/** ព័ត៌មានរសនិយម (lifestyle) and របាយការណ៍រសនិយម. Also the site-wide fallback:
 *  it is the most-used template in the sample, 179 of 940. */
const LIFE_STYLE = "templates/life-style-template.php";

/**
 * Categories that beat their subtree default, STRONGEST FIRST.
 *
 * All three are measured, not chosen, and all three are the cases where a
 * dedicated template exists for the topic. Order matters only when two of them
 * are on the same post, which the sample never showed — it is defined anyway so
 * the function is total.
 */
const RANKED_OVERRIDES: ReadonlyArray<readonly [id: number, template: string]> = [
  [960, "templates/movie-and-music-template.php"], // ភាពយន្តនិងតន្រ្តី — 91/100
  [969, "templates/love-and-relation-template.php"], // ស្នេហានិងទំនាក់ទំនង — 98/100
  [967, "templates/health-and-beauty-template.php"], // សុខភាពនិងសម្រស់ — 91/101
];

/**
 * The four subtree roots. Any category inherits from its NEAREST ancestor here
 * (itself included), so a category added later — 7325 ព័ត៌មានសង្គម was created
 * three days ago — is covered the moment it is filed under one of them, with no
 * edit to this file.
 */
const SUBTREE_DEFAULT: ReadonlyMap<number, string> = new Map([
  [957, ENTERTAINMENT], // ព័ត៌មាន
  [972, ENTERTAINMENT], // របាយការណ៍ព័ត៌មានកម្សាន្ត
  [958, LIFE_STYLE], // ព័ត៌មានរសនិយម
  [973, LIFE_STYLE], // របាយការណ៍រសនិយម
]);

/**
 * បំណិនជីវិត (Life Tips), 9,536 posts and climbing.
 *
 * Editors use it as a catch-all, so it is on a large share of articles that are
 * really about something else — and the sample proves it LOSES every time it
 * meets a real topic: against 959 it goes celebrity 19/21, against 963
 * entertainment-news 51/59, against 967 health-and-beauty 31/35, against 969
 * love-and-relation 71/72. So it ranks below everything except the containers.
 *
 * (Note this is the exact opposite of how it behaves for PERMALINKS, where its
 * Khmer name sorts first and it WINS the deepest-category tie-break. Two
 * different precedence orders on the same tree — do not unify them.)
 */
const LIFE_TIPS = 956;

/** Rank of a single category as a template SOURCE. Lower wins. */
function rank(catId: number, rootOf: (id: number) => number | undefined): number {
  const override = RANKED_OVERRIDES.findIndex(([id]) => id === catId);
  if (override >= 0) return override;

  if (catId === LIFE_TIPS) return 90;

  const root = rootOf(catId);
  if (root === undefined) return 80; // outside all four subtrees — a stray

  // A leaf says more than the section it sits in, so it outranks its own root.
  const base = root === 957 || root === 972 ? 10 : 20;
  return catId === root ? base + 5 : base;
}

/**
 * The template to suggest for a set of checked categories.
 *
 * Returns the site-wide fallback rather than `DEFAULT_TEMPLATE` when nothing
 * matches: an article with no recognisable category still needs a tail, and a
 * wrong-ish tail is a smaller failure than a blank one.
 */
export function suggestTemplate(categoryIds: readonly number[], categories: readonly CategoryNode[]): string {
  if (categoryIds.length === 0) return LIFE_STYLE;

  const parentOf = new Map(categories.map((c) => [c.id, c.parent]));

  /** Nearest ancestor (self included) that is a subtree root. */
  const rootOf = (id: number): number | undefined => {
    // Bounded by the tree's depth, but guarded anyway: a term whose parent is
    // missing from `categories` (or a cycle, which WordPress permits between
    // non-root terms) must not spin here.
    const seen = new Set<number>();
    let cur: number | undefined = id;
    while (cur !== undefined && cur !== 0 && !seen.has(cur)) {
      if (SUBTREE_DEFAULT.has(cur)) return cur;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return undefined;
  };

  const best = [...categoryIds].sort((a, b) => rank(a, rootOf) - rank(b, rootOf))[0];

  const override = RANKED_OVERRIDES.find(([id]) => id === best);
  if (override) return override[1];

  const root = rootOf(best);
  return (root !== undefined ? SUBTREE_DEFAULT.get(root) : undefined) ?? LIFE_STYLE;
}
