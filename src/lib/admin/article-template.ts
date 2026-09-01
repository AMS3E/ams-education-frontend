// Which WordPress POST TEMPLATE an article should carry — what renders the
// tail BELOW the article body on the WordPress site. A post left on "Default
// template" shows nothing after the body.
//
// DISABLED 2026-08-28. This used to auto-suggest a template from the article's
// categories, but the entire mapping (category ids, template filenames) was
// mined against a DIFFERENT site's database on 2026-08-24, before this
// project's backend became education.ams.com.kh. None of those category ids
// exist in education's tree, and none of those template filenames are
// registered on its theme — every suggestion WordPress saw was rejected with
// a 400 `rest_invalid_param`, which is why autosave/create could not save at
// all. Rather than guess a wrong-but-plausible-looking value again, this now
// always returns DEFAULT_TEMPLATE, which WordPress always accepts.
//
// education.ams.com.kh's real registered article templates (captured from a
// live 400 response's rejection list, 2026-08-28):
//   templates/children-education-template.php
//   templates/life-education-template.php
//   templates/national-and-international-news-template.php
//   templates/outstanding-youth-template.php
//   templates/schoolaship-news-template.php
//   templates/skills-project-template.php
// Re-enabling suggestion needs the same methodology the original mapping
// used: sample education's own live posts per category, and the owner's call
// on the ambiguous ones — not a guess from the names above.

import type { CategoryNode } from "./categories";

/** WordPress's own value for "Default template" — no tail. */
export const DEFAULT_TEMPLATE = "";

export function suggestTemplate(_categoryIds: readonly number[], _categories: readonly CategoryNode[]): string {
  return DEFAULT_TEMPLATE;
}
