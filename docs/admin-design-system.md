# Admin design system

The admin tool's visual language, as of the 2026-08-05 restyle. **Read this
before styling any admin screen** — the point of a system is that screens
inherit rather than each inventing.

Companion docs: `docs/project-context.md` (backend + operational traps),
`docs/session-log.md` (session-by-session hand-off).

---

## 1. The brief, and what it replaced

The owner picked two reference dashboards — **Phoenix**
(`prium.github.io/phoenix/v1.24.0/`) and **Aurora**
(`aurora.themewagon.com/dashboard/ecommerce`) — and asked for their look across
the whole tool, replacing the previous "bento / soft depth / no tinted chips"
language, which is now **retired**.

**The split, decided and locked:**

> **Aurora sets the frame. Phoenix sets the content.**

Aurora contributes the shell — canvas, spacing rhythm, large radii, card
anatomy (title + subtitle + actions) and, above all, the **gutterless divider
grid**. Phoenix contributes the working surfaces — dense tables with checkbox
columns, sortable headers, badges, in-card pagination.

The reasoning: this tool is ~70% lists and forms. Aurora is prettier at rest,
Phoenix is better at work, and an admin is a working tool inside a frame.

**Deliberately NOT adopted:** their blue accent (AMS is red — adopting blue
would be wearing another company's identity), their donuts and gauges, their
maps (no geo data exists), and their promo/upsell cells.

**Tinted icon chips are back**, with a rule: only where the icon carries
meaning (the Needs-you queue rows), never as decoration to stop a sparse card
looking empty.

---

## 2. Colour — measured, not chosen

Everything lives in `panda.config.ts` under `semanticTokens.colors.admin`, and
is consumed through `ac.*` in `src/components/admin/tokens.ts`.

**`ac.*` values are `var(--colors-admin-…)` strings, not hex.** That indirection
IS the dark-mode mechanism: the admin applies most colour through inline
`style={{ }}` (because Panda only extracts static `css()`), and an inline literal
hex can never respond to a theme. A `var()` can.

### The palette

**True-neutral greys**, with teal as the single accent and as categorical slot 1.

| role | light | dark |
|---|---|---|
| canvas / surface / hover / sunken | `#F7F7F8` / `#FFFFFF` / `#F3F3F5` / `#EEEEF0` | `#0C0C0E` / `#151518` / `#1E1E22` / `#09090B` |
| rowLine / border / borderStrong | `#EEEEF0` / `#E3E3E6` / `#C7C7CC` | `#252528` / `#2C2C30` / `#46464C` |
| text / sub / muted / faint | `#18181B` / `#52525B` / `#6B6B75` / `#888892` | `#F4F4F5` / `#C0C0C6` / `#96969E` / `#75757D` |
| accent (fill) / accent-hover | `#0E7C7B` / `#0A6160` | `#17A8A4` / `#22C3BE` |
| accent-fg (label on the fill) | `#FFFFFF` | `#0B0A0C` |
| accent-text (clickable text) / focus | `#0B6664` | `#5EEAD4` |
| accent-tint (selection) | `rgba(14,124,123,.08)` | `rgba(23,168,164,.16)` |
| good / warn / danger | `#15803D` / `#B45309` / `#B42318` | `#4ADE80` / `#FBBF24` / `#FF7B72` |
| data (cat 1) → cat 4 | `#0E7C7B` `#2563EB` `#D97706` `#A21CAF` | `#2FB8B2` `#2563EB` `#D97706` `#AE2ABE` |

#### Why neutral, and why teal

**Do not re-tint the neutrals.** They have been cool slate and they have been warm
cream, and both were wrong for the same underlying reason: a tinted grey takes a
position relative to the logo, and the AMS mark spans violet (`#59174D`) through
crimson to gold (`#DE9838`). Any cast either fights part of that range — cool
slate against the warm end — or muddies against it, which is how the cream ramp
ended up reading as beige. A true neutral (saturation ~0.06, as close to grey as
hex gets) takes no position at all. Under a multi-hue mark the logo supplies the
colour and the shell supplies the quiet.

The accent is teal because it is the **complement** of that violet-to-gold run. It
is the one strong hue that can never be mistaken for brand chrome, and it stays
clear of `warn` (amber) and `danger` (red), so an action never reads as a warning.
It replaced, in order: AMS red (collided with `danger`), Strapi violet, and a
split of neutral fills with violet ink. That split existed only because a
*neutral* accent renders link text at 1.00:1 against body text — identical,
undiscoverable, a WCAG 1.4.1 failure. A coloured accent doesn't have that problem,
so the palette collapses back to one hue.

**`data` deliberately shares the accent's family.** One cool hue for the whole
tool beats an accent and an unrelated chart colour arguing. It is a step deeper
and less green than the old `#0D9488`: on cool slate that read as a minty wash,
which was most of why the charts felt generic — the hue was never really the
problem, a cool mint on a cool grey ground was. Warm hues were considered for
charts and rejected: amber already means `warn`, red already means `danger`, so a
chart in the brand's own orange stops being readable as data.

#### Three traps

- **`accent-fg` is theme-aware** — white on light, near-black on dark. Hardcoding
  white puts an invisible label on the brighter dark fill. This has bitten once
  already: 13 hand-rolled buttons across 8 files had `color: "#fff"` baked in.
  Use `ui.tsx`'s `Button`, or the token.
- **`accent-text` is a deeper step than `accent`**, not the same value. `#0E7C7B`
  as *text* drops to 4.35:1 on `surfaceSunken` and misses AA; the fill doesn't
  care, because it is measured against the white on top of it, not against the
  page.
- **Do not take ink colours from a brand palette.** The AMS brand set proposed
  its "sand taupe" (`#C9B8A8`) for secondary text; that measures **1.76:1**,
  nowhere near readable. Brand palettes are picked for posters, where nothing has
  to hold 4.5:1 at 12px. Every ink step above is derived and measured against all
  four surfaces, which is also how `faint` landed on `#888892` — anything lighter
  fell to 2.91 on `surfaceSunken` and stopped clearing the 3:1 that chart axis
  labels need.

### What was validated, and how

Run these again before changing any of it.

**Categorical hues** — `scripts/validate_palette.js` from the dataviz skill:

```
node scripts/validate_palette.js "#0D9488,#2563EB,#D97706,#A21CAF" --mode light --surface "#FFFFFF" --pairs all
node scripts/validate_palette.js "#12A899,#2563EB,#D97706,#AE2ABE" --mode dark  --surface "#131926" --pairs all
```

Both **pass every check on ALL pairs** (lightness band, chroma floor, CVD
separation, normal-vision floor, contrast vs surface).

**FOUR IS THE CEILING, and it is not a preference.** Six slots failed all-pairs
CVD separation — so did the skill's own reference palette at six. A fifth series
folds into "Other" or the chart facets into small multiples; it never gets a
new hue. Findings worth keeping:

- **Violet `#7C3AED` and blue `#2563EB` are indistinguishable under
  deuteranopia** (ΔE 0.4). Violet is out.
- `#BE123C` validated as slot 4 but was rejected on meaning — it reads as the
  brand action red. `#A21CAF` fuchsia was taken instead.

**Text / status / focus** — WCAG, checked separately because the validator's
scope is categorical only (`scratchpad/contrast.mjs` in the session folder):
every text and status role clears **4.5:1 on surface, canvas AND sunken in both
themes**; `faint` and the focus ring clear 3:1. That pass caught two real
problems — `muted` failing at 4.24:1 on tinted backgrounds, and `faint` sitting
at 2.56:1 while carrying chart axis labels.

Hairline dividers are deliberately below 3:1. WCAG 1.4.11 covers information
needed to identify a *control*; a row separator carries none, and forcing 3:1 on
it makes every table read as a grid of boxes. Controls are identified by their
**fill** (`surfaceSunken`) plus the focus ring, both of which are checked.

---

## 3. Dark mode

- Driven by `data-theme="dark"` on `<html>` — **the SITE's existing mechanism**,
  not a second one. The root layout (`src/app/layout.tsx`) has a pre-paint
  script; the public header's `ThemeToggle` and the admin's `AdminTopBar` both
  write the same `ams-theme` localStorage key.
- Three modes: light / dark / **auto**, where auto follows the visitor's
  **clock** (dark 18:00–06:00), not the OS. `autoIsDark()` is duplicated in the
  layout script and both toggles — **keep the three in step**.
- The admin's toggle reads the stored mode via `useSyncExternalStore`, not an
  effect. The repo's React-compiler lint forbids `setState` in an effect, and
  the reason applies here: the effect version renders once with the wrong value
  and then corrects itself.
- Dark values are **selected steps, not an inversion**. Shadows get their own
  values too — a 5%-black shadow is invisible on a near-black canvas.

**Known limit, decided:** the Gutenberg article editor keeps a **light canvas**
in dark mode, with dark chrome around it. WordPress's block-editor stylesheets
are light-only and *unlayered*, so they beat Panda at any specificity (see
`gutenberg-overrides.css` and the Session 16 finding). A white document is
correct for an editor anyway.

---

## 4. Primitives — `src/components/admin/ui.tsx`

Every screen composes these. Change them here, not per screen.

**Shell:** `Surface` (aliases `Card`/`BentoCard`) · `CardHeader` · `PageTitle` ·
`Breadcrumb` · `PageHeader` · `SkelTile`

**Controls:** `Button` (primary/secondary/ghost/danger × sm/md) · `buttonClass()`
for real links · `IconButton` · `Input` · `Textarea` · `Field` · `Checkbox`
(a real `<input>`, indeterminate supported) · `Segmented`

**Forms:** `FormCard` (titled band + hairline + padded body) · `FormGrid`
(2/3 columns, collapsing) · `SaveBar` (primary action + `role="status"` result)

**Data:** `StatusPill` · `Badge` · `Table`/`Th`/`Td`/`Tr` · `EmptyState` ·
`TableFooter`

`SearchInput` (in `Dropdown.tsx`) takes EITHER `name`/`defaultValue` — a form
submits it into the URL, which is what the paged screens do — or
`value`/`onValueChange` for the screens that filter a list already in memory
(Programs, Categories) and so have nothing to submit.

Charts live in `charts.tsx`: `TrendPanel`, `Sparkline`, `RankBars`,
`ShareRule`, `Delta`, plus `barPath`/`niceMax`/`dayLabel`.

**Geometry:** cards 14–16px radius, controls 9–10px, buttons 36px (30 sm),
focus = 2px `ac.focus` at 2px offset, everywhere.

---

## 5. Layout patterns

**The panel (Aurora's gutterless grid)** — the dashboard's signature. One
bordered surface, `display: grid`, cells butting together with 1px rules drawn
by the cell (`borderRight`/`borderBottom`) only where a neighbour actually sits,
so no rule ever lands on the panel's own edge. See `Cell` in `DashboardScreen`.

**The table screen (Phoenix's Members)** — `PageHeader` (trail → title + sub →
actions) → one filter row → `Surface` wrapping `Table` → `TableFooter`. Header
band is `surfaceSunken` with 11px uppercase letter-spaced labels; rows separated
by `rowLine`; checkbox column 44px; trailing overflow `IconButton`.
Reference implementation: `users/UsersView.tsx`. **Copy it.**

**The document sheet (the article editor)** — the Gutenberg canvas is a *page*
lying on the tool, not a panel of it: gutter → 768px column → bordered,
rounded, shadowed sheet holding the cover, title and blocks. The excerpt sits
OUTSIDE the sheet, because it never renders in the published body and putting it
on the page surface would claim it does. See `GutenbergEditor.tsx`
(`documentAreaClass` / `documentColClass` / `sheetClass`).

The rule that generalises, for any surface that PREVIEWS published output:

- **Paint it with the published palette, not an admin token.** The sheet uses
  `publishedPageBg` (`tokens.ts` → `var(--colors-page-bg)`, the public site's
  own `#ffffff` / `#0e0e12`), not `ac.surface`. The two are identical in light
  mode and diverge in dark, so an admin token would look correct right up until
  someone opened the editor at night. Matching the real surface also stops the
  editor inventing artifacts: images with white backgrounds were showing a box
  edge on the old `#F6F7F9` canvas that disappears once published.
- **Anything that reads as "recessed" on a preview sheet must use
  `surfaceSunken`, not `surface`.** `surface` IS the sheet in light mode, so a
  `surface` fill is invisible there — this is what made the title's focus state
  silently lose half its signal.
- **No `overflow: hidden`, despite the radius.** WP's drag handles, block
  appender and drop indicator legitimately paint outside the block list.

Rules that fell out of rolling this across nine screens:

- **The row is never the link** — a `<tr>` cannot be an anchor. The title cell
  carries it, which also gives keyboard users one stop per row instead of one
  per cell. (A card in a GRID is the opposite: there the whole card is the
  anchor, since it has no other action.)
- **Row actions live in a trailing right-aligned cell**, hidden at `opacity: 0`
  and revealed on row hover — with `_focusWithin` so they are never
  keyboard-unreachable.
- **A footer with no pager still gets a `TableFooter`**, carrying the count
  alone. Screens whose read returns everything in one call (Programs,
  Categories) must not grow dead Previous/Next buttons.
- **Inline cell editors don't use `Input`.** A 36px control inside a 12px-padded
  cell makes the row jump on click; the cell editors are 30px on the same fill
  and border tokens (`cellInput` in MenuManager / CategoryManager).

**The form screen** — `PageHeader` → a column of `FormCard`s → one `SaveBar` at
the bottom. Fields are `Field` + `Input`/`Textarea`; side-by-side pairs are
`FormGrid`. Reference: `SettingsForm.tsx` and `ProfileForm.tsx`.

⚠ **A menu drawn OVER a panel cannot be laid out INSIDE it.** `Surface` is
`overflow: hidden`, so an absolutely-positioned popover in a toolbar gets
sliced at the panel's edge — that is what cut the Articles Category/Author
filters in half. `Dropdown` therefore portals its menu into `document.body` as
`position: fixed`, measures the trigger in the CLICK handler (never an effect —
§React-compiler lint), flips above when down is cramped, caps its height at
420px with internal scroll, and anchors to whichever horizontal edge lets it
grow inwards. Overlay z-index ladder: dropdown menu 1000010/11 > Gutenberg
popovers 1000001 > drawers 1000 > ConfirmDialog 120 > screen modals 100; the
media dialog (1000050) and the editor toast (1000060) stay on top of all of it.
Copy this anatomy for any new popover.

**`<select>` stays native.** `Dropdown` is a filter control that pops a menu out
of the flow; inside a form the browser's own picker is better at long
hierarchical lists and keyboard type-ahead. The shared `selectClass` in each
form file puts it on the same 36px/9px/sunken geometry as `Input`. This is only
safe because `color-scheme` is set per theme on `:root` — see §3.

⚠ **`<option>` indentation must use NON-BREAKING spaces.** A `<select>` collapses
ordinary leading whitespace, so plain spaces silently flatten the category tree
in every parent picker. `CategoryManager` names it rather than hiding it inside a string literal:
`const INDENT = "\u00A0\u00A0"`.

**Chrome:** `AdminSidebar` (232px, grouped: Overview / Content / Site,
capability-filtered, a group disappears when all its items do) +
`AdminTopBar` (sticky 60px: search, theme, notifications, account menu).

---

## 6. Charts — the rules that shaped them

Follow the **dataviz skill** (load it before writing chart code).

- **NEVER a dual axis.** Pageviews (thousands) and stories published (single
  digits) are two stacked plots sharing one x-axis and one crosshair — not one
  plot with two y-scales, which invents a correlation the data does not contain.
- One series per plot → **no legend**; the heading names it.
- 2px lines, ~10% area wash, bars capped at 24px with a 4px rounded data-end and
  a 2px surface gap, **solid** hairline gridlines (never dashed), axis text in
  ink tokens never the data colour, direct-label the endpoint only.
- Crosshair snaps to the nearest day for pointer **and** keyboard.
- Sparklines in KPI cells repeat the panel's series. That is redundant by the
  skill's own reckoning and is there because the owner asked for the reference
  anatomy — kept bare (no axis, labels or tooltip) so it reads as shape.

---

## 7. Rollout status

**Every admin screen is on the token layer AND on the primitives.** Dark mode
works tool-wide; the roll-out finished in Session 19.

| screen | colour | composition |
|---|---|---|
| Dashboard | ✅ | ✅ Aurora panel grid, approved |
| Users | ✅ | ✅ Phoenix table, approved — the list reference |
| Articles list | ✅ | ✅ same table anatomy as Users |
| Sidebar + top bar | ✅ | ✅ approved |
| Media | ✅ | ✅ header + filter row + `Surface`-wrapped grid + `TableFooter` |
| Programs | ✅ | ✅ `Surface` cards (grid) / real `Table` (list), `Segmented` toggle |
| Menus | ✅ | ✅ `FormCard` preview + `Table`; order commits from the footer |
| Categories | ✅ | ✅ `Table` with indent-as-depth; add-child is a `colSpan` row |
| Tags | ✅ | ✅ same table anatomy as Users |
| Roles | ✅ | ✅ `PageHeader` + `Surface` disclosures |
| Settings, Profile | ✅ | ✅ `FormCard` + `FormGrid` + `SaveBar` — the form reference |
| Login | ✅ | ✅ `Surface` + `Field`/`Input`/`Button`, sidebar's brand lockup |
| Article editor + MediaPicker | ✅ | ⚠️ original layout; canvas stays LIGHT in dark by design |

The one remaining ⚠️ is the Gutenberg editor, and it is deliberate — see §3. Its
surrounding chrome is themed; the document canvas is not, because WordPress's
block-editor stylesheets are light-only and unlayered.

### The sweep's non-obvious parts, if it ever needs redoing

The same light-mode hex meant different things in different places, and those
**diverge in dark** — a blind find-and-replace would have been wrong:

- `#F5F5F4` as an avatar/chip fill → `surfaceSunken`; as a hairline → `border`
- `#B42318` as text → `danger`; as a **button fill** → `dangerFill` (the dark
  `danger` step is a text colour, far too light to put white on)
- shadow strings → `shadowSm`/`shadowMd`, which carry their own dark values
- composite strings (`"1px solid rgba(180,35,24,0.18)"`) needed template
  literals, not value swaps

One literal survives on purpose: white on the danger fill in `ui.tsx`, measured
at 5.36:1 in dark.

`color-scheme` is set on `:root` in `globals.css` per theme. Without it a dark
admin still drops a **white `<select>` popup** — native UI is the one thing CSS
variables cannot reach.
