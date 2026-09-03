# Project context — the portable copy

**Why this file exists.** Everything below used to live only in Claude's
machine-local memory (`~/.claude/projects/<path-slug>/memory/`), which is keyed
by the repo's filesystem path and never leaves the machine that wrote it. When
the project moved to a second computer (2026-08-06) that knowledge would have
been silently lost — not the code, which git carries, but the *operational*
knowledge: which endpoints lie, which writes lie, which host bans you.

So this is the committed copy. **Keep it in the repo, and keep it current.**
The other checked-in sources of truth are
`docs/session-log.md` (session-by-session hand-off, the deepest
detail), `docs/admin-design-system.md` (the admin's visual language — palette,
primitives, dark mode), `docs/admin/api-integration-status.md` (per-feature
tracker) and `docs/category-restructure.md` (the ព័ត៌មាន category restructure:
measured permalink/merge rules, live-tree state, the still-broken URLs and the
open decisions — **read it before moving any content between categories**).

---

## 1. The backend

WordPress at `https://infotainment.ams.com.kh` (REST base `/wp-json`), **Vodi**
theme on **MasVideos**; media on `s3.ams.com.kh`. 63 plugins boot on every REST
request, which is the entire reason the fast path exists (see §4).

**Custom plugins:**
- **AMS3E-API** (by Sak Ravuth) — the `wp/v2/web/*` endpoints the public site
  consumes. Not ours.
- **AMS Frontend API** — OURS, source at `docs/wordpress/ams-frontend-api.php`,
  **installed and ACTIVE**. Adds `tv-show-episodes`, `episode`, the
  `/hero-embed` page, the login/token endpoint, `web/featured-program`,
  `web/roles`, the `user_has_cap` program-caps grant, and the `ams_avatar`
  profile-picture field on users (1.20.0 — core has no writable avatar; 1.20.1
  also feeds it to wp-admin via `pre_get_avatar_data`). Load-bearing for the
  whole public site — touching it is riskier than touching the fast API.
- **AMS Fast Read API** — OURS, source at `docs/wordpress/ams-fast-api/`,
  **installed and DEACTIVATED ON PURPOSE** (it is hit by direct URL, so
  deactivated is how it runs). KEEP IT INSTALLED.

**Endpoints (`wp/v2/web` namespace):**
- `get-articles?page_no&page_size&category_id&date_filter` → `{status,data[],page,per_page,total,total_page}`
- `get-article-by-slug?slug` → raw object, no envelope; `post_content` is HTML
- `get-article-by-category-slug?slug&page_no&page_size` → same list envelope
- `get-author?authorId`, `advertise?ads_location=Home Page`
- `find-articles?s` — registered but **DEAD**: 403 `Native WordPress search is
  disabled.` (plain text), the same guard that kills `wp/v2/posts?search=`
- `get-entertainment-hot-news`, `get-life-style-hot-news` (2-day window, often empty)
- `tv-show-episodes?tv_show=<id>` → ordered by post DATE, never episode number
- `episode?id=<id>` → includes `run_time`, `release_date`, `video{choice,url,…}`
- `secondary-menu` — registered but DEAD, returns the HTML 404 page

**`get-articles` `date_filter` accepts only `today`** — `yesterday`/`day_before`/
`week` all 400. For date windows use core `wp/v2/posts?after=&before=`.

**MasVideos private meta** (none of it in REST — this is why our plugin exists):
`_tv_show_id`, `_episode_number`, `_tv_show_season_id` (an INDEX into the show's
`_seasons`, often wrong), `_episode_choice`, `_episode_url_link`,
`_episode_run_time`, `_episode_release_date`, `_episode_embed_content`,
`_episode_attachment_id`. On a `tv_show`: `_seasons` (serialised
`{name,image_id,episodes[]}`).

**tv_show IDs:** Obsok=14512, One-Minute-for-Health=14570, Daily Feed=84591,
The Fact=84589, Reaction=16518, Unlock-the-Life=14288, Tamchet MoMo=69616,
Greenbox=14616, Vanayeatra=14450, Studio 11=14564.

A program's `postId` and `showId` are DIFFERENT numbers and are not
interchangeable — see `src/lib/program-curation.ts`.

**Every episode video is Vimeo**, `embed_permission: public`, plays from any
origin. Real durations come from `https://vimeo.com/api/oembed.json?url=…`.

**Two live-site data bugs (verified, still true):** `_episode_release_date` is
midnight *Asia/Phnom_Penh* and Vodi formats it in UTC, so live shows every
episode one day early — format in Phnom Penh time. And `_episode_run_time` is
hand-typed and wrong on roughly half the episodes.

**Postman collection:** `docs/api/ams-infotainment-api.postman_collection.json`.

---

## 2. Reads that lie, writes that lie

These all answer with a success status while doing something other than what
was asked. Every one was measured against live production.

**Writes (measured 2026-08-06):**
- **Taxonomy cycles are coerced, not refused.** `POST /wp/v2/categories/<id>`
  with `parent` set to a descendant — or itself — answers **200** and stores
  `parent = 0` (`wp_check_term_hierarchy_for_loops`). The tree can never be
  corrupted into a loop, but a "successful" move can silently promote a term to
  top level. Guard in the UI for the user's expectations, not the data's safety.
- **Deleting a parent term does NOT delete its children** — they re-parent to
  the deleted term's own parent. Say so in any confirm dialog.
- **Renaming a term never changes its slug** (permalinks stay put). Duplicate
  names are refused at the same level, allowed under a different parent (slug
  becomes `<name>-<parent-slug>`). Khmer names give percent-encoded slugs.
- **A new menu item defaults to `menu_order = 1` — the FRONT of the menu.**
  Always send an explicit position.
- **`password` is validated against the STORED sticky flag, not the one in the
  same request** (measured 2026-08-05). `POST {status, password, sticky:false}`
  on a currently-sticky post answers **400 `rest_invalid_field` "A sticky post
  can not be password protected."** — and a rejected write loses every other
  field in the payload (title, body, categories, SEO). Unsticking has to be its
  own prior write; the identical payload then lands 200. `updatePost()` does
  exactly that.
- **`sticky` lands a beat after the rest of a write.** It lives in the
  `sticky_posts` option, so a read taken the moment `status` flips can still
  report the old sticky value. Poll for both, not just the status.
- **`menu_order` is never renumbered for you**; ties fall back to id order,
  which reads as a random swap. Write absolute 1..n positions.

**Reads:**
- **Native post search is disabled site-wide.** `wp/v2/posts?search=` returns
  the PLAIN-TEXT body `Native WordPress search is disabled.` — not JSON. Any
  harness that JSON-parses it throws. List and filter client-side.
  ⚠ **The guard is site-wide, not core-only** (measured 2026-08-07): the legacy
  plugin's own `wp/v2/web/find-articles?s=` returns the identical 403 plain-text
  body, so it is NOT a workaround. **TAXONOMY search is unaffected** —
  `wp/v2/tags?search=` and `wp/v2/categories?search=` both answer 200
  anonymously. Only POST search is dead.
  **To search article BODIES you must authenticate:** `fast.php`'s admin `posts`
  resource does `COUNT(*)` with `post_content LIKE` per whitespace-separated
  term, reachable from the admin's Articles search box or
  `/api/admin/posts?q=…` in a logged-in browser. Its REST fallback sends
  `search=` and hits the 403 above, so an error there is the fallback talking,
  never an answer.
- **`/wp/v2/posts` does NOT come back in date order by default** (measured
  2026-08-05). A plugin puts `menu_order` ahead of the date, so a post that was
  ever dragged in wp-admin rides above its timestamp — `soloeurk-ams` page 1
  returns 89344 (2023-02-27) above 89683 (2023-03-02). Adding an explicit
  `orderby=date&order=desc` reproduces true date order, and matches the fast
  path exactly. Ask for the order you want; the default is not it.
- **Core `_embed=wp:term` orders an article's categories BY NAME**
  (wp_get_object_terms' default) while every `web/*` list endpoint — and the
  fast path — emits them in TERM-ID order. Measured over 200 posts: the SETS
  always agree, the id order matches core on only 40 of them, and a plain JS
  name sort reproduces core on all 200. Whichever a surface needs, it must sort
  for itself.
- **Menus need auth even to READ.** `/wp/v2/menus` and `/wp/v2/menu-items` both
  answer 401 `rest_cannot_view` anonymously — they are an `edit_theme_options`
  surface. That is why the fast path's `pub-menu` exists.
- **`/wp/v2/users` 403s in ~25ms (pre-PHP)** for non-`list_users` callers —
  site hardening. The fast `authors` resource is the only working source.
  (The PUBLIC site reads the same list through `pub-authors` since 1.5.3.)
  ⚠ **That is the ADMIN path only.** ANONYMOUS callers read it fine (measured
  2026-08-05: 200 in ~4.2s, 40 authors with id/slug/name/description/
  avatar_urls), which is what the public author archives and the ក្រុមការងារ
  block depend on. Four of those 40 have zero published POSTS — they appear
  because core also counts published `movie`/`tv_show` rows.
- **Comments: the site has ZERO approved comments** (`X-WP-Total: 0` site-wide,
  measured 2026-08-05) and comments **auto-close on older posts** — a 2021 post
  answers `403 rest_comment_closed`, while posts back to at least Dec 2024
  still accept them. `ping_status` is open on every post sampled, which is why
  a comment COUNT must filter `comment_type IN ('','comment')` (what REST
  counts) rather than read `wp_posts.comment_count` (which counts pingbacks
  too). Nothing in REST exposes a comment count on the post object: the number
  only exists as the `X-WP-Total` header of a `wp/v2/comments?post=` query.
- **Category by SLUG aggregates descendants; by ID matches direct assignments
  only** (7,660 vs 7,737 for entertainment-news).
- **No view count exists anywhere in REST** — `orderby=views` is rejected. The
  "popular" tile comes from the `wordpress-popular-posts` REST API.
  ⚠ **But a DAILY view timeline does exist — in SQL, not in REST** (measured
  2026-08-05). `wp_popularpostssummary` carries `view_datetime` + `pageviews`
  per post per day, so the fast path can group it by day; the WPP REST API
  cannot, which is why `dashboard.ts` used to claim no series was possible.
  **Retention is over a year** (top story: 604 views at 7 days, 2,745 at 30,
  2,745 at 90, **15,900 at 365**). The constraint is COST, not history: the
  365-day aggregate took **57 seconds**, and the 30-day top-5 already costs
  ~2.6s, so every window is clamped to 7/30/90 and memoised for 5 minutes.
  Analytics are safe to cache where post rows are not — drift-only, identical
  for every viewer, no read-your-writes contract.
- **Category links are STORED DATA, not a rule.** 23 of 26 are hand-entered
  Custom Permalinks in the `custom_permalink_table` option, keyed by path with
  `['id' => term_id]` values. Not derivable from slugs, ever.
- **Menu ICONS live in `_thumbnail_id`** (measured 2026-08-06), and are
  WRITABLE since ams-frontend-api **1.7.6** registered that key for
  `nav_menu_item` alone behind an `edit_theme_options` auth callback. Scope
  matters: `_thumbnail_id` is the core featured-image key, so an unscoped
  registration would open the featured image of every post type. Measured
  after deploying: a non-attachment id is coerced to `0` by the sanitizer, an
  unknown size falls back to `full`, and an ordinary title or `menu_order`
  write does NOT clobber the icon. The menu-image
  plugin stores the icon as the menu item's FEATURED IMAGE — a core key,
  outside the `_menu_item_*` namespace. `_menu_item_icon` also exists on every
  row and is EMPTY: it is the icon-*class* field, and it is exactly what a
  guess-by-name lands on. The companion key `_menu_item_image_size` names the
  rendition the live theme renders (`menu-36x36`, `menu-48x48`, `full`) and
  must be honoured, or a 36px slot loads the original — one icon's original is
  a 2251×2250 JPEG. Note a size NAME is a bounding box, so `menu-36x36` on a
  portrait image yields a file named `-21x36`.
- **A program can be BOTH a movie and a tv_show post** with the same title and
  the same percent-encoded Khmer `post_name` (e.g. ស្ថាបត្យកម្មសកល = movie
  221836 + tv_show 221840). REST and the fast path agree on `slug` exactly —
  both return the raw percent-encoded `post_name` — so the disagreement is
  never between the two read paths; it is between `post_name` and the
  human-readable Custom Permalink (`/tv-show/global_architecture/`). A menu URL
  therefore does NOT reduce to a registry slug, which is what CURATED_PROGRAMS'
  `wpHref` is for.

---

## 3. Hosting and deployment traps

- **The WP host BANS IPs after heavy REST probing.** It happened twice
  (2026-07-31): TCP-level timeouts on the whole domain while mobile data worked.
  **Keep probe volume gentle.** Space out timing loops.
- **The host swaps 4xx response BODIES for HTML error pages.** This is why
  `fast.php` returns failures as HTTP 200 + `ok:false` + status-in-body (auth
  stays a real 401).
- **Hosting is the company's own Dokploy since 2026-08-07, NOT Vercel** —
  `https://edu.amscloud.cc`, panel at `deploy.amskh.co`, repo `AMS3E/…`, shipped
  as a Docker image, autodeploys on push to `main`. Vercel is taken down, and with
  it the Bot-Protection 429 that used to force headless Chrome for every public
  check: **plain `curl` works against the site again.** The box is shared with
  `revive-ads`/`revive-db` and is tight — 12.2 of 15.6 GiB RAM used, disk 86%.
- **A WRITE that takes minutes is `ams-cache`, not WordPress.** Its
  `scm_preload_critical_urls()` re-warms the cache by fetching ~978 URLs over
  HTTP, synchronously, inside the write request. `ams-frontend-api` ≥1.9.0 removes
  its four callbacks for requests carrying `X-AMS-Token`, which took a delete from
  97s to 4.9s. **Check `X-AMS-Cache-Preload: skipped:4` on any write response
  before believing a write is slow again** — fewer than 4 means the plugin moved a
  hook. Measure with `docs/wordpress/ams-write-probe` (per-callback timings), and
  read session-log Session 23 §3 first.
- **A REST call costs ~3.9s no matter what, and OPcache is OFF** (`fast.php`
  diag: `"opcache": false`), so PHP re-parses all 62 plugins every request. That
  floor is per CALL, so an admin action making N calls pays it N times.
- **wp-admin's Plugin File Editor CANNOT save** — the site's loopback request
  fails and reverts the change. Deploy via **Plugins → Add Plugin → Upload
  Plugin → Replace current with uploaded**.
- **WP-Cron NEVER FIRES, so a scheduled post never publishes. MEASURED
  2026-08-11**, not inferred — it had been written here as a deduction from the
  loopback failure above and nobody had tested it. The probe
  (`scratchpad/cron-probe.mjs` pattern): create a post with `status=future` and
  `date_gmt` two minutes out, poll every 20s, force-delete after. Result: still
  `future` **266 seconds past its own fire time**, 16 polls, no transition.
  Not a quiet-site false negative — WordPress runs `wp_cron()` on `init` and
  the probe's own 16 REST calls each triggered that, so the spawn was attempted
  and failed every time. Cleanup verified (delete 200, re-fetch 404).
  Consequence: **scheduling cannot be offered until a trigger lives OUTSIDE
  this server.** An inbound request from the internet is a normal request, so
  the broken loopback does not block an external scheduler.
- **Plugin zips are gitignored** (`docs/wordpress/*.zip`) — they do NOT exist on
  a fresh clone. Rebuild with `powershell docs/wordpress/build-fast-api-zip.ps1`
  before any upload. Same filename every time; ALWAYS bump the version.
- **Windows dev wedge:** recurring "Jest worker … child process exceptions"
  500s are Turbopack worker spawn failing, worse with orphaned node processes.
  Fix: kill all node, delete `.next`, ONE fresh `npm run dev`.

---

## 4. The fast read path, in one paragraph

WP REST costs ~4s per call because 63 plugins boot. `docs/wordpress/ams-fast-api/fast.php`
runs under `SHORTINIT` (database layer only, no plugins/theme/hooks/REST) and
serves the same data 13-48× faster by direct SQL. All nine admin read screens
and every public LIST read go through it, each with an automatic fallback to WP
REST, so an outage degrades to "slow" and never to "broken".

**`pub-` resources are UNAUTHENTICATED on purpose** — published content only,
byte-for-byte what wp-json already serves anonymously. The prefix IS the
security boundary: it is checked in one place, `pub-` dispatches BEFORE any user
is loaded, every `pub-` query hardcodes `post_status='publish'` plus a per_page
ceiling, and `pub-menu` takes its menu from an allow-list rather than a free
parameter. **Never give a resource carrying user data a `pub-` name.**

Public resources today: `pub-articles` (1.3.0 — every list read, including the
author archives since 1.5.2 via its `author=` filter), `pub-categories` and
`pub-programs` (1.4.0), `pub-menu` (1.5.0/1.5.1), `pub-comment-counts` (1.5.2),
`pub-authors` (1.5.3).

**`pub-authors` is the ONE resource serving user rows** — read its header note
in fast.php before touching it. It emits four fields (id, slug, name,
description) and deliberately NO avatar: core's `avatar_urls` is an md5 of the
author's email, and nothing on this site renders it (every Gravatar is unset;
the landing block pins its own portraits in `TEAM`), so `AuthorProfile.avatar`
was deleted rather than reproduced. Who counts as an author is core's rule
translated — `has_published_posts` over the REST-enabled post types, pinned
because SHORTINIT has no type registry. Uploading media does not make an
account public: `attachment` is on that list but attachments are
`post_status='inherit'`, never `publish`.

**What cannot move to the fast path, settled by measurement:** the ARTICLE BODY.
Of the newest 2,000 posts, 1,999 carry Gutenberg block delimiters and ZERO are
plain HTML; `content.rendered` is `the_content`/`do_blocks()` output and **no
filters run under SHORTINIT**. Do not re-litigate without a new measurement.

**SHORTINIT traps:** `get_option('category_base')` and `('tag_base')` THROW —
`default-filters.php` (loaded) hooks `_wp_filter_taxonomy_base`, which lives in
`rewrite.php` (not loaded). Read such options RAW via `$wpdb`. `home`, `siteurl`
and `upload_url_path` carry no such filter and are safe.

**Diagnostics, no auth, read-only:**
`/wp-content/plugins/ams-fast-api/fast.php?r=diag&k=e17e37f1c180b631050c637c3a7e0713`
Appending `&k=<that key>` to ANY resource makes the dispatch catch report the
exception class, message and file:line — one probe instead of a blind deploy.

**Offline tests:** `php docs/wordpress/ams-fast-api/tests.php` (146 assertions,
no server or database needed).

---

## 5. Framework gotchas

This is a **modified Next 16** — read `node_modules/next/dist/docs/` before
writing Next code (`AGENTS.md` says the same, and means it).

- `params` / `searchParams` are Promises; `cookies()` is async.
- Middleware is `proxy.ts`, not `middleware.ts`.
- `fetch` is NOT cached by default — always pass `next: { revalidate, tags }`.
- `revalidateTag(tag, profile)` requires 2 args in route handlers;
  `updateTag` is action-only.
- `cacheComponents` is OFF → classic ISR model. **So there is NO Partial
  Prerendering**, and the consequence bites: wrapping a request-time read
  (`searchParams`, `cookies`, `headers`) in `<Suspense>` so the rest of the route
  prerenders around it is PPR, and PPR ships only with `cacheComponents: true`.
  Here, touching `searchParams` ANYWHERE in the tree makes the whole route
  dynamic regardless of where the boundary sits — a Suspense boundary buys
  nothing. Next 16's caching guide describes the shell-plus-stream behaviour only
  under its Cache Components heading; that is how to tell the two models apart.
  The classic-mode escape hatch is `useSearchParams()` in a CLIENT component
  inside Suspense (which client-renders that subtree), or — usually better here —
  put the value in the URL PATH: the homepage, category and author pagers all use
  `/page/N` segments for exactly this reason.
- `loading.tsx` wraps ALL nested routes below its segment, and once its fallback
  flushes a later `notFound()` can only return 200 + `noindex`. **So HTTP status
  cannot tell you whether a public route resolved.** Calibrate on a known-good
  and a known-missing path in the same run and compare the BODY: a real
  `/program/<slug>` is ~500-770KB with no `robots` meta, while the not-found
  body is ~151KB with `<meta name="robots" content="noindex">`. (The page title
  is not a reliable signal on its own — a missing program can still render its
  title while the page body 404s.)
- **Next caches the HTTP-200 `ok:false` failure bodies `fast.php` emits** for
  the full revalidate window. After a plugin outage or upgrade, cold-start
  `.next` in dev to re-probe.
- **A leading space before a newline in JSX renders differently server vs
  client** and causes a hydration mismatch (`</strong>They` vs `</strong> They`).
  Use an explicit `{" "}`.
- React Compiler is on: no `setState` during render, no ref writes during
  render, no prop-syncing effects (use a `key` to reset state instead).
- **Panda emits into `@layer utilities`; third-party stylesheets are UNLAYERED,
  and unlayered rules beat layered ones at ANY specificity.** So `css({ "&
  .some-vendor-class": … })` silently loses to a single-class vendor rule. To
  override a package's CSS (WordPress's block editor, here), use a plain `.css`
  file imported after it — see `gutenberg-overrides.css`. Panda's own rule was
  emitted, matched, and still lost; only the layer explains it.
- **`overflow-x: visible` computes to `auto` whenever `overflow-y` is not
  visible** (CSS spec). Overriding one axis of a vendor's `overflow: auto
  hidden` therefore looks like the override never applied — DevTools shows your
  rule winning while `getComputedStyle` still says `auto`. Override the
  shorthand.

---

## 6. Deploy configuration — the parts that fail SILENTLY

Frontend env (**Dokploy → the app → Environment**; all optional, since every
getter has a fallback): `API_BASE_URL`, `NEXT_PUBLIC_WP_ORIGIN`,
`REVALIDATE_SECRET` (must match the WordPress "publish" webhook's secret in
Settings → Frontend Cache — set 2026-08-10; configured but not yet proven by a
real publish, and a wrong secret is indistinguishable from an unset one from
outside: both 401).

**`NEXT_PUBLIC_*` cannot live in that tab.** They are inlined into the client
bundle by `next build`, so they go in **Build-time Arguments**, and every one of
them must carry a non-empty value — the getters use `?? "fallback"`, and `??`
does not catch `""`.

**`PRERENDER_PUBLIC` is a Build-time Argument too, and defaults to `0` (OFF).**
Public build-time prerendering is disabled: `generateStaticParams` returns `[]`
on all seven param'd public routes, so `next build` renders 32 pages instead of
267 and static generation takes ~4s instead of dying. It was turned off after
the 2026-08-19 deploy failure — the box (12.2/15.6 GiB RAM, shared with
revive-*) cannot afford 7 render workers over 267 pages, and the tell was that
the pages which timed out first were the FAST-PATH-ONLY routes whose whole
backend cost is 0.36s. That is starved workers, not a slow WordPress. Nothing
about runtime behaviour changed: every route is still ISR with `dynamicParams`
on. Set `PRERENDER_PUBLIC=1` to restore it — **in Build-time Arguments, not the
Environment tab**, which configures the container and would silently do nothing.
Full reasoning in `src/lib/prerender.ts`.

Two WordPress-side allow-lists gate the frontend, and **both fail as "the
feature is just broken" with nothing in the logs pointing at them**:

- **The hero iframe needs the frontend origin in `ams_afa_embed_origins()`**
  (the `frame-ancestors` header) in the AMS Frontend API plugin. Done for
  `localhost:3000` and the old Vercel domain — **NOT for `edu.amscloud.cc`, so
  the hero is blank on the live site right now** ("refused to connect" in the
  iframe). Parked by the owner on 2026-08-10. Edit the LIVE plugin (the repo copy
  is source-only) and clear AMS Cache afterwards — that clear IS needed here,
  because the header is baked into cached HTML.
- **Any client-side fetch needs the origin in the AMS3E-API plugin's CORS
  `$allowed_origins`.**

**Hero specifics:** it is a Slider Revolution slider embedded via `<iframe>` at
`/hero-embed` rather than reconstructed, because the banners are flat image
layers with no text or data to model. Each landing has its OWN slider alias —
home=`homepage-2` (id 603), celebrity=`entainment-home-page-1`,
life-style=`cover-animation-11` — passed via `?alias=` (whitelisted in the
plugin; `AMS_AFA_HERO_ALIAS` is the default).

**Known hero bug, deliberately deferred (owner: "fine for now"):** `HeroEmbed`
renders the iframe at `height:0` until a `postMessage` arrives, but the WP page
posts its height on load, on resize, and on an interval that **stops after 20
ticks × 400ms = 8 seconds**. The parent attaches its listener in a `useEffect`,
so every message sent before hydration is dropped. If hydration lands after
that window the hero stays 0px until a resize or reload — so, counter-
intuitively, *the faster WordPress loads, the more likely it breaks*. The fix is
CSS-first: the slider's own config (`gw:[1840,1840,1024,778,480]`,
`gh:[650,650,400,350,600]`, breakpoints `[1240,1024,778,480]`) makes the height
a pure aspect ratio per breakpoint, so the space can be reserved with no JS and
`postMessage` demoted to a late correction.

## 7. Owed to WordPress (not frontend work)

- **Two Khmer category-term typos, still live.** `ភាពយន្តនិងតន្រ្តី` has its
  coeng subscripts swapped (the menu has the correct `តន្ត្រី`), and
  `វប្បធម៌ ប្រពៃណី` / `វប្បធម៌ប្រពៃណី` differ by a space across the news and
  reports trees. Our nav renders term names verbatim **on purpose**, so these
  surface on the site — fix them in WordPress, not in a mapper.
- `wp/v2/web/secondary-menu` is registered but dead (returns the HTML 404 page).
- WP-Cron never fires, so scheduled posts never publish — measured, see §3.
- **ស្ថាបត្យកម្មសកល's movie post (221836) has the WRONG `_khi_tv_show_id`:**
  196771, which is ជ្រុងមួយនៃភ្នំពេញ's tv_show. Measured — 196771 returns 13
  Phnom Penh episodes, its real show 221840 returns its own 2. The frontend now
  pins the right `showId` in CURATED_PROGRAMS, so the site is correct, but the
  meta is still wrong in WordPress and will mislead anything else that reads it
  (it also makes the movie row collide with jroung's showId in our registry
  dedupe). Fix it on the program's edit screen.

## 8. Open frontend follow-ups

Small, none blocking: delete the dead hero files (`HeroCarousel`, `HeroSlide`,
`hero-banners.ts` — nothing imports them); make `Pagination` actually route (it
is decorative today, so category pages show 11 of thousands); decide banner
click behaviour (new tab vs in-app nav); wire real ads through the `advertise`
endpoint (only 2 junk ads exist there today); add the custom domain to
`frame-ancestors` once acquired; tokenize the hardcoded caption hexes in
`PopularProgramsBand`.

## 9. Working agreements

- **No `Co-Authored-By: Claude` trailer** on commits. (The history was rewritten
  once already to strip them.)
- **`origin` is an SSH ALIAS, never plain `git@github.com:`** — and the alias
  name is per-machine (`github-personal` on the first computer,
  `github-second` on the second). Two GitHub accounts share these machines,
  each with its own key; plain `github.com` can authenticate as the wrong
  account and make a private repo report "Repository not found". If a push
  fails that way, check `git remote -v` against `~/.ssh/config` before
  assuming the repo is missing.
- **Site search is deliberately deferred** (AUDIT.md Tier 2 §10). Do not build
  it; the owner will ask.
- **The owner hand-deploys everything server-side.** Give numbered, literal
  clicks — never assume a plugin was uploaded.
- **Writes stay on WP REST.** The fast path is read-only.
- **Verify against REST before wiring anything.** Invariant first (one that does
  NOT consult the diff target), then field-by-field, and diff the value AFTER
  the frontend transform. Classify every divergence rather than "fixing" it.
- **Any test that mutates production must clean up AND assert the restore.** A
  menus harness that skipped the assertion left two junk items in the LIVE
  navigation strip.
- Standing decisions, don't revisit: OPcache parked; the three orphan program
  pages stay; the Vercel "Allow WP revalidate webhook" rule is load-bearing;
  media serves the whole library to every role.
