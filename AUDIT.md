# Gap audit — our clone vs https://infotainment.ams.com.kh/

> **STATUS: Sessions A and B+C are done** (A: 2026-07-14, B+C: 2026-07-14 evening), **plugin 1.5.0
> is uploaded and verified on live** (2026-07-15), and the **sort tie-break is fixed in AMS3E-API
> and verified** (2026-07-15 — it was ID *ASC*, not DESC; see NEEDS WORDPRESS). Tiers 1–4 and the
> frozen-page data fixes are closed. All that remains: **search** (§10, deliberately deferred by
> the owner), the **listing feed-shape decision** (Tier 4, owner's call), the episode-carousel
> `menu_order` eyeball (WP admin, human task), and adding the production domain to
> `ams_afa_embed_origins()` on deploy day. Three findings below were WRONG and are corrected in
> place — read `SESSION A CORRECTIONS` before trusting a number in this file.

Structural audit: fetched HTML + REST probes on both sides. No browser was available, so nothing
here is a pixel comparison — every finding is proved in markup, routes, or API payloads, and the
few that need a human to look are marked as such.

Run 2026-07-14 by six parallel auditors (home, landings, listings, article, programs, chrome/routes)
against a local dev server on :3000.

**How to use this file:** it is the brief for the fix sessions. Read it before touching the code.
Section order is priority order. `CORRECTIONS` and `DECISIONS` override anything a code comment in
the repo tells you — several of those comments are wrong, which is how some of these gaps survived.

---

## SESSION A CORRECTIONS

Three numbers in the original audit were wrong. All three were re-derived from live's markup during
Session A; the code follows the corrected values, not the ones written below.

**The landing program band is 15, not 17.** The auditor's count included the two `section-featured-movie`
banners (ចង់ដឹងរឿងគេ and បើកសោជីវិត) that sit *below* the band and that we already render as
`VideoFeatureStrip`. The band itself is 15.

**The list of programs missing from the carousel was wrong.** It named វនយាត្រា and បើកសោជីវិត (neither
is in the carousel) and omitted ១នាទីដើម្បីសុខភាព, Studio 11 and អផ្សុក (all three are). The truth is
simpler than the list suggests: **every poster slot on the site is a PREFIX of one ordered 20-program
list** — 8 ⊂ 9 ⊂ 15 ⊂ 18 ⊂ 20 — which is now how `navigation.ts` models it. Note វនយាត្រា has both a
`movie` post (20275, which owns the poster) and a `tv_show` post (14450, which owns the episodes).

**The article sidebar widgets are fed from the wrong SOURCE, not just under-filled.** Tier 3 logged
them as 3-vs-5 count bugs. They are the same root cause as §4: each is scoped to its own category on
live — រសជាតិ ← `life-style-travel-news` (the heading is editorial and names no term, which is why
nobody caught it), ស្នេហានិងទំនាក់ទំនង ← `life-style-love-and-relation-news`, ភាពយន្ត ←
`entertainment-movie-and-music-news`. Fixed as part of §4.

Two things the original audit got exactly right and that are worth keeping: live's article breadcrumb
really is a 4-level chain, and the reason ours was broken is that the article endpoint returns
categories **unordered** ([section, root, topic] for a `culture` post) — so `cats.slice(0, 2)` picked
the content-type root and dropped the topic. It is sorted by taxonomy depth now.

---

## CORRECTIONS TO PRIOR BELIEFS

These were believed true and are false. Code comments in the repo still assert some of them.

**The ▶ video gap does NOT need a WordPress change.** It was logged for weeks as blocked on the CMS.
The premise ("`/wp/v2/web/program` returns no video field") is true but irrelevant: **live's program
page has no trailer either — it plays the show's default episode.** The theme inlines
`var khiWatch = {restUrl, showId, initialSeason, initialEp}` and calls

    GET /wp-json/wp/v2/khmer-insider-episode?show_id=<id>[&ep=<id>][&season=<n>]

Public, no auth. Returns `video_html` (a ready `<iframe data-provider="vimeo">`), `description_html`,
`episode_list_html` (runtime + Added date per row), `season_dropdown_html`.
Per-episode video is also on `/wp/v2/web/episode?id=<epId>` → `video.url` — which is exactly what our
**already-working** episode player uses. All 20 shows are Vimeo; nothing uses YouTube.

**The មាតិការសនិយម tabs are NOT dead on live.** The comment on `MATIKA_LINKS` in
`src/lib/landing-data.ts` says they point at a dead `/home/#`. They are working jQuery tabs:
`ul#tabs-nav` + 4 `div.tab-content` panels, 4 articles each. See Tier 1 §6.

**The homepage sections on our episode page are NOT "how the live episode page is built."** The
comment in `src/app/program/[slug]/[episode]/page.tsx` claims they are. Live's episode `<main>` is
2.6 KB with 148 characters between `</main>` and `<footer>` — no homepage furniture at all. (The
sections stay anyway — see DECISIONS — but fix the comment, it is asserting something false.)

**We DO have an episode route** (`/program/<slug>/<episode>`), and it renders a working Vimeo player.

---

## TIER 1 — highest value, mostly cheap  ✅ ALL DONE (Session A)

### 1. Articles have no social metadata. Every share renders blank.
`generateMetadata` in `src/app/article/[slug]/page.tsx:30` returns `{ title }` and nothing else.
No `og:*`, no `twitter:*`, no `<link rel=canonical>`, no `article:published_time`, no JSON-LD. The
meta description falls back to the site-wide default on every article — so a share to Facebook or
Telegram gets no image, no headline, and generic copy. For a media site this is the most expensive
bug on the list.
Live emits 2 JSON-LD blocks (NewsArticle, WebPage, BreadcrumbList, Organization, Person).
All the data is already in `getArticle()`. **Fix: our code.**

Related, same fix: our breadcrumb is 1 crumb where live builds a 4-level chain, and we have the data
(`article.categories` holds 3 entries).

### 2. The footer is entirely decorative — 22 dead links on every page.
Every `href` in `SiteFooter.tsx` is `"#"`. Nothing was *dropped*: three columns, headings and link
counts all match live. It is purely unwired. The six social icons are worse — `<span>` with
`cursor: pointer`, so they look clickable and are not.

Live targets:
- **Col 1:** `/celebrity/`, `/movie-and-music`, `/strange/`, `/life-style/travel/`,
  `/life-style/health-and-beauty/`, `/life-style/life-tips/`
- **Col 2** (external AMS network): `education.ams.com.kh`, `economy.ams.com.kh`,
  `ams.com.kh/khmercivilization`, `/central`, `/sports`, `/tv11` (AMS Radio is `#` on live too)
- **Col 3:** `/advertising/`, `/contact/`, `/question/`, `/jobs/`
- **Bottom bar:** `/privacy-policy/`, `/terms-conditions/`, `/cookies/`
- **Socials:** facebook.com/amsinfotainment · twitter.com/InfotainmentAms ·
  instagram.com/amsinfotainment/ · tiktok.com/@ams_infotainment · t.me/ams_infotainment ·
  youtube.com/channel/UCWvKOoS8D7ugdTfciCYYswg

### 3. …but 7 of those footer targets are pages we don't have.
`/advertising/`, `/contact/`, `/question/`, `/jobs/`, `/privacy-policy/`, `/terms-conditions/`,
`/cookies/` — all 200 on live, all 404 on ours.
All seven are plain WordPress pages, so **one** dynamic route reading `/wp/v2/pages?slug=<x>` and
rendering `content.rendered` covers the lot.
**Ship §2 and §3 together** or you trade 22 dead `#`s for 7 dead 404s.

### 4. Blocks fed from the wrong source — one root cause, three places.
Several blocks slice one generic feed instead of querying the category their heading names.
- **Home របាយការណ៍ថ្មីៗ (Latest Reports)** — `home-data.ts` builds it as `feed.slice(5, 9)`: the next
  four items of the same feed that already fills Daily Events. **Zero of four items match live.** The
  block's own "see all" correctly points at `/category/reports`, so the heading and the data
  contradict each other. Verified fix:
  `get-article-by-category-slug?slug=reports&page_no=1&page_size=4` returns live's exact four, in order.
- **Category-listing sidebar, all three widgets** — `articles.ts:222` does `recentRefs(9)` then
  `.slice(0,3) / .slice(3,6) / .slice(6,9)`. So widget 1 ("this category's latest") renders the same
  global recents on *every* listing; widget 2 ("reports") is leaking news articles; widget 3
  ("popular") is just more recents. Widgets 1 and 2 are our code. Widget 3 may need WordPress —
  live's ordering varies per page in a way that looks view-count driven, and REST exposes no such field.
- **Home lifestyle cards** — render `{d.date}` in the slot where live renders a clickable category link.

### 5. Article share buttons are dead.
`ArticleShareSection.tsx:32` renders `<span role="button">` — no `href`, no `onClick`, and the file
has no `"use client"`, so no handler can ever attach. The label list is a byte-for-byte copy of
live's, so this was clearly meant to work.

### 6. Topic landing pages render the same feed twice, side by side. *(we introduced this)*
On all nine topic pages, the អត្ថបទថ្មីៗ column and the ប្រធានបទពេញនិយម ranked list immediately beside
it contain the **same articles in the same order** — both read `slug: "all-news"` in
`landing-data.ts` (`recent` size 8, `popular` size 7). Byte-identical across all nine.
Live's អត្ថបទថ្មីៗ varies per topic (7 distinct sets across 7 pages) and carries 10 items.
**Fix:** point `recent` at the page's own term, size 10.

### 7. មាតិការសនិយម is a 4-tab widget on live; we render one tab's worth. *(our comment was wrong)*
Live: `ul#tabs-nav` + four panels (ស្នេហានិងទំនាក់ទំនង / សុខភាពនិងសម្រស់ / ទេសចរណ៍ / បំណិនជីវិត), four
articles each = 16, switching in place.
Ours: four `<Link>`s that **navigate away** to those topics' landing pages (the first is orange, so it
reads as an active tab), showing only the love-and-relation feed's four articles. **12 of 16 articles
are never fetched.**
Source: `matika: { slug: "life-style-love-and-relation-news", size: 4 }` + `MATIKA_LINKS`; rendering
in `SectionHeader.tsx:50-66`.
**Fix:** fetch all four topic feeds; make the tabs switch client-side.

---

## TIER 2 — structural  ✅ DONE (Session B+C) — except §10 search, deferred by the owner

As shipped: §8 needed **no WordPress change after all** — core `wp/v2/posts?after=&before=` serves
the yesterday / day-before buckets, term-scoped (trimmed with `_fields` to stay under Next's 2 MB
data-cache ceiling). §13's fix (`ScriptedHtml`) also un-broke the /contact form. §14's `?alias=`
and slide-click forwarding ship in plugin 1.5.0 — the iframe falls back to today's behaviour until
that is uploaded.

### 8. Daily-events day tabs are inert; two thirds of the data is never fetched. *(home AND landings)*
Live: three tabs — today / yesterday / day-before — five articles each. Term-scoped, and present on
all 11 landing pages as well as the home page.
Ours, home + **section** landings: three `<span>` with `cursor: pointer`, no handler, no state
(`DailyEventsSection.tsx:26-28`, a server component). Only today's five exist in the DOM.
Ours, **topic** landings: the widget is missing entirely — `TopicHead.tsx` renders a `CardStrip`.
Its "មើលទាំងអស់" is a bare `<button>`; live's is a link to `/category/all-news/`.
The tab interaction is our code. **The data may need WordPress:** `get-articles` has no date param, so
confirm a way exists to request the yesterday / day-before buckets before promising the other two tabs.

### 9. Galleries collapse into a stack of full-bleed images.
Our stylesheet contains **zero** rules for `wp-block-gallery`, `is-layout-flex`, `wp-block-image` or
`wp-block-embed`, and `ArticleBody.tsx:12` sets `img { width: 100% }`, which actively breaks the flex
row. **13 of the 40 most recent posts (~33%) contain a gallery** — the most common rich block on the site.

### 10. Search is a decorative icon; the route doesn't exist.
Live has a real GET form → **`/searchs?q=<query>`** (note the plural; it's a cross-property search,
with a hidden `site_slug=infotainment`). We have an icon with no handler and no route behind it.
WordPress already exposes `/wp/v2/search?search=`, so **no CMS change needed.**

### 11. `/author/<slug>` archives are missing — 11 dead links.
`LandingTail.tsx:59` points "see all" at `/author` on every one of the 11 landing pages. Live has 21
author archives (paginated post list + the standard sidebar). Buildable from `/wp/v2/users?slug=` +
`/wp/v2/posts?author=`.
**Note:** live's `/author/` (no slug) is *not* an author index — it's a staff page with six team
groups. That one likely needs WordPress work: the groupings are page content, and author photos
aren't exposed by any endpoint (see `src/lib/authors.ts`, which already pins them for that reason).

### 12. Comments are missing entirely.
Live has a real `<form id="commentform">` on every article, plus a "Leave a comment" link in the meta
line. We render nothing. WP REST `wp/v2/comments` supports read **and** POST — no CMS change.

### 13. TikTok / script-driven embeds die on soft navigation.
The embed `<script>` arrives inside the WordPress body string we hand to `dangerouslySetInnerHTML`,
and **browsers do not execute scripts inserted that way.** Land on the URL directly → the video
plays. Click through from the homepage → the reader sees the raw fallback blockquote.
Needs re-injection after mount, or a client component per provider.

### 14. The hero iframe leaks users off the site.
`HeroEmbed.tsx` iframes the live WordPress slider, and every anchor inside it is an **absolute URL on
`infotainment.ams.com.kh`** — so a click on a hero slide navigates out of our app entirely.
(Separately, it's the *homepage* slider on all 11 landing pages. That part does need WordPress:
`/hero-embed` takes no `?alias=` param. There's an unused `src/lib/hero-banners.ts` suggesting a
native hero was once planned.)

---

## TIER 3 — under-filling (nearly all `slice()` caps; all our code)  ✅ DONE (Session A)

Corrected targets, as shipped: landing band **15** (not 17); the program lists are prefixes of one
20-item array (see SESSION A CORRECTIONS). Landing episode rails now render the show's full episode
list rather than a fixed cap. Two blocks were left alone deliberately: the article page's
របាយការណ៍ថ្មីៗ column carries **8** where live has 4 (an over-fill, not a gap — nobody asked for it to
shrink), and ព័ត៌មានសង្ខេប is 8 of our *articles* where live runs 10 *video* posts, which is a
different post type and needs an endpoint we don't have. Flagged, not fixed.


| Block | Live | Ours | Where |
|---|---|---|---|
| Program strip below article | 20 | 4 | `BelowArticle.tsx:84` — `.slice(0, 4)` |
| Home program carousel | 18 | 9 | hardcoded `FEATURED_PROGRAMS`, `navigation.ts:90` |
| Landing សម្រាប់លោកអ្នក program band | 17 | 9 | same `FEATURED_PROGRAMS` array |
| Landing របាយការណ៍ថ្មីៗ (sections) | 10 | 4 | `landing-data.ts` → `reports.size` |
| Landing ព័ត៌មានពេញនិយម (sections) | 6 | 4 | `landing-data.ts` → `topNews.size` |
| Landing episode rails (both) | 44 / 43 | 12 | `fetchEpisodeCards(…, 12)` |
| Related posts below article | 9 | 3 | |
| Article sidebar ស្នេហានិងទំនាក់ទំនង | 5 | 3 | |
| Article sidebar ភាពយន្ត | 5 | 3 | |
| Home news-summary block | 12 | 6 | |

The programs missing from the carousel and the program band **already have working pages** in our
app — they're simply not in the array; only their poster URLs are missing. They are: Cicada Agent,
ព្រះនាងកង្កែប (ladyfrog), វនយាត្រា, កាឡៃម៉ូដ, ចង់ដឹងរឿងគេ (reaction), ប្រអប់បៃតង (green-box),
បើកសោជីវិត (unlock-the-life).

That same nine-item array also feeds both ranked lists below the carousel, so ours are identical to
each other where live's differ (9 and 8).

---

## TIER 4 — small  ✅ DONE (Session B+C) — except the two flagged below

Still open: the **feed-shape decision** (first bullet — owner's call, nobody else should make it)
and the **sort tie-break** (last bullet — moved to NEEDS WORDPRESS; the ordering is SQL inside the
legacy AMS3E-API plugin's `get-article-by-category-slug`, and its response carries only a relative
Khmer date string, so it cannot be re-sorted client-side).

- **Listing feed shape.** We promote item 1 to a full-width hero card; live renders all 10 as uniform
  thumbnail-left rows. Deliberate? Decide.
- **Soft 404.** ✅ **Re-checked against a production build (2026-07-15): 200, and CLOSED as
  by-design.** The route streams (it has a `loading.tsx`), so headers go out as 200 before
  `notFound()` runs — Next 16 cannot retro-change a streamed status. The framework injects
  `<meta name="robots" content="noindex">` into the body instead (verified in the response), so
  nothing gets indexed. A real 404 status would need a proxy-level slug check before streaming
  (see `loading.md` § Status Codes in the bundled docs) — not worth it for zero SEO impact.
- **Listing sidebar widgets have no "see all."** The `justify-content: space-between` slot is there
  and empty. Live: widget 1 → `/category/all-news/`, widget 2 → `/category/reports/`.
- **No `<h1>` on listing pages.** The title band is a `div` and card titles are `div`s, so the page
  has no headings but the three sidebar `<h2>`s. SEO / a11y.
- **Theme toggle** has 2 modes; live has 3 (light / dark / follow-time-of-day).
- **No `not-found.tsx`** — we serve the raw Next default (English, no chrome). Live's own 404 is an
  unbranded hosting page, so the bar is low, but a framework default is worse than either.
- **Label drift.** `ភាពយន្តនិងតន្រ្តី` (ours) vs `ភាពយន្តនិងតន្ត្រី` (live) — letters transposed, our typo.
  Article-sidebar widget `ដំណឹងកម្សាន្ត` (ours) vs `ដំណើរកម្សាន្ត` (live) — a different word.
  Program-icon strip: 7 labels show English where live shows Khmer. Home carousel heading drops លោក.
- **Pagination:** the current page number is a self-link; live renders it as a non-clickable span.
- **Sort tie-break** on `/category/celebrity/reports`: items 2 and 3 are swapped vs live. Same
  timestamp; WordPress falls back to post-ID DESC.

---

## DECISIONS (made by the owner — do not re-litigate)

**The program page and the episode page layouts are FROZEN.** `/program/<slug>` and
`/program/<slug>/<episode>` keep their current design. Live's equivalents are JS-hydrated *watch*
templates — player, season dropdown, episode playlist in a sidebar, no homepage furniture — while
ours are a marketing page and a grid page. **That divergence is deliberate and accepted. It is not a
gap. Do not propose a structural rebuild of either page.**

Consequences:
- **The ▶ button needs no player on the program page.** It should **navigate** to the show's
  default/newest episode, where we already render a working Vimeo iframe. That kills the dead control
  without touching the frozen layout.
- **The eight homepage sections below the season grid stay.** Fix the *comment* that justifies them
  (it asserts something false about the live site — see CORRECTIONS), not the sections.

Still to fix in this area — data and dead controls only, no layout changes.
**✅ All closed in Session B+C** except the last bullet (episode-carousel ordering — that one is a
human-in-WP-admin task, not code). Runtime + "Added" waits on the plugin 1.5.0 upload. The "see
all" gap got a real page: `/program/<slug>/episodes` lists a show in full.
- **`kalai-mode` (កាឡៃម៉ូដ) 404s.** One row in `programs.ts`:
  `{ slug: "kalai-mode", postType: "movie", postId: 19503, showId: 14514 }`. It will be thin — live's
  own episode list for it renders 0 items.
- **`SeasonGrid` is mislabelled.** It lists *every* season's episodes but is titled with the current
  episode's season name — so the-fact reads "រដូវកាលទី ៣" above all three seasons. Five shows are
  multi-season: daily-feed 12, the-fact 3, obsok 2, athkombang-krom-mekh 2, me-noam-rueng 2.
  `season_id` is on every `tv-show-episodes` row, so it can be grouped and filtered client-side.
- **No per-episode description box.** Reachable via `/wp/v2/episode/<id>?_fields=excerpt`.
- **Episode rows lack runtime + "Added" date** (live: `27:29 នាទី | Added: 09.11.2022`). Not on
  `tv-show-episodes`; `khmer-insider-episode`'s `episode_list_html` has them pre-rendered.
- **`SeasonGrid` "see all"** for daily-feed promises 617 episodes and lands on a carousel of 18.
  Nowhere in the app lists all episodes.
- **Episode-carousel ordering** differs from live (ours: episode-number DESC; live's is
  non-monotonic — looks like a curated `menu_order`). Needs eyeballing in WP admin.

---

## DO NOT BUILD

- **`/tv-shows/` and `/tv-show/<slug>/`.** They exist on live (23 URLs in the sitemap) but **nothing
  on live links to them**, and `/tv-show/<slug>` serves the identical watch template as
  `/program/<slug>`. Legacy and orphaned. A redirect to `/program/<slug>` fully satisfies them if you
  ever care. Flagged so nobody "discovers" them later and assumes a gap.
- **Account / login / favourites / playlists.** Live has a real WordPress-authenticated system
  (social login via `wp-login.php?loginSocial=`, favourites, `/movie-playlists/`). Our header's
  avatar circle and the "+ PLAYLIST" button are decorative. This is a separate project, not a gap to
  close in a sweep — scope it on its own, or remove the controls so they stop looking clickable.

---

## NEEDS WORDPRESS

1. ~~**Daily-events yesterday / day-before buckets**~~ — **resolved without a CMS change**: core
   `wp/v2/posts?after=&before=` serves the buckets, term-scoped. (Session B+C.)
2. ~~**`/hero-embed` needs an `?alias=` param**~~ — **shipped in plugin 1.5.0**; just needs the
   upload (see STATUS).
3. ~~**Sort tie-break** (was Tier 4)~~ — ✅ **FIXED in AMS3E-API (2026-07-15)** and verified:
   `/category/celebrity/reports` now matches live article-for-article. Both
   `get-article-by-category-slug` and `get-articles` order `date DESC, ID ASC` — note **ASC**:
   the audit's "WordPress falls back to post-ID DESC" guess was WRONG; two same-second posts
   proved live's implicit MySQL tie order is ID *ascending*. The endpoints are now explicit
   about an order live only gets by accident. (Same session also fixed `get_articles`'s
   double-`$args`, its `showDesc` bug, and its site-wide-total pagination math, and preserved
   `ignore_sticky_posts` across the `get_posts`→`WP_Query` move.)

Maybes, to confirm before promising:
- The listing sidebar's "popular" widget may need a view-count ordering REST doesn't expose.
  (In the meantime it renders honest recents — see `articles.ts`. AMS3E-API's source was read
  in full on 2026-07-15: it has no view tracking either, so this genuinely needs new CMS work.)
- The `/author/` staff page's six team groups are page content. Author photos: AMS3E-API's
  `get-author?authorId=` DOES read the Simple Author Box meta (`sabox-profile-image` /
  `ams_avatar`) — the audit was wrong that no endpoint exposes them — but the meta is empty on
  the authors probed, so `authors.ts` keeps its pinned photos until someone fills it in WP.

Corrections from reading AMS3E-API's full source (2026-07-15):
- **`get-articles` HAS a `date_filter`** (`today` / `1day_ago` / `2days_ago`) — "no date
  parameter" above was wrong. Left unused on purpose: its windows overlap (`1day_ago` spans
  yesterday *through today*), while the daily-events tabs need clean per-day buckets, which
  core `posts?after=&before=` provides.
- Known issues left in AMS3E-API for its owner (Sak Ravuth): a hard-coded Telegram bot token
  (should be rotated and moved out of source), an unauthenticated `/send-telegram` test route,
  and a `contact-form` GET with no permission check (currently blocked upstream by the host).

---

## CONFIRMED CLEAN (don't re-audit)

- **Block order** on the home page and all 11 landing pages — nothing missing, nothing invented,
  nothing reordered.
- **Header category nav** (structure and hrefs) and the five coloured program pills.
- **Pagination:** 10 per page, same article sets in the same order, same total page counts (all-news
  = 1,028 pages), page 2 matches live article-for-article, and the `/page/N` scheme matches.
- **Every internal link** on home, landings, listings, articles and program pages resolves 200. The
  only `href="#"` anywhere on the site is in the footer.
- **Listing empty state:** ours is *better* than live's, which renders a completely blank content column.
- **Article tags:** live's theme never renders a tag list. Neither do we. Match.
- **Body element types:** across 40 recent posts there are 0 figcaptions, 0 tables, 0 body headings,
  0 YouTube/Vimeo iframes, 0 tweets. `ArticleBody` styles them anyway — untested, not missing.
- **Cast/crew:** empty on all 19 programs in the API; live renders none either.
- **Newsletter:** live's is a `<button>` with no handler and no vendor script. Nothing to clone.
- The Facebook oEmbed that renders as a naked URL in one article **renders that way on live too**
  (WordPress's FB oEmbed needs an app token). We reproduce live exactly. WordPress-side if you ever
  want it fixed.

---

## SUGGESTED SESSION PLAN

**Session A — cheap and high-value.** ✅ **DONE.** Tier 1 in full: article metadata; footer wiring +
the seven static pages (together); the wrong-source feeds; the share buttons; the topic-page
duplicate feed; the មាតិការសនិយម tabs. Then Tier 3, which is mostly changing numbers.

Two things Session A turned up that belonged to later sessions — **both closed in Session B+C:**
- ~~**The /contact form does not submit.**~~ Fixed by `ScriptedHtml` (the same fix as Tier 2 §13).
- ~~**A cache-tag warning at build time.**~~ Fixed by `safeTag()` — over-long percent-encoded Khmer
  slugs are hashed into the tag; `/api/revalidate` normalizes incoming tags the same way.

**Session B — new routes.** ✅ **DONE** (2026-07-14): `/author/<slug>` archives + `/author` index,
comments (read + submit). **Search deliberately deferred by the owner** — the one Session B item
still open, whenever it's wanted: live is `/searchs?q=` (plural), `wp/v2/search` suffices, no CMS
change.

**Session C — the awkward ones.** ✅ **DONE** (2026-07-14): galleries, `ScriptedHtml` for embeds +
the contact form, hero alias/click-forwarding (pending plugin upload), daily-events tabs (no
WordPress change needed after all — core `posts?after=&before=`).

**What's actually left** (also in STATUS at the top):
1. **Upload WP plugin 1.5.0** — rebuild the zip from `docs/wordpress/ams-frontend-api.php`,
   upload in WP admin, then spot-check: landing hero shows its own slider, comment POST goes
   through REST, episode rows show runtime + Added.
2. **The feed-shape decision** (Tier 4, owner) and **search** (deferred, owner).
3. **Legacy-plugin sort tie-break** + the two "maybes" — raise with whoever owns the CMS.
4. **Episode-carousel ordering** — eyeball `menu_order` in WP admin.
