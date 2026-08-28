# The ព័ត៌មាន category restructure — state + playbook

As of **2026-08-24**. The restructure was executed directly on LIVE WordPress
on 2026-08-21 in a session that wrote no session-log entry (it was WP-side
work, not repo work), so this doc is the portable carrier of that state —
machine-local memory does not follow the repo to another computer. Read this
whole file before moving ANY content between categories on this site.

---

## 1. The measured rules (all measured on this install, 2026-08-21)

1. **Any category change rebuilds the article's URL.** Not just a post save:
   `wp_set_object_terms()` alone does it — `post_modified` stays untouched but
   the URL still moves (measured: post 219661 went `/movie-and-music/news/…`
   → `/entertainment/news/…` the moment category 960 came off). There is no
   way to re-file an article here without its URL moving, **except** the
   stored-permalink case below.
2. **Stored vs computed permalinks.** Posts WITH a `custom_permalink` meta are
   genuinely frozen (208433 still serves a category deleted years ago); posts
   WITHOUT one compute their URL at read time from the winning category. The
   **Diagnose tab** of the ams-category-merge plugin (§2) counts stored vs
   computed for a category, read-only — run it before promising anything
   about URL stability.
3. **The rebuild picks the DEEPEST assigned category, ties broken by Khmer
   name order.** បំណិនជីវិត (Life Tips, **956**, ~9,534 posts, used by the
   editors as a catch-all) sorts before ព័ត៌មានកម្សាន្ត and wins every tie —
   this is the root of the 77% finding (§5).
4. **Admin Bulk Edit REPLACES the category set** — it does not append.
   Measured: ticking 6913+957+959 on posts that were `[957, 6913, 960]`
   produced `[957, 959, 6913]`. And Bulk Edit re-saves every post (rule 1),
   so it rewrites every URL. **Never bulk-edit a merge here.**
5. **Redirects: never predict the new URL — hand WordPress the bare slug.**
   Redirection plugin rule: Source `^/old-prefix/(.*)`, Regex ON, Match =
   "URL and WordPress page type" (fires only on a real 404), 301, Target
   **`/$1`**. WP's canonical resolver then finds the post wherever it lives —
   destination-agnostic, 2 hops, verified against both destinations. A fixed
   target like `/entertainment/news/$1` breaks for the 77%.
   **Verify rules with a made-up slug** (`/prefix/zzz-test-1234`): real URLs
   return stale 200s from the page cache, which ignores query strings, so
   cache-busting does not work.
6. **Batch ~50 posts/request** — the host 504'd on a 5-article Bulk Edit.
   Snapshot the affected posts' `link` values via REST before any run, diff
   them after.

## 2. The tool: ams-category-merge

**Source: `docs/wordpress/ams-category-merge/`** (v1.1.0, Author: Soth
Kimleng), **installed on live WP** → Tools → Category Merge. Adds/removes a
category across many posts via `wp_set_object_terms()` (no post save),
batched, and logs every post it touches so a run can be reverted with one
click. Plus the read-only Diagnose tab (rule 2). The plugin's header comment
block repeats the measured rules.

Rebuild the zip with `docs/wordpress/build-category-merge-zip.ps1` — plain
`Compress-Archive` writes backslash entry paths that PHP's unzip cannot read.
Upload through wp-admin's plugin-zip upload; if anything goes through the
aaPanel file manager instead, set owner `www` / perms 644 or WP updates fail.

## 3. Live tree now (built 2026-08-21, re-verified 2026-08-24)

```
ព្រឹត្តិការណ៍ [6913]              /category/all-news/               915
  ព័ត៌មាន [957]                   /entertainment-news/            7,702  ⚠ BROKEN (§4)
    ព័ត៌មានកម្សាន្ត [959]           /category/entertainment/news/   7,053
    ព័ត៌មានប្លែកៗ [963]             /category/strange/news/           608
    ព័ត៌មានសង្គម [7325]            /category/social/news/              0
    វប្បធម៌ ប្រពៃណី [6915]          /category/culture/news/            32
    ភាពយន្តនិងតន្រ្តី (កុំប្រើ) [960] /category/movie-and-music/news/ 1,124  kept, hidden
```

Reports side: **980** renamed ព័ត៌មានកម្សាន្ត and moved to
`/category/entertainment-news/reports/`; **972, 981, 984 untouched** — the
owner chose to skip the rest of the reports mirror.

## 4. What shipped, and what is still broken

Shipped 2026-08-21: all renames + ព័ត៌មានសង្គម [7325] created; **the 960→959
merge is complete** (all 1,124 posts from 960 are also in 959, verified zero
strays; 960 NOT deleted — renamed `(កុំប្រើ)` and dropped from the menu, which
avoided an archive redirect and kept ~25 hardcoded
`/category/movie-and-music/news/` links in landing pages working); landing
page 87221 retitled and moved `/celebrity/` → `/entertainment/`; 3 regex
redirects live and verified, all targeting `/$1`
(`^/movie-and-music/news/(.*)`, `^/entertainment-movie-and-music-news/(.*)`,
`^/celebrity/news/(.*)`).

**Still broken on production** (re-measured 2026-08-24, fixes spec'd, owner
deferred them mid-session — this is THE next step):

| URL | state | fix |
|---|---|---|
| `/category/news/` | 404 | set 957's Custom Permalink to `category/news` |
| 957's archive | unreachable — its permalink `entertainment-news` collides with PAGE 16116, and the page wins | same fix |
| `/celebrity/` | 404 | redirect → `/entertainment/` |
| `/category/celebrity/news/` | 404 | redirect → `/category/entertainment/news/` |
| `/category/entertainment-news/news/` | 404 | redirect → `/category/news/` (after the 957 fix) |
| `/category/celebrity/reports/` | 301s to `/category/reports/` (wrong term) | redirect → `/category/entertainment-news/reports/` |

Order: the 957 Custom Permalink first (unblocks two rows), then the four
redirect rules (§1 rule 5 pattern, fixed targets are fine for these four —
they are single-page moves, not slug families... except keep `/$1` thinking
in mind if any of them turns out to cover a family).

## 5. The finding the boss needs to hear before any further merges

**~77% of the 1,124 merged articles now serve from
`/life-style/life-tips/news/…`, not `/entertainment/news/…`** — they are also
filed in បំណិនជីវិត [956], which wins the deepest-category tie-break (§1
rule 3; 384 of 500 sampled posts in 960 are also in 956). Nothing 404s — the
`/$1` redirects resolve either destination — but the boss-facing proposal
stated no URLs would move, and they did. Raise this before ANY further
category moves; the same tie-break hits every future merge. Fixing it means
removing 956 from those posts, which moves their URLs *again*.
Proposal artifact (partly superseded):
https://claude.ai/code/artifact/4c347f7a-a8bb-4d23-b470-51013cb97b84

## 6. Open decisions (owner's, deferred 2026-08-24)

- **960 `(កុំប្រើ)`: rename, don't delete.** The suffix leaks into live
  article bylines. Recommended: drop the suffix from the NAME, move the
  warning into the description; never hide it from the category picker
  (unrendered terms get dropped — the Bulk Edit bug). Deletion needs the
  1,124-post ID export + WP-side ភាពយន្ត block fixes first, and is entangled
  with the page 16154 decision.
- **The MOBILE menu ("AMS Infotainment Mobile") is a pre-existing swamp** —
  TWO stale celebrity links under ព័ត៌មានកម្សាន្ត (news AND reports),
  studio11/reaction 404s, old structure throughout. The desktop/primary menu
  is ALREADY fixed (បទយកការណ៍ → `/category/entertainment-news/reports/`,
  ភាពយន្តនិងតន្រ្តី out, សង្គម in). Reconciling mobile with desktop is a
  separate decision.
- Retitle page 16116 → ព័ត៌មាន and 16156 → ព័ត៌មានប្លែក; drop the ៗ from
  category 963; page 16154 `/movie-and-music` is still live and needs a call.

## 7. This repo's stake

The WP site's landing pages hardcode ~25 `/category/movie-and-music/news/`
links that keep working only because 960 was renamed rather than deleted.
This repo queries WordPress **by slug** today, so renaming a category SLUG
(none were renamed in this round — only names and permalinks) would break the
frontend's `/category/[...path]` routes and data fetches; the planned
migration to `get-articles?category_id=…` (IDs, not slugs — captured in
`docs/api/ams-by-page.postman_collection.json`, not yet in code) is what
makes the frontend immune to future slug surgery. Check that assumption
against the current code before relying on it — this paragraph is the one
part of this doc written from memory rather than measurement.
