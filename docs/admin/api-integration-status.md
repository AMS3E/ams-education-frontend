# Admin dashboard — API integration status

Running tracker of every place the admin dashboard talks (or needs to talk) to
WordPress. Scope is the five real areas only — Posts (+ categories/tags),
Programs, Media, Users, Settings — per the measured-usage scoping; Videos /
Persons / the movie-video-tv taxonomies are dead theme demo and excluded.

Two data clients (never mix them):
- **Public site** → `src/lib/api/client.ts` `apiFetch`: anonymous, ISR-cached, the read-only `wp/v2/web/*` endpoints.
- **Admin** → `src/lib/admin/client.ts` `adminFetch`: authed (X-AMS-Token), `no-store`, core `wp/v2/*`, with `X-WP-Total` pagination.

Lists fetch **one page at a time** (`page`/`per_page`, total via the `X-WP-Total`
header = server-side COUNT), except small bounded sets (categories, users) where
one page is everything. Nothing loads a whole 10k+ table.

**Status:** ✅ done & verified · 🟡 built, not yet UI-tested · ⬜ not started · ⛔ blocked (WP-side work) · ➖ deferred by choice

_Last updated: 2026-08-17 (Session 34 — legacy-site cache refresh row; see session-log.md)._

_Previous: 2026-07-31 (unattended "replace wp-admin" session). Done: auth, Articles (list + filters + editor incl. **TipTap body**), Dashboard, Users (+ **create**), Media (+ **alt edit / delete / upload**), Programs list + editor + **dynamic public registry** + **Create Program**, Category/Tag managers, Settings, Profile. Everything from this session is 🟡 (built + build-passes, browser-unverified) — details in session-log.md §5._

## Foundation & Auth

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| Authed admin client | `adminFetch` (X-AMS-Token, no-store) | — | ✅ | Foundation for all admin calls |
| Login | `POST wp/v2/web/login` | R | ✅ | Browser-confirmed |
| Session / current user | `GET wp/v2/web/me` | R | ✅ | Drives role gating |
| Logout | cookie clear (no API) | — | ✅ | |
| Legacy-site cache refresh | `POST wp/v2/web/cache/purge` (afa 1.10.0) | W | ⛔ | Post-publish purge + browser re-warm with progress chip (articles + programs). Frontend built; **blocked on uploading the 1.10.0 plugin zip** |

## Articles (Posts) — the one fully-writable type

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| List + search + status + pagination | `GET wp/v2/posts` | R | ✅ | Verified live |
| List filters: category / author / date | `GET wp/v2/posts` + option lookups | R | ✅ | Verified (author filter uses view-context `listAuthors`, no `list_users` needed) |
| Delete / trash post | `DELETE wp/v2/posts/{id}` | W | 🟡 | Action built (`trashPost`); no UI button yet |
| Editor load | `GET wp/v2/posts/{id}?context=edit` | R | ✅ | Verified |
| Save (title, excerpt, status, categories, Yoast SEO) | `POST wp/v2/posts/{id}` | W | 🟡 | Write API proven; UI-save untested |
| Create | `POST wp/v2/posts` | W | 🟡 | Same |
| Body content (TipTap → HTML) | `POST wp/v2/posts` (`content`) | W | 🟡 | Dirty-tracked: sent only when edited, so metadata saves never flatten Gutenberg |
| Featured image | (media picker) | W | 🟡 | Picker + save wired |
| Tags edit | `wp/v2/tags` typeahead | W | 🟡 | Search + create + save wired |
| Social overrides | custom post meta | W | ⛔ | Some meta needs `show_in_rest` |
| Delete / trash | `DELETE wp/v2/posts/{id}` | W | ⬜ | |

## Taxonomies

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| Category tree (editor picker) | `GET wp/v2/categories` | R | ✅ | 26, one request |
| Category manager (create / delete) | `GET/POST/DELETE wp/v2/categories` | R/W | 🟡 | Read verified; create/delete built (rename deferred) |
| Tag manager (search + create / delete) | `GET/POST/DELETE wp/v2/tags` | R/W | 🟡 | Read verified (5,574); create/delete built |

## Programs (movie / tv_show / episode)

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| List (movies + tv_shows) | `GET wp/v2/movie` + `wp/v2/tv_show` | R | ✅ | Verified — 43 programs, grid/list, search + type |
| Editor load | `GET wp/v2/movie\|tv_show/{id}?context=edit` | R | ✅ | Verified — plugin v1.7.2 `user_has_cap` filter unblocked the 403; curated meta registered since v1.7.1 |
| Editor save (title, description, release date, schedule, artwork) | `POST wp/v2/movie\|tv_show/{id}` | W | ✅ | Browser-verified on a throwaway draft (round-tripped via API). Description writes `excerpt` (post_excerpt = the public page's text) since 2026-08-27 — `content` is the old WP page's layout canvas, never written. Video source cut from the editor same day (owner request) — `_movie_*` video meta stays managed in WP; status/`_seasons` out of scope |
| Episodes list (read-only tab) | `GET wp/v2/web/tv-show-episodes` | R | ✅ | Wired — grouped by season parsed from "S2:E14" labels; managed in WP |
| Create a program | `POST wp/v2/tv_show` + `POST wp/v2/movie` | W | 🟡 | Draft movie + published container tv_show, `_khi_tv_show_id` link; public registry is dynamic now |

## Media (115k items)

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| Grid + search + type filter + detail drawer | `GET wp/v2/media` | R | ✅ | Verified — 115,259 items, paginated |
| Upload (images ≤20MB) | browser → `/api/admin/upload` → `POST wp/v2/media` (raw body) | W | ✅ | Browser-verified incl. s3 offload. Route Handler on purpose — Server Actions 500 on File payloads. Cap raised 10→20MB 2026-08-27 after probing the host (20MB body → 401, accepted) |
| Upload (video ≤300MB / audio ≤50MB) | same route, per-type caps + 10-min timeout | W | 🟡 | Built 2026-08-17, not live-tested. Host body cap measured 2026-08-27: 20MB passes, 100MB → instant 413 (nginx), so the 50MB audio cap is plausible but the 300MB video cap will 413 until aaPanel's `client_max_body_size` is raised |
| Edit alt / delete | `POST/DELETE wp/v2/media/{id}` | W | 🟡 | Drawer edits alt (images) + permanent delete w/ confirm (no REST trash) |
| "Own files only" for non-admins | query scoping | R | ⬜ | Default WP shows all |

## Users & Settings

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| Users list (search + role filter + pagination) | `GET wp/v2/users` | R | ✅ | Verified — 83 users; page gated on `list_users` |
| Create user (username/email/password/role) | `POST wp/v2/users` | W | ✅ | Browser-verified as admin — no caps grant needed. Success banner + list filters to the new username |
| My profile (name, bio, email, website, password) | `GET/POST wp/v2/users/me` | R/W | 🟡 | Read verified; save built |
| Site settings (title, tagline, tz, date, default cat, per-page) | `GET/POST wp/v2/settings` | R/W | 🟡 | Read verified; save built; gated on `manage_options` |
| Featured Program (homepage banner) | our plugin option | W | ⬜ | GET exists; write needs a new plugin endpoint (today set in wp-admin) |

## Dashboard (home)

One fast-path request (`fast.php?r=dashboard`, plugin 1.6.0+) serves the whole
screen; the rows below are the REST fallbacks each widget degrades to.

| Feature | Endpoint / method | R/W | Status | Notes |
|---|---|---|---|---|
| Queue / KPI counts (Needs you, Stories published) | `GET wp/v2/posts?per_page=1` (`X-WP-Total`) | R | ✅ | Verified live |
| Top performing (real pageviews) | `GET wordpress-popular-posts/v1/popular-posts` (last30days) | R | ✅ | Verified — real WPP views |
| Trending now (24-hour pageviews) | `GET wordpress-popular-posts/v1/popular-posts` (last24hours) | R | 🟡 | Plugin 1.7.0 `trending` field; fixed window, ignores the range control |
| Today so far (views vs yesterday same-time, posts today, top of the hour) | fast path only (plugin 1.8.0 `today`, 120s memo) | R | 🟡 | No REST equivalent of the same-clock-time comparison — fallback shows the cell as unavailable |
| Comments awaiting moderation (Needs you row) | fast path only (plugin 1.8.0 `queue.comments`) | R | ⏸ | Data flows; the row's JSX is PARKED (commented in DashboardScreen, owner decision 2026-08-16) |
| Custom chart window (from/to date pair) | fast path only (plugin 1.8.0 `?from/?to`, clamped to 90 days ending today) | R | 🟡 | Scopes series/top/leaderboard; KPIs stay pinned via a 14-day mini-series; fallback degrades to the 30-day preset |
| Recent activity | `GET wp/v2/posts?orderby=modified` | R | ✅ | Verified; fallback is articles-only (fast path unions programs/episodes) |
| Views time-series chart / sparklines | fast path only (WPP summary table via SQL) | R | ✅ | 1.6.0 daily series; no REST equivalent — chart explains itself on fallback |

## WP-side prerequisites (block their rows)

1. ~~**Programs custom meta / edit caps**~~ — done: curated `register_meta` set (plugin v1.7.1) + `user_has_cap` runtime grant (v1.7.2), both deployed and verified.
2. **Featured Program write** — a small new write endpoint in `docs/wordpress/ams-frontend-api.php` so the dashboard Settings screen can set it (today it's set in wp-admin only).
