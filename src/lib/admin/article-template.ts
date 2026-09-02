// Which WordPress POST TEMPLATE an article should carry — what renders the
// tail BELOW the article body on the WordPress site. A post left on "Default
// template" shows nothing after the body.
//
// RE-ENABLED 2026-09-02 against education.ams.com.kh's REAL tree (the prior
// mapping, disabled 2026-08-28, was mined against a different site's category
// ids and template filenames and got rejected by WordPress on every save).
//
// This mapping was mined the same way: sampled up to 100 live posts per
// category (all 26 categories the site has) via the public
// `wp/v2/posts?categories=<id>&_fields=id,template` endpoint — which returns
// each post's real stored `template` value with no auth needed — and read
// back what template each category's posts actually carry.
//
// What the sample settled:
//   * Every "news-*" topic category (the ones under "all-news") has ONE
//     dominant template, 86-100% consistent. Those are the overrides below.
//   * Every "report-*" category (under "all-report") is >90% "Default
//     template" — reports don't get a tail — with exactly ONE exception:
//     report-youth-scholarship (631) is 4/4 schoolaship-news-template. n=4 is
//     the category's ENTIRE population (not a sample), so it's exhaustive,
//     but it breaks the reports-have-no-template pattern every sibling
//     follows — flagged for the owner to confirm rather than silently trusted.
//
// Left OUT on purpose (falls through to DEFAULT_TEMPLATE — owner's call, not
// a measurement, if one of these should guess instead):
//   * news-youth-scholarship (251): genuine 3-way split — outstanding-youth
//     49%, empty 41%, schoolaship-news 10%. No majority to trust.
//   * Top News (11373): 87% national-and-international-news, but it's a
//     cross-cutting "featured" flag applied ALONGSIDE a real topic category,
//     not a topic itself — the real category on the same post should win,
//     which leaving it out of this list achieves for free.
//   * Uncategorized (1) and the two container categories all-news (533) /
//     all-report (535): no single template describes them (all-news's own
//     posts split across all six templates, matching whichever child topic
//     they're actually filed under).
//
// Re-derive by re-running the sample (see docs/session-log.md 2026-09-02) if
// education's category tree changes, or if editors' overrides suggest one of
// the "left out" cases above should get an owner-decided default.

import type { CategoryNode } from "./categories";

/** WordPress's own value for "Default template" — no tail. */
export const DEFAULT_TEMPLATE = "";

/**
 * Category id → template, ranked strongest-evidence first. Order only matters
 * when two mapped categories are checked on the same post (rare — none of the
 * families below overlap in practice); first match wins.
 */
const RANKED_OVERRIDES: ReadonlyArray<readonly [id: number, template: string]> = [
  [259, "templates/schoolaship-news-template.php"], // news-scholarships-news — 100/100
  [723, "templates/national-and-international-news-template.php"], // news-national-education — 99/100
  [243, "templates/national-and-international-news-template.php"], // news-national-and-international-education-update (parent) — 99/100
  [245, "templates/life-education-template.php"], // news-life-education — 98/100
  [247, "templates/skills-project-template.php"], // news-skill-project — 98/100
  [731, "templates/national-and-international-news-template.php"], // news-international-education — 98/100
  [257, "templates/children-education-template.php"], // news-children-education — 97/100
  [249, "templates/outstanding-youth-template.php"], // news-outstdanding-youth (parent) — 94/100
  [253, "templates/outstanding-youth-template.php"], // news-award (child of outstanding-youth) — 94/100
  [631, "templates/schoolaship-news-template.php"], // report-youth-scholarship — 4/4, exhaustive; OWNER'S CALL to confirm (see note above)
  [255, "templates/outstanding-youth-template.php"], // news-talent (child of outstanding-youth) — 86/100, noisier
];

export function suggestTemplate(categoryIds: readonly number[], _categories: readonly CategoryNode[]): string {
  for (const [id, template] of RANKED_OVERRIDES) {
    if (categoryIds.includes(id)) return template;
  }
  return DEFAULT_TEMPLATE;
}
