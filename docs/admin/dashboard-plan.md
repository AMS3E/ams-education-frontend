# Admin dashboard — planning notes

A custom authoring UI over headless WordPress, replacing what editors do in
wp-admin today. WordPress stays the backend and keeps all business logic; this
dashboard reads and writes it over REST, the same way the public frontend
already reads it.

Everything below was verified against the live site (GET probes + two temporary
diagnostic routes), not assumed. Nothing here is built yet.

Base: `https://education.ams.com.kh/wp-json`

---

## 1. Scale (drives every list design)

| Type | Count | Note |
|---|---|---|
| Posts | **10,484** | Needs real search + filters, never a plain table |
| Media | **115,127** | The big one — a picker without strong search is unusable |
| Tags | **5,568** | Typeahead only; a dropdown is impossible |
| Episodes | 1,480 | Filter by show |
| Categories | 26 | Small enough to render as a tree |
| Users | 39 | Trivial list |
| Videos / Movies / TV Shows | 38 / 20 / 22 | Small, simple lists |

## 2. Content model

Authoring types: `post`, `movie`, `video`, `tv_show`, `episode`, `person`
(plus `*_playlist` types and `mas_static_content`).

Each media type has its own taxonomies — they are NOT shared with posts:

| Type | Taxonomies |
|---|---|
| post | `category`, `post_tag` |
| movie | `movie_genre`, `movie_tag` |
| video | `video_cat`, `video_tag` |
| tv_show | `tv_show_genre`, `tv_show_tag` |
| person | `person_cat`, `person_tag` |

## 3. What REST can and cannot do today

Writable now via `wp/v2/<rest_base>`: `title`, `content`, `excerpt`, `slug`,
`status`, `date`, `author`, `featured_media`, `comment_status`, `template`, and
the type's taxonomies. Posts additionally expose Yoast
(`_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw`).

**Everything else is invisible.** `meta.properties` is empty for movie, video,
tv_show and episode, so all custom fields below must be exposed WP-side with
`register_meta(..., show_in_rest => true)` before the dashboard can read or
write them. That is the single largest mechanical work item (~40 fields).

The custom `wp/v2/web/*` namespace (AMS3E-API plugin) is **read-only** — all GET
except `web/contact-form`. There is no existing write API.

### Meta keys (confirmed)

MasVideos prefixes meta with the post type.

**movie** — `_movie_choice`, `_movie_url_link`, `_movie_attachment_id`,
`_movie_embed_content`, `_movie_release_date`, `_movie_run_time`,
`_movie_image_gallery`, `_movie_censor_rating`, `_khi_tv_show_id`,
`_vodi_movie_bg_image`, `_vodi_movie_banner_image`, `_vodi_movie_banner_link`,
`_vodi_movie_play_trailer_link`, `_vodi_movie_play_trailer_text`,
`_vodi_movie_buy_ticket_link`, `_vodi_movie_buy_ticket_text`,
`_vodi_movie_related_posts`, `_vodi_movie_style`, `_recommended_movie_ids`,
`_related_video_ids`, `_imdb_id`, `_tmdb_id`, `_cast`, `_crew`, `_sources`

**video** — `_video_choice`, `_video_url_link`, `_video_attachment_id`,
`_video_embed_content`, `_video_image_gallery`, `_vodi_video_banner_image`,
`_vodi_video_banner_link`, `_vodi_video_style`
(no release date or run time — videos have a different shape from movies)

**episode** — `_episode_number`, `_episode_choice`, `_episode_url_link`,
`_episode_attachment_id`, `_episode_embed_content`, `_episode_release_date`,
`_episode_run_time`, `_tv_show_id`, `_tv_show_season_id`, `_vodi_episode_bg_image`

**tv_show** — `_seasons`, `_tv_show_image_gallery`, `_vodi_tv_show_style`,
`_tvshow_featured_image_secondary`

**post** — Yoast (exposed), plus per-network social overrides:
`_custom_meta_key_title_fb` / `_twitter` / `_telegram`,
`_custom_meta_key_desc_*`, `secondary_featured_image` (+`_twitter`, `_telegram`),
`custom_permalink`. `url_embed_video` exists on SOME posts only.

## 4. Roles — as they actually are

Read from the live site. **Do not redesign these** — the flow stays as-is.
The dashboard should read capabilities and render accordingly, so a Publish
button simply appears for users holding `publish_posts` and doesn't for others.

| Role | Users | Can publish posts | Edit others' | CPT access |
|---|---|---|---|---|
| Administrator | 8 | yes | yes | all |
| Editor | 8 | yes | yes | all |
| SEO Manager / SEO Editor | 6 / 6 | yes | yes | all |
| Contributor | 7 | **yes** | **yes** | videos only |
| Author | 11 | **no** | no | all |
| Visitor / Subscriber / Translator | 50 / 5 / 1 | no | no | none |

Five further roles (Post Article, Embeded Video, Web Designer, Custom Permalinks
Manager, FB-Role) have **zero users** — plugin leftovers, ignore them.

Two things to be aware of, both deliberately left alone for now:

- **Author cannot publish**, and **Contributor is stronger than Author** — the
  two are effectively inverted relative to stock WordPress. Whoever writes
  day-to-day is probably on Contributor.
- **`manage_options` is granted to Author, Contributor and Editor** — 26 users
  hold the site-settings capability. Unrelated to this project, but worth
  revisiting on its own merits.

The CPTs *do* have their own capabilities (`edit_movies`, `edit_tv_shows`,
`edit_videos`, `edit_episodes`), so a programs-only role is cleanly possible.

## 5. Screens

Legend: ✅ works today · ⚠️ needs `register_meta` · ❌ needs design work · ➖ excluded

**Dashboard** — content counts ✅, my view counts (WordPress Popular Posts) ✅,
top performing ✅, recent activity ✅, pending review queue ✅.
Site-wide stats and click tracking are **excluded** — click data doesn't exist.

**Profile** — avatar (`sabox-profile-image`, falling back to `ams_avatar`),
display name, first/last, email, bio, website, password. Username and role read-only.

**Articles** — list with search + filters ✅; title, body (rich text), excerpt,
slug, featured image, categories, tags, status ✅; Yoast ✅; social overrides ⚠️.

**Programs (movie / tv_show / episode)** — list ✅; metadata edit ⚠️;
taxonomies ✅; **create ❌ (see §6)**; seasons repeater ➖ (see §6);
page layout ➖ — layout lives in frontend components now, not in WordPress blocks.

**Videos** — list/create/edit ✅ core, ⚠️ for video source and banner fields.

**Media** — grid, search, upload ✅. "Own files only" for non-admins ⚠️ —
WordPress shows every user the entire library by default.

**Admin only** — users (`list_users` / `promote_users`), categories and tags
(`manage_categories`), per-type genres, settings (`manage_options`).

Comment moderation is **out of scope** for now.

---

## 6. Parked items

### The hardcoded program registry

`PROGRAMS` in `src/lib/programs.ts` is a hand-written list of 20 entries, and
the route uses `generateStaticParams()` with `dynamicParams = false`. Unknown
slugs 404 by design.

Consequence: **editing** a program works (metadata is fetched live), but
**creating** one never reaches the frontend — a new movie in WordPress has no
route until a developer edits the file and redeploys.

What we now know that we didn't when it was written:

- `showId` is `_khi_tv_show_id` — verified (movie #204700 → tv_show #204703).
  No longer needs hand-pairing.
- **Every published movie is a program** — 20 published movies, 20 registry
  entries, one mismatch: `vanna-yeatra` exists as both movie #20275 and
  tv_show #14450; the registry uses the show, `web/featured-program` uses the movie.

Still open: slug strategy and ordering/grouping (the registry encodes three
presentation groups — nav pills, the មាតិកាឌីជីថល icon strip, carousel-only —
which WordPress knows nothing about).

On slugs: of the 19 movie entries, 11 already match their WordPress slug
exactly, 6 differ only by legacy permalink junk (`program-digital-` prefixes,
`lady-frog`/`ladyfrog`), and **2 needed a human** because the titles are Khmer
and auto-generation yields percent-encoded URLs. So the answer is the ordinary
one — auto-generate from the title, allow an override, and prompt for a Latin
slug when the title isn't Latin script.

Making the registry dynamic is **frontend work, not dashboard work**. Editing is
the everyday case; creating a program has happened ~20 times in four years.

### The seasons repeater — not needed

`_seasons` is a serialized array (season name, image, episode list, year,
description, repeated per season). It would be the hardest single thing to build.

**The frontend doesn't use it.** `src/lib/episodes.ts` derives seasons by parsing
the episode label ("S2:E26" → season 2) and explicitly distrusts the stored
field: *"the meta field is an index editors have left wrong."* So the dashboard
only needs `_episode_number` to be right. Skip the repeater.

### Data-model landmines — encode, don't fix

WordPress is still live and the Vodi theme still reads these fields. Renaming or
migrating them breaks the WordPress site. They are permanent constraints of a
headless setup whose old head is still attached; handle them in one place.

| Quirk | Why it bites |
|---|---|
| `_movie_run_time` | Named like a duration; actually holds broadcast schedule text |
| `_movie_embed_content` | Goes stale — holds an *older* Vimeo id than `_movie_url_link`. Prefer `url_link` |
| `_tv_show_season_id` | Editors left it wrong; frontend parses labels instead |
| `_khi_tv_show_id` vs `_tv_show_id` | Movies and episodes use different keys for the same idea |
| Release dates | Unix seconds at midnight **Asia/Phnom_Penh**. Format in UTC and you print the wrong day — on a New Year release, the wrong year |
| OneSignal meta | Orphaned leftover — **no OneSignal/push plugin is active** (verified 2026-07-30 via the REST namespace list + wp-admin menu). The meta rows persist but nothing listens, so a REST publish fires no push. |

Two worth fixing going forward, both "don't repeat the mistake" rather than migrations:
stop writing `_movie_embed_content` (or keep it synced on save), and make
`_episode_number` the single source of truth in the episode form.

### Open decisions

1. Program slug workflow — who supplies the Latin slug for a Khmer title.
2. Program ordering and grouping — dashboard-controlled or stays as code.
3. The `vanna-yeatra` movie/tv_show duplicate — intentional or historical.
4. ~~Untested: whether publishing via REST fires OneSignal push notifications.~~
   **Resolved 2026-07-30:** no OneSignal — nor any push/notification — plugin is
   active, confirmed by the REST namespace list and the wp-admin menu. The
   OneSignal post meta is orphaned leftover from a removed plugin and fires
   nothing. Still smoke-test writes on a throwaway draft as routine hygiene.

### Temporary diagnostics to remove

Two routes were added to the AMS3E-API plugin's `functions.php` for discovery.
Remove both once the WP-side `register_meta` work is done:

- `GET wp/v2/web/meta-keys?id=` — returns meta key names only, no values
- `GET wp/v2/web/roles-dump?key=` — returns roles + capabilities, key-gated
