# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Next.js 16 (App Router, React 19, React Compiler on) app with **two halves in
one codebase**:

- **`src/app/(site)/…`** — the public AMS Education site (education.ams.com.kh),
  server-rendered and ISR-cached, reading WordPress anonymously.
- **`src/app/admin/…`** — a custom CMS dashboard that replaces wp-admin for the
  newsroom: authenticated, always-fresh, reads *and writes* WordPress as the
  logged-in user.

Both talk to the same WordPress backend at `education.ams.com.kh` (REST base
`/wp-json`, default in every client's `API_BASE_URL` fallback — see
`src/lib/site.ts`, `src/lib/api/client.ts`, `src/lib/admin/client.ts`). WordPress
owns all business logic and data; this app is a headless frontend + authoring
UI over it, never a second source of truth.

**Read `AGENTS.md` first** — it points at the deep-detail docs below, which
this file summarizes rather than duplicates:
- `docs/project-context.md` — backend plugins, WordPress reads/writes that lie,
  hosting traps, framework gotchas, deploy config. The single most
  information-dense file in the repo.
- `docs/session-log.md` — chronological session-by-session handoff (newest
  first), the deepest detail on *why* something is built the way it is.
- `docs/admin-design-system.md` — the admin's visual language: palette,
  primitives, layout patterns. Read before styling any admin screen.
- `docs/admin/api-integration-status.md` — per-feature tracker of what's wired,
  what's stubbed, what's blocked on a WordPress-side change.
- `docs/category-restructure.md` — measured rules for WordPress category
  moves/merges. Read before moving any content between categories.

⚠ **Domain caveat**: `docs/project-context.md` and `AUDIT.md` were written
against a sibling AMS property and still say `infotainment.ams.com.kh` in
places — they were carried over because the plugin/hosting architecture they
describe (the fast read path, WP quirks, Dokploy deploy traps) is genuinely
shared across AMS's WordPress properties. Trust the *mechanisms* they
describe; verify any specific domain, ID, or count against this repo's own
`.env.local` / `src/lib/site.ts` / `docs/wordpress/education-categories.md`
before relying on it. `AGENTS.md` also points at a `docs/caching.md` that does
not exist in this checkout — treat that pointer as stale, not as a file to
hunt for.

There is no test framework in this repo (no jest/vitest/playwright config, no
`test` script) — verification is `tsc --noEmit`, `eslint`, and `npm run build`,
plus the owner manually verifying writes against production (see "Working
agreements" below).

## Commands

```bash
npm run dev      # panda codegen, then next dev --experimental-https (dev server needs HTTPS — see below)
npm run build    # panda codegen, then next build
npm start        # next start (serve an existing build)
npm run lint     # eslint
npm run prepare  # panda codegen only (also runs automatically via dev/build)
npx tsc --noEmit # typecheck — not wired as an npm script, but the standard check before calling something done
npm run sync:promos  # copy Slider Revolution ad exports from (gitignored) temp/ads into public/promos
```

There is no per-test command (no test runner is configured). `php
docs/wordpress/ams-fast-api/tests.php` exercises the WordPress-side fast-path
plugin offline (146+ assertions, no server/DB needed) but that is backend
plugin code, not this app.

`panda codegen` (Panda CSS) must run before `@/styled-system/*` imports
resolve — it's chained into `dev`/`build`/`prepare` already, so a fresh clone
only needs `npm install`. If styled-system types look stale after editing
`panda.config.ts`, rerun `npm run prepare`.

Dev runs over HTTPS (`--experimental-https`) because `education.ams.com.kh`
serves a self-signed cert in this dev setup and `NODE_TLS_REJECT_UNAUTHORIZED`
is relaxed in `.env.local` for it — see that file's comments before touching
TLS-related env vars.

**Windows dev wedge** (documented in `docs/project-context.md` — recorded here
because it's the single most likely local dev annoyance): recurring "Jest
worker … child process exceptions" 500s are Turbopack's worker spawn failing,
worse with orphaned `node` processes. Fix: kill all `node` processes, delete
`.next`, one fresh `npm run dev`.

## Framework: this is not the Next.js you know

Next 16 has real breaking changes vs. older Next/your training data — check
`node_modules/next/dist/docs/` before writing Next-specific code, and note:

- `params` / `searchParams` are Promises; `cookies()` and `headers()` are async.
- **Middleware is `src/proxy.ts`**, not `middleware.ts` (same mechanism, new
  name/export). It is deliberately a cheap, network-free cookie-presence check
  gating `/admin/*` — never the real auth boundary (see Auth section).
- `fetch` is **not** cached by default — every public read must pass `next:
  { revalidate, tags }` explicitly (see `apiFetch` in `src/lib/api/client.ts`)
  or the route silently goes fully dynamic.
- `cacheComponents` is off → classic ISR, **no Partial Prerendering**. Touching
  `searchParams`/`cookies`/`headers` anywhere in a route tree makes the whole
  route dynamic regardless of `<Suspense>` placement — wrapping a dynamic read
  in Suspense buys nothing here. Prefer `/page/N` URL segments over
  `searchParams` for anything that should stay static (see the homepage,
  category and author pagers).
- `loading.tsx` flushes a 200 before a later `notFound()` can run, so a
  "not found" public route still answers HTTP 200 with a `noindex` meta tag,
  not a real 404 status.
- React Compiler is on: no `setState` during render, no ref writes during
  render, no prop-syncing effects — use a `key` to reset state instead. Several
  admin patterns (e.g. `ThemeControl`'s `useSyncExternalStore` instead of an
  effect, `Dropdown` measuring its trigger inside the click handler rather than
  an effect) exist specifically to satisfy this lint.
- A leading space before a newline in JSX (`</strong> They`) can render
  differently server vs. client and trigger a hydration mismatch — use an
  explicit `{" "}`.

## How the app talks to WordPress: three HTTP clients, never mixed

| Client | File | Used from | Auth | Caching | Endpoints |
|---|---|---|---|---|---|
| `apiFetch` | `src/lib/api/client.ts` | Public site | anonymous | ISR (`revalidate`+`tags`, always explicit) | read-only `wp/v2/web/*` custom endpoints, plus a couple of core `wp/v2/*` reads (`wp-core.ts`) |
| `adminFetch` | `src/lib/admin/client.ts` | Admin dashboard | `X-AMS-Token` cookie, as the logged-in user | `no-store`, always fresh | core `wp/v2/*` — the only path that can write |
| `fastFetch` | `src/lib/admin/fast.ts` | Admin dashboard reads only | same `X-AMS-Token` | `no-store` | a standalone `SHORTINIT` PHP endpoint (`fast.php`) that answers via direct SQL, ~13–48× faster than booting all of WordPress's plugins |

The public site also has its own fast-path mirror, `fastPublicFetch` /
`withPublicRestFallback` in `src/lib/api/fast-public.ts`, hitting `pub-*`
resources (deliberately unauthenticated — published content only).

**Every fast-path read has a REST fallback.** `withRestFallback()`
(`lib/admin/fast.ts`) tries the fast endpoint first and falls back to
`adminFetch` on any non-auth failure, with a circuit breaker (2 consecutive
failures → skip the fast path for 60s) — because a *missing* fast.php isn't a
quick 404, it's WordPress booting its full 63-plugin stack to render its own
404 page (~20s measured), i.e. slower than never trying. **Writes always go
through `adminFetch`/core REST — the fast path is read-only, on purpose.**

Why the fast path exists at all: a plain WordPress REST call here costs ~4s
(63 plugins boot on every request, OPcache is off). `docs/wordpress/ams-fast-api/fast.php`
runs under `SHORTINIT` (DB layer only, no plugins/theme/hooks) and serves the
same shapes directly from SQL. Rebuild its zip with
`docs/wordpress/build-fast-api-zip.ps1` before any upload — zips are
gitignored and don't exist on a fresh clone.

## Auth / session model

- WordPress *is* the authorization boundary. Our plugin's `POST
  wp/v2/web/login` mints a 12h signed token; it's stored in an **httpOnly**
  cookie (`src/lib/auth/session.ts`) and replayed as `X-AMS-Token` on every
  admin call. A revoked/expired token 401s from WordPress regardless of what
  the cookie claims.
- `getSession()` (React `cache()`-memoized per request) reads the *cached user
  cookie* set at login rather than re-fetching `/web/me` on every navigation —
  a deliberate latency trade-off (a role change applies at next login, not
  next request). `capabilities` gate which buttons render; they are
  **optimistic UI only**, never the real enforcement.
- `src/proxy.ts` only checks cookie *presence* for `/admin/*` (no network call
  allowed in proxy/middleware) to avoid a shell flash for logged-out users.
  `requireSession()` in `src/app/admin/layout.tsx` is the belt-and-suspenders
  layout-level gate. Neither is the true boundary — WordPress is.
- Login errors are translated into user-safe messages in `session.ts`
  (`loginMessage`) because this host replaces upstream 4xx bodies with HTML
  error pages.

## Server Actions pattern

Reads and writes are split deliberately:

- **Admin reads** go through Route Handlers under `src/app/api/admin/*`
  (the "BFF" routes — `src/lib/admin/bff.ts` has the shared 401/error mapping)
  called by TanStack Query (`QueryProvider`, `adminKeys` in
  `src/lib/admin/queries.ts`) from Client Components. This keeps the httpOnly
  token out of browser JS and lets the client cache dedupe/serve
  back-forward navigation.
- **Admin writes** are Server Actions (`"use server"` files under
  `src/lib/admin/*-actions.ts`, e.g. `editor-actions.ts`, `screen-actions.ts`,
  `menu-actions.ts`, `program-actions.ts`, `seo-actions.ts`, plus
  `lib/auth/actions.ts` for login/logout) called directly from Client
  Components. They call the typed write helpers (`post-edit.ts`,
  `program-edit.ts`, etc.), map WordPress errors to a small typed result
  (`{ ok, error? }`), and `redirect("/login")` on an expired session for
  *manual* saves — but **not** for autosave (see below), which must report
  expiry inline instead of yanking the writer out of the editor.
- **`"use server"` files may only export async functions.** Even a type-only
  `export type { X }` re-export crashes the whole module at runtime in dev
  (Turbopack's server-actions loader emits it as a real export, and every
  action in the file then 500s). Import shared types from their defining
  module instead — don't add type re-exports to an actions file.
- **Media upload bypasses Server Actions entirely** (`/api/admin/upload` Route
  Handler) — the action layer's FormData/File encoding proved unreliable for
  uploads.
- **Public-facing writes revalidate narrowly.** `savePostAction` /
  `createPostAction` call `refreshPublic()` (`lib/admin/actions.ts`), which
  revalidates only the tags the saved post actually affects (home,
  daily-events, `article:<slug>`, `category:<slug>` per assigned category) —
  mirroring the WordPress publish webhook's own tag set — rather than a
  blanket "articles" tag. Cache tags are always passed through `safeTag()`
  (`lib/api/client.ts`) because a percent-encoded Khmer slug can exceed Next's
  256-char tag limit; `/api/revalidate` normalizes incoming tags the same way.

## Caching model (public site)

Classic ISR, not Cache Components. The rule that matters most:
**whether a failed read may swallow its error into an empty fallback depends
on what it feeds** (see the header comment in `src/lib/api/client.ts` for the
full reasoning):
1. **Decoration** (a sidebar widget, a menu) — `catch → []` is fine; one dead
   block beats a dead page.
2. **The page's subject** (the list a listing page exists to show) — must
   **throw**. Swallowing bakes a false "nothing here" into a statically cached
   page.
3. **Existence** (anything feeding a `notFound()`) — must **throw**. A
   swallowed error here bakes a cacheable, indexable 404 onto a URL that
   exists.

Throwing during ISR revalidation is the documented Next contract, not a
crash: the last good cached page keeps serving and Next retries on the next
request; at *build* time an uncaught error fails the deploy, which is the
intended trade (a failed deploy leaves the previous one live). Naming
convention: `fetchX` throws (the raw read for a page's subject/existence),
`getX` degrades to empty (for decoration).

## Panda CSS styling system

Styles are authored with `css()`/`cx()` from `@/styled-system/css` (Panda
CSS, config in `panda.config.ts`), generated by `panda codegen` — never hand-edit
anything under `src/styled-system/`. Two token layers:

- **Public site**: semantic tokens like `page.bg`, `text`, `divider` — light
  by default, dark override via `_dark`, keyed off `data-theme="dark"` on
  `<html>` (Panda's `dark`/`light` conditions are remapped to that attribute
  in `panda.config.ts`, not the default `.dark &`).
- **Admin**: `semanticTokens.colors.admin.*` in `panda.config.ts`, consumed as
  `ac.*` string constants from `src/components/admin/tokens.ts` (e.g.
  `ac.surface`, `ac.text`, `ac.accent`). **`ac.*` values are `var(--colors-admin-…)`
  strings, not hex** — that indirection is the dark-mode mechanism, because
  most admin color is applied via inline `style={{ }}` (Panda only extracts
  *static* `css()` calls) and an inline hex literal could never respond to a
  theme change; a `var()` can. Don't hardcode admin hex values or `color:
  "#fff"` — use `ac.*` or the shared primitives in `ui.tsx`.
- **Panda emits into `@layer utilities`; third-party stylesheets (WordPress's
  block-editor CSS) are unlayered, and an unlayered rule beats a layered one
  at *any* specificity** — a `css({ "& .some-vendor-class": … })` override
  will silently lose even though Panda emitted a matching rule. To override
  vendor CSS, use a plain `.css` file imported *after* it (see
  `gutenberg-overrides.css`), not Panda.
- Full palette rationale, contrast measurements, and layout-pattern catalogue
  (the gutterless panel grid, the Phoenix-style table screen, the "document
  sheet" pattern for the article editor, popover/portal/z-index rules) live in
  `docs/admin-design-system.md` — read it before styling any admin screen
  rather than re-deriving these rules from scratch.

## Admin dashboard structure

`src/app/admin/layout.tsx` is the shell: `requireSession()` gate → fixed
`AdminSidebar` + a content column, wrapped in `QueryProvider` (TanStack
Query). `AdminSidebar` (`src/components/admin/AdminSidebar.tsx`) renders a
**capability-filtered nav** — each `NavItem` can carry a WordPress `cap`
(e.g. `list_users`, `manage_options`); an item drops out for a user lacking
it, and an entire `NavGroup` disappears once every item in it does.

Screens live under `src/components/admin/<area>/` (`articles/`, `programs/`,
`media/`, `menus/`, `seo/`, `users/`) plus shared root files:
`ui.tsx` (primitives — `Surface`/`Card`, `Button`, `Input`, `Table`,
`FormCard`/`FormGrid`/`SaveBar`, `StatusPill`, `Dropdown` — compose these
rather than styling a screen from scratch), `tokens.ts` (`ac.*`), `charts.tsx`
(`TrendPanel`, `Sparkline`, `RankBars` — follow the `dataviz` skill's rules
before touching these), `DashboardScreen.tsx` (the Aurora-style gutterless
panel grid), `MediaPicker.tsx`, `ConfirmDialog.tsx`, `Dropdown.tsx` (portals
its menu to `document.body` because `Surface` is `overflow: hidden` and would
clip an absolutely-positioned popover). Corresponding `src/lib/admin/*.ts`
files supply typed reads/writes per area (`posts.ts`, `programs.ts`,
`media.ts`, `menus.ts`, `users.ts`, `settings.ts`, `dashboard.ts`, …), each
normally exposing a fast-path read plus a REST fallback and, where writable,
a companion `*-actions.ts` Server Actions file.

Reference implementations named as the pattern to copy for new screens:
`users/UsersView.tsx` (the Phoenix-style filtered/paginated table),
`SettingsForm.tsx` / `ProfileForm.tsx` (the form screen: `PageHeader` → column
of `FormCard`s → one `SaveBar`).

## The article editor: real Gutenberg + dirty-tracked autosave

`src/components/admin/articles/ArticleEditor.tsx` (settings/chrome/save
orchestration) + `GutenbergEditor.tsx` (the canvas, dynamically imported
client-only because `@wordpress/block-editor` touches `document` at module
scope) use the **actual `@wordpress/block-editor` package** — not a
reimplementation — so the editing surface behaves exactly like wp-admin
(same toolbar, slash inserter, drag handles, keyboard shortcuts). This
replaced an earlier TipTap-based body editor, which round-tripped Gutenberg
block markup as flattened HTML and silently destroyed block structure on
every save (measured against production posts; see the file's header
comments for the round-trip numbers). Both files are unusually heavily
commented with dated, **measured** findings about production WordPress
behavior — read the comments in full before changing either; they're the
record of bugs already found and fixed once.

Key architectural points:
- **Save payload is dirty-tracked per field**, especially the body: `content`
  only rides the save payload when the user actually edited it in this
  session (`bodyRef.current?.isDirty()`), so a metadata-only save (e.g. just
  changing a category) can never flatten/rewrite an existing Gutenberg body.
- **Autosave follows wp-admin's own rule, not a custom one**: only a `Draft`
  (or a not-yet-created article) autosaves, at most once a minute, and always
  writes `status: "draft"` regardless of what the Status radio shows — so
  picking "Published" and waiting doesn't publish early. A `Published` /
  `Pending` / `Private` article is **never** autosaved; leaving it dirty gets
  one plain `beforeunload`/in-app-navigation confirm instead. A brand-new
  article is created by its *first* autosave (not on open) and edited in
  place from then on. There is deliberately **no localStorage backup**
  anymore (an earlier version had one) — see `editor-draft.ts`'s header for
  why that model was replaced: autosave-to-WordPress is legible to writers in
  a way "restore from a local backup" wasn't, and it's WordPress's own
  contract (`autosaveArticleAction` in `lib/admin/actions.ts`).
- **Title** is an uncontrolled `contentEditable` (read via a ref on save),
  because a controlled `contentEditable` fights the cursor; **excerpt** is
  ordinary controlled React state on purpose — it lives in a collapsible
  sidebar panel, and reading an unmounted panel's ref would silently save an
  empty excerpt over a real one.
- Only **core** Gutenberg blocks are registered (`ALLOWED_BLOCKS` in
  `GutenbergEditor.tsx`) — third-party blocks from WP plugins survive a
  round-trip as `core/missing` (byte-identical markup) but render as an
  "unavailable" placeholder; editing those posts' special blocks still
  belongs in wp-admin.
- Editor canvas stays a **light** published-page surface even in dark admin
  mode (WordPress's block-editor CSS is light-only and unlayered — see the
  Panda layering note above); this is a deliberate, documented limit, not a
  bug to fix.

## Working agreements (from `docs/project-context.md` §9 — apply when acting in this repo)

- **No `Co-Authored-By: Claude` trailer on commits** — this project's history
  was rewritten once already to strip them; don't add one even though it may
  be a default elsewhere.
- `origin` is an SSH alias (never plain `git@github.com:`), and the alias name
  is per-machine — two GitHub accounts share these machines. If a push fails
  with "repository not found", check `git remote -v` against `~/.ssh/config`
  before assuming the repo is missing.
- **The owner hand-deploys everything** (Dokploy, WordPress plugin uploads).
  Never assume a plugin zip you see referenced has actually been uploaded to
  production — check `docs/admin/api-integration-status.md` / the session log
  for confirmation, and give numbered, literal steps when something needs a
  manual upload.
- **Writes stay on WP core REST; the fast path is read-only** — don't route a
  write through `fastFetch`.
- Before wiring a new field/screen to WordPress, **verify against REST
  directly first** (an invariant check that doesn't consult whatever it will
  be diffed against, then field-by-field, diffed *after* the frontend's own
  transform) rather than assuming a documented shape still holds — several of
  the "reads/writes that lie" findings in `project-context.md` exist because
  the obvious assumption was wrong.
- Site search is deliberately deferred (per the linked audit) — don't build it
  unprompted.
