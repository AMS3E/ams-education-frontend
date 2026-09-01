# education.ams.com.kh — category IDs

Pulled from `https://education.ams.com.kh/wp-json/wp/v2/categories?per_page=100`
on 2026-08-28 (first pulled 2026-08-27; counts drift, ids don't). 26 categories
total, two top-level trees (ព្រឹត្តិការណ៍ / all-news and its mirror បទយកការណ៍ /
all-report each carry the same sub-category structure).

None of these ids collide with the old economy-site ids (957, 958, 960, 967,
969, 972, 973, 956) that `src/lib/admin/article-template.ts` used to hardcode
before that mapping was disabled 2026-08-28 for being mined against the wrong
site — this table is the real input for redoing it properly, once it's
sampled against education's own live posts.

| ID | Parent | Count | Name | Slug |
|---|---|---|---|---|
| 1 | 0 | 2 | Uncategorized | uncategorized |
| 243 | 533 | 1421 | ព័ត៌មានជាតិ និងអន្តរជាតិ | news-national-and-international-education-update |
| 245 | 533 | 1177 | ចំណេះជីវិត | news-life-education |
| 247 | 533 | 198 | ជំនាញ | news-skill-project |
| 249 | 533 | 391 | យុវជនឆ្នើម | news-outstdanding-youth |
| 251 | 249 | 116 | អាហារូបករណ៍ | news-youth-scholarship |
| 253 | 249 | 159 | ពានរង្វាន់ | news-award |
| 255 | 249 | 147 | ទេពកោសល្យ | news-talent |
| 257 | 533 | 361 | អប់រំកុមារតូច | news-children-education |
| 259 | 533 | 1072 | ព័ត៌មានអាហារូបករណ៍ | news-scholarships-news |
| 533 | 0 | 7013 | ព្រឹត្តិការណ៍ | all-news |
| 535 | 0 | 91 | បទយកការណ៍ | all-report |
| 589 | 535 | 10 | ព័ត៌មានជាតិ និងអន្តរជាតិ | report-national-and-international-education-update |
| 597 | 535 | 23 | ចំណេះជីវិត | report-life-education |
| 605 | 535 | 14 | ជំនាញ | report-skill-project |
| 613 | 535 | 17 | យុវជនឆ្នើម | report-outstdanding-youth |
| 615 | 613 | 3 | ទេពកោសល្យ | report-talent |
| 623 | 613 | 0 | ពានរង្វាន់ | report-award |
| 631 | 613 | 4 | អាហារូបករណ៍ | report-youth-scholarship |
| 639 | 535 | 21 | អប់រំកុមារតូច | report-children-education |
| 647 | 535 | 4 | ព័ត៌មានអាហារូបករណ៍ | report-scholarships-news |
| 723 | 243 | 3333 | ព័ត៌មានជាតិ | news-national-education |
| 731 | 243 | 503 | ព័ត៌មានអន្តរជាតិ | news-international-education |
| 739 | 589 | 9 | ព័ត៌មានជាតិ | report-national-education |
| 747 | 589 | 7 | ព័ត៌មានអន្តរជាតិ | report-international-education |
| 11373 | 533 | 15 | Top News | top-news |

Re-fetch to refresh (counts and any new categories change over time):

```
curl -s "https://education.ams.com.kh/wp-json/wp/v2/categories?per_page=100"
```
