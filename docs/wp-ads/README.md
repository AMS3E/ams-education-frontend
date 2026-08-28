# MSA popup on the legacy WordPress site — handoff

**This is NOT about this repo's Next.js site.** The target is the legacy
WordPress site **`https://infotainment.ams.com.kh`** (Vodi Child 1.2.7, header
style "Header v3"). Nothing here ships from `ams-infotainment-frontend`; this
folder is only where the reference copies and the plan live.

**Task:** MSA gave us a new popup ad tag. Add it to whatever the site already
runs, without breaking or replacing the existing ads.

```html
<script defer src="https://msacam.com/ads/revive-popup.js?v=7" data-zone="94"> </script>
```

**Status 2026-08-16 END OF DAY: v2.9.0 LIVE ON BOTH SITES (verified in
served HTML + user-confirmed working).** Both run "Show both" on EVERY
pageview, 2s breather, sequential in both lead orders; underlay selector
`[id^="damrei-inner-clip-content"]` pasted on both, so Underlay seen /
Overlap count for real; Damrei + outcome stats filling since upload. Open
question parked WITH DAMREI: their desktop takeover zones answer HTTP 204
on every request (4/4 infotainment zone 1739240031, economy 1739329474) —
no desktop campaign served; our side provably requests correctly (session
log SESSION 30). MSA's ~33% mobile fill question also parked with MSA.
§20 below has the v2.9.0 record.**

**Status 2026-08-16 (v2.8.2, superseded by v2.9.0): homepage-only verification
of v2.8.1 missed an article-page failure — the always-on underlays froze the
Damrei-lead close-watch, so articles never got the MSA trailer. v2.8.2
(§19.2) excludes non-popup zone containers from the popup-visibility scan;
zips built, UPLOAD + PURGE PENDING. Same probe finally yielded the §7.1
underlay selector: `[id^="damrei-inner-clip-content"]`. User decision: "Show
both on" = EVERY pageview.**

**Status 2026-08-16 (earlier, superseded): v2.8.1 LIVE ON INFOTAINMENT AND
VERIFIED ON THE HOMEPAGE — the sequential "Show both" works in both orders.** Live CDP watch after the
v2.8.1 upload: Damrei-lead pageview → takeover 2.3→8.6s, `second-msa` at
10.5s (close + 2s breather), MSA 10.7→16.2s; MSA-lead pageview → MSA
1.9→7.1s, `second-damrei` at 9.3s, takeover 9.6→15.9s; second pageview of
the same visit → ONE popup, no trailer, `amsMsaBothDone` set. Zero overlap
anywhere. Economy remains v2.4.1 (upload its v2.8.1 zip whenever Show both
should reach that site). The v2.8.0 story, kept for the record:
Live CDP watch after the v2.8.0 upload: scope + breather baked correctly,
MSA-lead pageviews fine, second pageview of the visit correctly single —
but on Damrei-lead pageviews no `second-msa` ever came. Live DOM probe
found why: the PTO container (`gax-inpage-async-1721642896`) holds Gamma's
three `<script>` tags in a 0-wide/10480-tall box from page load on, ad or
no ad — the takeover renders in a SEPARATE anonymous overlay div — so
`damreiPopupVisible()`'s `childElementCount>0 && offsetHeight>50` container
test was ALWAYS true and the phase-2 close-watch waited forever (trailer
skipped at the 30s ceiling). **v2.8.1** makes the container test measure
rendered creative children (script/style/noscript/link skipped, >10×10 box
required); the big-overlay scan remains the second signal. Same fix also
un-blinds the v2.3.0 `fb_msa` backfill judgement, broken the same way since
it shipped. Re-verified in the harness with a live-replica container
(scripts-only, 0-wide): trailer fires at lead-close + breather in both
orders. Upload the v2.8.1 zip + purge AMS Cache.

**Status 2026-08-16: v2.7.0 LIVE ON INFOTAINMENT, v2.8.0 BUILT + ZIPPED (superseded
same day, see above).** The user uploaded v2.7.0, set Desktop zone 93, switched "How
to split" to **Show both** — and then watched the two popups OVERLAP on real
pageviews. Confirmed by CDP-driven headless Chrome against the live site:
Damrei-lead pageviews had both stacked ~4.1–8.7s (Damrei's auction lands
~2.8s, the +3s page-load timer fired MSA ~1.3s later), MSA-lead ~4.1–6.5s
(MSA auto-closes only at ~5s). v2.7.0's trailer was a clock; nothing waited
for the lead to close. **v2.8.0 (§19) makes the trailer close-triggered**
(lead appears → lead disappears → breather → fire; no-show deadline so a
declined lead doesn't waste the pageview) and adds two settings: "Breather
between popups" (default 2s) and **"Show both on" (default: FIRST pageview of
the visit** — later pageviews take turns, one popup each; owner-approved
behaviour change on upgrade). Upload = the standing runbook: zip via
Plugins → Add Plugin, then **purge AMS Cache**. The ~33% fill-rate question
for MSA is parked (user decision 2026-08-16); the underlay selector is still
unconfigured (§7.1) — overlap counters stay mechanical zeros until it's
pasted in. Economy: last known live v2.4.1.

**Status 2026-08-13: v2.0.0 DEPLOYED AND VERIFIED LIVE** — the plugin serves
the whole Damrei stack + referee from wp_head (checked in served HTML), the
no-Gamma child header is live via aaPanel, and MSA's desktop popup (zone 89,
800×450 16:9, Angkor "Together As Fan") is enabled **site-wide** at desktop
share 80 — the seeded `economy` scope was cleared because THIS SITE HAS NO
ECONOMY CATEGORY (checked via REST: 26 categories, all entertainment/
lifestyle). MSA's "try it on Economy" almost certainly means AMS's separate
Economy site — CONFIRMED 2026-08-13: economy.ams.com.kh runs the same Gamma
stack from its own theme (same siteIds, its own underlay/PTO zone ids).

**Status 2026-08-13 (late): v2.3.0 turned out to be ALREADY LIVE** (served HTML
carries `alternate = true` + the v2.3 fallback code, found while root-causing),
**and v2.3.1 is BUILT + ZIPPED, NOT YET UPLOADED — it fixes the bug that made
Damrei invisible on mobile since v2.0. Read §14 before anything else.** The
short version: the v2.0 "transition guard" no-op'd `gammatag.sendRequest`,
but Gamma's gaxpt library re-calls that public function to advance zone by
zone — so only the LAST-defined zone was ever requested (PTO Desktop, which
204s on mobile). Damrei's mobile popup could not appear for anyone. Also
found: the 640×1386 Underlay zones have NEVER been requested on either site —
gaxpt silently drops zones with no placeholder div, and none ever existed.
v2.3.1 deletes the guard, auto-creates the underlay containers (new per-row
"Auto div" flag), and aligns devices/popup flags with the §0 contract via a
one-time upgrade of saved settings. New in 2.3.0 (user request after
Gamma's per-visitor frequency cap made Damrei-win pageviews look blank while
testing): **Rotation "alternate"** (new default) — strict turns per visitor
per device (localStorage `amsPopupTurn_m`/`_d`, Damrei first; storage blocked
→ random flip; ineligible pageviews resolve "damrei" WITHOUT consuming a
turn) — and **no-fill fallback** (default on): Damrei's turn empty at ~4.5s
(container + big-overlay check; delivered-but-hidden counts as empty) → MSA
fires late (`fb_msa`); MSA's turn a confirmed no-fill at ~12s → the skipped
Damrei popup zones get a late define+request via `window.AMS_LATE_DAMREI`
printed by the head script (`fb_damrei`). A pageview only stays blank when
both sides decline. **Verified live 2026-08-13 (before this build): the v2.2
referee flip is fair (5/5 split over 10 loads), Damrei fills 5/5 flip-wins
for FRESH profiles — the "Damrei never shows" impression was Gamma's
per-visitor cap hitting the heavily-refreshing tester; take low real-traffic
fill to Damrei ad-ops if the stats confirm it.**

**Status 2026-08-13 (economy package, DEPLOYED same day): plugin v2.4.1 is
ACTIVE on economy** (zone table verified showing economy ids, Serve Damrei
zones ON, no-Gamma child header in place via aaPanel at www/644) — MSA then
issued economy's own tags: **mobile zone 90** (not 94), desktop 89 shared;
v2.4.2 makes the mobile-zone seed site-aware (90 on economy), a seed-only
change — the live installs keep their saved fields (economy's Mobile zone
edited to 90 by hand in settings). Original build record:
ONE source file (`docs/wordpress/ams-msa-popup/`), TWO per-site zips built
from it (user preference — a zip per site, so there is never doubt which
numbers a given upload carries): `ams-msa-popup-infotainment.zip` and
`ams-msa-popup-economy.zip`, each with its site PINNED at build time
(`AMS_MSA_POPUP_SITE`), hard-wiring that zip's zone seed — the host check is
only a fallback for an unpinned build. Both zips keep the INNER folder
`ams-msa-popup/` (the plugin's WP identity — never rename it). Edit only the
source folder; `ams-msa-popup-infotainment/` and `ams-msa-popup-economy/` are
generated build output. Saved settings still beat seeds, so the live
infotainment install does not move on upgrade. Companion no-Gamma child
header for economy: `docs/wp-ads/economy-vodi-child-header-v3-nogamma.php`.
**Read §15 for the economy zone table, package contents, and the deploy
runbook.** Nothing changes on either site until a zip is uploaded (and on
economy, configured — it installs disabled). Uploading the infotainment zip
also delivers the still-pending v2.3.2 underlays-articles-only change.

The v2.2.0 record (in this zip, deployed 2026-08-13 as part of testing): It carries: (a) the rename to **"AMS Ads Manager"** (display name,
menu "Settings → AMS Ads", page slug; folder/slug stays `ams-msa-popup` on
purpose — it's the plugin's WP identity, changing it would fork the plugin and
orphan settings/stats); (b) **the DESKTOP REFEREE** — user decision 2026-08-13
after MSA's desktop popup was seen stacking on top of Damrei's PTO Desktop
takeover (confirmed in live DOM dumps: PTO served by Gamma + MSA popup at
z-index max on the same pageview — the §13.5 collision, made constant by
desktop share 80 site-wide). The referee now flips on both devices: desktop p
= Desktop share inside the category scope (scope folded into the printed
probability — per-URL, cache-safe), PTO Desktop is popup-flagged (a one-time
`plugins_loaded` upgrade routine flags it in SAVED settings too, since the
user's zone list predates the new seed), and the footer obeys the flag on
desktop when the new "Desktop referee" setting (default ON) is set. Untick it
to return to additive stacking. Both shares set to 50 by the user. The
companion no-Gamma header source is
`docs/wp-ads/vodi-child-header-v3-nogamma.php`.

**Status as of 2026-08-12: v1.3.0, UPLOADED and LIVE, stats flowing.** First two
days on the stats screen: 2026-08-11 pv ~490 / fired 255 / shown 115 (45%);
2026-08-12 pv ~730 / fired 519 / shown 142 (27%). Our side is healthy (roll
wins = fired, requests reach sknteam) — **the fired→shown gap is MSA's Revive
declining to serve; the ~33% fill rate is the number to take to MSA** (§7.2:
campaign frequency cap? impression pacing/budget?). Underlay seen / Overlap sit
at 0 **because the Damrei selector is still unconfigured** (§7.1), not because
overlap doesn't happen — the user watches both popups on real pageviews (MSA
first ~1s, Damrei's slower Gamma auction lands ~2–3s). Post-v1.2.1 versions:
**v1.2.2** preloads the sknteam loader in parallel with MSA's script (one fewer
sequential fetch inside MSA's 3.5s window); **v1.3.0** retries once when the
fill poll times out — MSA's cleanup resets its guard flag, and the warm-cache
second attempt nearly beats the 3.5s deadline every time (`retry` counter).

**Status as of 2026-08-11 (build day, kept for history): BUILT, v1.2.0, not yet uploaded.**
Defaults changed post-build at the user's direction: **mobile share 50%, cap
OFF** (see the §6.9 amendment). v1.2.0 adds a **stats screen** at the top of
Settings → MSA Popup: per-day counters (pageviews sampled 1-in-10, roll wins,
fired, shown, fill rate, reader-close vs auto-close, underlay sightings,
overlap) fed by at most one `sendBeacon` POST per pageview to
`ams-msa-popup/v1/e`, aggregated into one `{prefix}ams_msa_popup_stats` table
(day+event counters only, nothing per-visitor; table dropped on uninstall).
Stats have their own on/off toggle. Clicks are not countable from our side
(cross-origin iframe) — MSA's/Gamma's dashboards stay billing truth.
The plugin lives at `docs/wordpress/ams-msa-popup/` and the upload zip at
`docs/wordpress/ams-msa-popup.zip` (Plugins → Add Plugin → Upload). It installs
**disabled** — configure Settings → MSA Popup, then tick Enabled. Underlay
detection defaults to **log-only**, and the Damrei signature is a *setting*
(one CSS selector per line), so wiring it in later needs no redeploy: while the
selector box is empty, every checked pageview logs candidate elements
(`AMS_POP {event:"underlay-check", candidates:[…]}`) — the §7 console snippet is
now automated. Facts in §7 still need collecting.

---

## 0. CONTRACT MODEL — corrected 2026-08-13, overrides older assumptions below

From the user, after v2.2.0 went live: **Damrei sells TWO separate products
here.** (1) The **underlay** (zones 1721642630 / 1722239706) — Damrei is the
ONLY underlay contract, so it must run on EVERY pageview, never refereed.
(2) The **popup** — BOTH Damrei (the PTO zones: PTO Mobile 1721642896, PTO
Desktop 1739240031) and MSA (zones 94 mobile / 89 desktop) hold popup
contracts, and THAT is the pair the referee splits, per device. Also from the
user (2026-08-13): **the underlay product serves MOBILE + TABLET only** — the
UA regex (`Mobi|Android|iPhone|iPad|iPod`) covers both, so the underlay rows
should carry Device = Mobile (UA); a desktop pageview never shows an underlay
and that is correct, not a bug. Live DOM
checks agree: Damrei's popup renders (ad-exchange.js + takeover) arrive in
the **PTO** containers, not the "Underlay" ones. This means §3's "the 640×1386
Underlay zones are the popup the user actually sees" and the §12 referee
(which wrapped the underlay zones) were aimed at the WRONG zones — the §12
mobile 50/50 was really rationing the always-on underlay while Damrei's
actual popup (PTO Mobile) kept firing additively. Fixed via the v2.2.0
settings table alone: Popup (referee) flag OFF on both Underlays, ON on both
PTO zones. When reading everything below, remember: refereed = PTO zones,
always-on = underlays.

## 1. The files in this folder

| File | What it is |
| --- | --- |
| `info-header-v3.php` | **The header as it was before the referee** (still byte-identical to the PARENT's copy). Corrected 2026-08-12 via full theme export: the live file was `wp-content/themes/vodi/header-v3.php` — the **parent**, not the child; vodi-child had no header override. The referee patch (§12) added one. |
| `vodi-child-header-v3.php` | **The live header since the §12 referee shipped.** The child-theme override: `info-header-v3.php` + the `AMS_POPUP_WINNER` referee + the two underlay zones wrapped. WordPress loads it instead of the parent's copy. |
| `vodi-child-function.php` | The live child `functions.php` (1474 lines). Relevant line: **370**, where `ads.js` is enqueued. |
| `ads.js` | The child theme's responsive-Revive helper. Matters because it **collides** with the MSA popup — see §5. |
| `header-v3.php` | **A TRAP for infotainment work. Ignore it there.** Provenance SOLVED 2026-08-13: its Meta Pixel (`694960145106572`), Metricool hash, and Dailymotion token all match **economy.ams.com.kh's live header** — it is an old ECONOMY-site backup (outdated even for economy: no `ads.amscloud.cc` loader). Still never merge from it; the current economy header is `economy-header-v3.php` below. |
| `economy-header-v3.php` | **Economy's live parent header as exported** (`themes/vodi/header-v3.php` from `themes.tar.gz` — vodi-child has no override there either). The pre-package record and the content the no-Gamma override was derived from. See §15. |
| `economy-vodi-child-header-v3-nogamma.php` | **The economy no-Gamma child override (v2.4.0 package, not yet deployed).** Economy's parent header minus the Gamma loader/defines/dead-pop blocks, plus the bgColor XSS fix — same treatment as infotainment's `vodi-child-header-v3-nogamma.php`. Deploys to economy's `wp-content/themes/vodi-child/header-v3.php`. See §15. |
| `themes.tar.gz` | **Economy.ams.com.kh's full `wp-content/themes/` export** (vodi, vodi-child, vodi-BK, twentytwentyfive), obtained 2026-08-13. The source of every economy finding in §15. |

## 2. What runs on that site today

Four ad systems coexist, all hand-pasted into the theme. **There is no ad plugin
and no ad manager** — "adding an ad" there means editing `header-v3.php`, or
pasting an `<ins>` block into post content.

### A. Gamma Platform, labelled "Damrei" — the main one

Loader `//ssp-cdn.gammaplatform.com/js/gaxpt.min.js`, zones declared via
`gammatag.defineZone(...)` at `info-header-v3.php:87-177`, fired by
`gammatag.sendRequest()` at line 175.

| Zone | id | Size | Placeholder div? |
| --- | --- | --- | --- |
| Underlay | `1721642630` | 640×1386 | **none — self-injecting** |
| Underlay - 2 | `1722239706` | 640×1386 | **none — self-injecting** |
| MR1 Zone2 | `1726823765` | 300×250 | none found |
| MR1 | `1721642412` | 300×250 | none found |
| MR1 Desktop | `1728357404` | 300×250 | none found |
| Footer Mobile | `1725858296` | 720×250 | line 306 |
| Footer Desktop | `1725879986` | 728×90 | line 310 |
| PTO Mobile | `1721642896` | 282×370 | line 389 |
| PTO Desktop | `1739240031` | 1600×900 | line 392 |

Also active: a **Damrei video in-view** unit (obfuscated block at lines 218-268)
that pulls VAST from `tag.gammaplatform.com` (`wid=1721642224`,
`zid=1752035314`) and injects a player from `damreicdn.b-cdn.net`.

**The 640×1386 Underlay zones are the popup the user actually sees.** See §3.

### B. AMS's own Revive Adserver

`<script async src="//ads.amscloud.cc/www/delivery/asyncjs.php">` at line 66 —
almost certainly the `revive-ads` container on the company's Dokploy box.
Publisher id `55aa4b5dd75ab774bd198a60f6c237bc`. Zones **9, 10, 11, 12** are
pasted as `<ins data-revive-zoneid="…">` blocks **into post content**, not the
theme.

### C. MSA — the new one

`https://msacam.com/ads/revive-popup.js?v=7`, `data-zone="94"`. Delivers from a
**third** Revive instance: `https://sknteam.com/www/delivery/asyncjs.php`,
publisher id `787804e582d413f05180b1bcf7b4d832`.

### D. Legacy, dead

`adservermsa.gpas.co` — the `ajs.php` block is commented out, and the
`avw.php?zoneid=228` fallback only fires for JS-disabled visitors.

## 3. The correction that reshaped the plan — READ THIS

An early conclusion in this session was **"no popup is running on the site."**
**That was wrong.** The test was wrong: it searched the fetched HTML for
placeholder `<div>`s.

**Gamma's Underlay format does not use a placeholder.** It injects its own
container at runtime, after `sendRequest()`. A static `curl` of the page can
never see it. The user confirmed from their own browser that a popup *does*
appear — intermittently, which is normal ad-server fill/capping behaviour.

What IS genuinely dead is the older `_ase` / `ad-exchange.js` pop block at
`info-header-v3.php:315-384` — every line of it is commented out. Don't
resurrect it; besides being disabled it has two bugs (`var zoneIds = []` is
empty, and its `document.write` runs inside a `DOMContentLoaded` handler, which
implicitly calls `document.open()` and **blanks the page**).

**Rule for next time: never conclude an ad is absent from static HTML.** Verify
in a real browser, or ask the user.

## 4. What the MSA script actually does

**2026-08-11, first live test: MSA swapped the build again, still `?v=7`**
(7386 → 7430 bytes), now titled "Empty-Zone Safe / No Overlay". Differences
that matter, from reading the new build in full:

- The overlay now starts **hidden** and only becomes visible after the script
  confirms a real creative rendered (iframe with content / media ≥40×40). No
  more flash-then-vanish on no-fill; ids and the guard flag are unchanged.
- Its own popup CSS now also forces `#msa-revive-popup-ad > div` to 100% — they
  partially absorbed the ads.js wrapper themselves. It still does NOT
  neutralise `transform`, so our CSS fix stays necessary.
- **Bug, theirs: the rescan fallback `window.reviveAsync.push({})` throws** on
  any page where a Revive async loader has registered (reviveAsync is an
  object, not an array) — i.e. on every page of our site, which runs two.
- **The 0%-fill root cause found on the live site:** sknteam's `asyncjs.php`
  scans for `<ins>` slots immediately only when `document.readyState ===
  "complete"`; otherwise it waits for DOMContentLoaded (already fired before
  our footer injection) or window `load` (many seconds away on this page) —
  and MSA's script self-destructs at 3.5 s. Fired 6 / Shown 0 on the first
  test. Both delivery paths (`ajs.php`, `asyncspc.php`) serve the Angkor
  320×600 fine when asked directly, so it is purely a scan-trigger race.
  **Fixed in plugin v1.2.1:** once the loader registers, the plugin calls
  `reviveAsync[id].apply(detect())` itself (the loader's own refresh body);
  idempotent because `detect()` marks slots `data-revive-loaded`. The
  revive-id is read off MSA's `<ins>`, not hardcoded.

The section below describes the PREVIOUS build, kept for history:

Both builds were read in full. `?v=` is a **pure cache-buster** — `?v=7` and the
no-parameter URL are byte-identical (7386 bytes). MSA bumps it after editing, so
**they can change this script's behaviour at any time without telling us.**

Current build — `revive-popup.js`, "MSA Universal Revive Popup Loader":

- Reads `data-zone` from `document.currentScript` (fallback:
  `querySelector('script[src*="revive-popup.js"]')`)
- Guard flag `window.__MSA_REVIVE_POPUP_ACTIVE__` — a second copy of the **same**
  build returns early and never fires
- Builds `#msa-revive-popup-overlay` (fixed, `inset:0`, z-index 2147483647,
  transparent background, `pointer-events:none` so the page stays clickable),
  `#msa-revive-popup-box` (**320×600 portrait**, clamped to viewport;
  `@media (max-height:640px)` switches to a height-driven size),
  `#msa-revive-popup-ad` holding `<ins data-revive-zoneid="94"
  data-revive-id="787804e5…">`, and `#msa-revive-popup-close` (40px ✕).
  Injected stylesheet id: `msa-revive-popup-style`
- Loads its own Revive async loader, then `window.reviveAsync.push({})` to rescan
- **3500 ms** no-fill timeout → removes itself silently. **5000 ms** auto-close
  once visible. Esc and ✕ also close
- **No frequency cap of any kind.** No cookie, no localStorage. Every pageview
- **No device detection**, despite the older build being named `-pc`

Older build — `revive-popup-pc.js`: 800×450 locked 16:9, ids
`msa-revive-pc-popup-*`, guard `__MSA_REVIVE_PC_POPUP_ACTIVE__`. **The guards
differ between builds**, so if both ever load, both fire and two overlays stack.

**The creative:** Angkor Beer, portrait, fills the 320×600 box (screenshot
confirmed by the user). MSA stated explicitly that **zone 94 is mobile-specific**.

## 5. The `ads.js` collision — do not skip this

`ads.js` wraps **every** `ins[data-revive-zoneid]` on the page and applies
`transform: scale()` to the iframe inside, plus an explicit wrapper height.

It is enqueued **in the footer** (`vodi-child-function.php:370`), so its
`DOMContentLoaded` handler registers *after* the popup's — `wrapAll()` runs
second and grabs the popup's `<ins>`.

The popup's own CSS uses `!important` for width/height but **not for transform**,
so the scale survives and shrinks the creative inside the overlay.

**Fix, from plugin CSS — no `ads.js` edit needed:** neutralise `transform` (and
force the wrapper back to 100% height) inside `#msa-revive-popup-ad` **and**
`#msa-revive-pc-popup-ad`. Cover both id families; MSA has already swapped builds
once mid-task.

## 6. Decisions locked with the user

1. **Ship as a WordPress plugin**, not a theme edit. The host's standing rule is
   *no file editing from WordPress — server-side changes go through aaPanel only*,
   and the user has no aaPanel access. Uploading a plugin zip through
   **Plugins → Add Plugin → Upload** is a normal admin action and does not break
   that rule. Deactivating removes everything, which is the "temporary fix"
   property the user asked for.
2. **Do NOT install Advanced File Manager** (or any file-manager plugin). It was
   suggested earlier in the session, then withdrawn: the host forbids it, it
   bypasses `DISALLOW_FILE_EDIT`, and that plugin family has a history of
   arbitrary-file-upload → RCE. Worse here, because the `editor` role on this site
   carries 118 capabilities including `manage_options`.
3. **Mobile only.** MSA says zone 94 is mobile-specific. Desktop share stays 0,
   exposed as a setting in case they issue a desktop zone later.
4. **Site-wide** page scope (matches how the Damrei units behave).
5. **Additive, not a rotation.** The user's instruction, verbatim: *"whatever ads
   is doing before, I want to add the new one to it."* Damrei keeps doing exactly
   what it does now, untouched.
6. **Damrei-underlay detection ships in LOG-ONLY mode first.** It records whether
   an underlay was on screen but does not act on it, so we learn the real overlap
   rate instead of guessing. One setting later flips it to suppressive — MSA then
   fills only the pageviews Damrei declines. Cost of suppressive mode: a 1–3 s
   delay before MSA's popup appears, which hurts its viewability.
7. **The decision must run client-side.** The site is page-cached (AMS Cache), so
   a PHP-side `rand()` would freeze one branch into the cached HTML for everyone.
8. **Settings-driven script URL and zone**, because MSA swaps builds and bumps
   `?v` at will.
9. ~~**Frequency cap, plugin-side, default 1 per 6 hours, ON.**~~ **AMENDED
   2026-08-11 after the build:** the user chose a **50% roll per mobile
   pageview with NO cap** instead — "50% chance of appearing each time,
   instead of 6 hours". Defaults since v1.1.0: mobile share 50, cap 0. The
   cap machinery stays in the plugin (set hours > 0 to re-arm it); the
   fill-only stamping still applies when armed. Note the plugin cannot give
   Damrei a matching 50% — Damrei fires from the theme's head at Gamma's own
   fill/cap rate, untouchable without a theme edit. True alternation would
   need suppress mode (MSA skips pageviews where Damrei's underlay showed),
   which waits on the §7 signature.
10. Mobile detection should reuse the theme's own regex
    `/Mobi|Android|iPhone|iPad|iPod/` so the plugin and the theme agree on who
    counts as mobile.

## 7. Open — collect these before/while building

1. **The Damrei underlay's DOM signature.** Needed to make detection work.
   Next time the popup appears on the live site, run this in the console:

   ```js
   [...document.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el);return(s.position==='fixed'||s.position==='absolute')&&+s.zIndex>999&&el.offsetWidth>200&&el.offsetHeight>200}).map(el=>({tag:el.tagName,id:el.id,cls:el.className+'',z:getComputedStyle(el).zIndex,w:el.offsetWidth,h:el.offsetHeight}))
   ```

   Whatever large high-layer element comes back that isn't ours is the container.
2. **Ask MSA:** will they set a frequency cap in their Revive campaign? Is there a
   booked impression target for Angkor (it interacts with our share setting)? Is
   the `-pc` build retired?
3. **The "Advertisement" admin menu.** Visible in the WP sidebar, never opened. If
   it manages ad slots, part of this may be a form-fill rather than code.
4. **Ad-ops, not technical:** does AMS have a policy on alcohol creatives? The
   creative already carries the statutory warning band, so MSA has handled its
   side.

## 8. Two pre-existing bugs found in the live theme (not ours, not blocking)

- **`info-header-v3.php:180-202`** — the Footer Desktop zone (`1725879986`) calls
  `gammatag.defineZone(...)` **directly, outside `gammatag.cmd.push()`, and never
  calls `sendRequest()`**. The old backup did both. If `gaxpt.min.js` hasn't
  initialised yet this throws, and the zone is never requested either way.
- **`info-header-v3.php:216`** — `<body style="background:<?php echo
  $_COOKIE['bgColor']; ?>">` echoes a cookie unescaped into an attribute.
  Reflected XSS. One-line fix: `esc_attr( $_COOKIE['bgColor'] ?? '' )`.

Also worth raising with ad ops: **three MR1 zones are defined in the head with no
placeholder anywhere on the site.** The Underlays self-inject so they're fine, but
the MR1s look genuinely orphaned.

## 9. The plugin, as designed (and now built — see the files, this is the spec it was built to)

Settings screen (Settings → MSA Popup): enabled · script URL · zone · mobile
share % (default 100) · desktop share % (default 0) · frequency cap hours
(default 6, 0 = off) · underlay detection mode (off / log-only / suppress) ·
debug toggle.

Runtime: one `wp_footer` inline script. No `wp_head` hook is needed while the
plugin stays additive — that hook only becomes necessary if the Damrei zones ever
need suppressing at definition time, which would require the theme edit we are
deliberately avoiding.

Plus the CSS from §5.

Debug toggle logs the roll, e.g.
`AMS_POP {isMobile:true, roll:0.13, winner:"msa", capped:false, underlay:false}`.

Per repo convention, our plugins carry `Author: Soth Kimleng`.

**As-built decisions (v1.0.0, defaults amended in v1.1.0 — share 50/cap 0 per
§6.9) beyond the spec above:**

- **Installs disabled** (`enabled` defaults off). Any admin action hits LIVE, so
  activation is a deliberate second step after the settings are checked.
- **The cap (when armed — default is off) is stamped only when the popup
  actually fills** — the script polls for an iframe inside
  `#msa-revive-popup-ad` / `#msa-revive-pc-popup-ad` (every 300 ms, up to 6 s;
  MSA's own no-fill timeout is 3.5 s). A no-fill pageview does not burn the
  window. Key: `localStorage.amsMsaPopupShownAt`.
- **The underlay signature is the setting `Underlay CSS selectors`** (one per
  line, empty = not collected). Log-only mode logs its check on **every**
  eligible pageview regardless of the debug toggle — measuring overlap is the
  mode's purpose — and while no selector is configured it also logs candidate
  elements (fixed/absolute, z-index > 999, > 200×200, excluding `msa-revive-*`),
  which automates the §7.1 console snippet.
- **Suppress mode checks 2500 ms after the footer script runs**, then fires MSA
  only if no configured selector matches a visible element. With the selector
  box empty it never suppresses (and the settings screen says so).
- The zips are gitignored (repo convention) — rebuild with
  `docs/wordpress/build-msa-popup-zip.ps1`, which php-lints the sources and
  writes forward-slash entry names (`Compress-Archive` writes backslashes,
  which WordPress's installer rejects). Since v2.4.1 it emits TWO per-site
  zips (`-infotainment` / `-economy`) from the one source folder, each with
  the site pinned; the `ams-msa-popup-<site>/` folders are generated output —
  edit only `ams-msa-popup/`.

## 10. Constraints when working on that site

- **No aaPanel access.** Host rule: no file editing from WordPress.
- **wp-admin's Plugin File Editor cannot save** — the loopback request fails and
  the change reverts. Assume the Theme File Editor behaves the same.
- **The WP host bans IPs after heavy REST probing.** Keep `curl` volume gentle;
  fetch a page once and analyse the saved copy locally.
- **Any admin testing hits LIVE WordPress.** There is no staging.

## 11. How to verify once it ships

1. Console → `AMS_POP` shows the roll and the winner; reload to watch it change
2. Network filtered on **`sknteam`** → the delivery call fires only when MSA wins
3. The overlay appears, then closes itself after 5 s; ✕ and Esc both work
4. The creative is **not** shrunken or offset inside the box (proves the `ads.js`
   CSS fix landed)
5. Damrei is unchanged — its underlay still appears at its usual rate, and zones
   9/10/11/12 from `ads.amscloud.cc` still render (two Revive loaders now share
   the page)
6. Frequency cap holds: a second pageview inside the cap window shows nothing

## 12. If theme access ever arrives: the true MSA/Damrei 50/50

Confirmed with the user 2026-08-12: **a real rotation between MSA and Damrei is
impossible from the plugin.** Damrei's `sendRequest()` fires unconditionally
from the theme's head before footer code runs, and hiding its ad after the fact
still bills the impression at Gamma. Plugin-side ceiling = suppress mode (MSA
takes the pageviews Damrei declines).

With a theme edit it's small — the referee must run before both contestants,
and must stay client-side JS (page cache, same as always):

1. Top of the head, before Gamma's tag:
   `window.AMS_POPUP_WINNER = Math.random() < 0.5 ? "damrei" : "msa";`
2. In `header-v3.php`, wrap **only the two underlay `defineZone` calls**
   (zones `1721642630`, `1722239706`) in
   `if (window.AMS_POPUP_WINNER === "damrei") { … }`. A zone never defined is
   never requested — no wasted impression; MR1s/footers/PTO/video untouched.
3. The plugin's roll is replaced by reading the same flag:
   `if (window.AMS_POPUP_WINNER === "msa") fire();`

Caveat: a win is a chance, not a guarantee — if Damrei wins the flip and Gamma
declines to fill, that pageview shows nothing. Fallback-to-MSA is possible but
reintroduces the detection delay; start with the pure split. Non-code
alternative: Gamma's dashboard can cap/pace the underlay campaign — ad-ops, not
us.

### BUILT 2026-08-12 — theme access arrived, referee implemented

Theme access came via the **AMS Theme Exporter** plugin
(`docs/wordpress/ams-theme-exporter/`, kept installed as a reference tool):
export the live theme as a zip, patch locally, re-upload through
**Appearance → Themes → Add New → Upload → "Replace active with uploaded"** —
the same sanctioned installer path as plugin zips. The export doubles as the
rollback.

Findings from the export (both zips in `docs/wordpress/`):

- **The live `header-v3.php` was the PARENT theme's** (`vodi/header-v3.php`,
  mtime 2026-06-08); vodi-child had no override. §1's location note was wrong.
- The file matched `info-header-v3.php` byte-for-byte (modulo CRLF) — no drift.

So the patch ships as a **child-theme override** — `vodi-child/header-v3.php`,
which WordPress loads in preference to the parent — via a replace of
**vodi-child only**; the parent is never touched. Two deviations from the
design sketch above, both deliberate:

1. **The flip is mobile-only**: `window.AMS_POPUP_WINNER =
   (/Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) &&
   Math.random() < 0.5) ? "msa" : "damrei"`. MSA zone 94 never fires on
   desktop, so a desktop "msa" win would have suppressed Damrei for nothing.
   Desktop always resolves "damrei" → desktop behaviour unchanged.
2. **The zone wraps test `!== "msa"`, not `=== "damrei"`** — a missing flag
   (script stripped, future header edit) fails open to today's additive
   behaviour instead of blacking out the underlay.

Plugin **v1.4.0** obeys the flag when present (`referee` replaces the roll;
mobile/desktop share settings become fallback-only) and rolls on its own when
absent — either piece can deploy or roll back without the other going dark.
Debug line now includes `referee:`.

**Deploy** (order-independent, but do both):

1. Plugins → Add Plugin → Upload → `ams-msa-popup.zip` (v1.4.0) → Replace
   current with uploaded.
2. Appearance → Themes → Add New → Upload → `vodi-child-referee-20260812.zip`
   → **Replace active with uploaded** (200 files = the untouched 199-file
   export + the new `header-v3.php`).

**Rollback:** theme → re-upload `vodi-child-export-20260812-083604.zip` the
same way (it has no header override, so the parent's copy takes over again);
plugin → v1.4.0 falls back to its own roll automatically, or re-upload the old
zip. **If the plugin is ever DISABLED while the referee header is live, mobile
loses the ~50% of pageviews the referee awards to MSA** (Damrei skipped, MSA
never fires) — revert the theme too.

**Verify** (mobile UA, console): `AMS_POPUP_WINNER` is set on every load;
plugin debug shows `referee:"msa"|"damrei"` matching it; on "damrei" pageviews
no `sknteam` delivery call and the underlay can appear; on "msa" pageviews the
two underlay zones send no request (Network → `gammaplatform`/`gpas` shows the
other six zones only) and the MSA popup can appear. Desktop: winner is always
`damrei`, everything as before.

**DEPLOYED 2026-08-12, live and verified in served HTML.** The zip theme-replace
FAILED — WordPress's writability pre-check aborted on `video-page/` (owned by
`root`, not `www`; hand-placed via aaPanel 2026-07-20) — but that abort happens
BEFORE anything is deleted or copied, so a failed replace changes nothing.
Resolution: the user gained **aaPanel access** the same day, and the referee
`header-v3.php` was uploaded directly into `vodi-child/` (owner set `www`/644).
`video-page/` stays root-owned by user choice (not our work) — WP-driven theme
replaces will keep failing until the host chowns it; deploy theme files via
aaPanel instead. **After any WP-side deploy, purge AMS Cache** — cached pages
serve the old frozen HTML; query strings do NOT bypass it, and unknown paths get
a static nginx 404, so no theme page escapes the cache from outside.

## 13. v2.0 plan — all ads into the plugin, plus the MSA desktop popup

Agreed with the user 2026-08-12, to build next (fresh session):

1. **The plugin prints Gamma's stack itself** — loader, `gammatag.cmd` defines,
   `sendRequest()`, the DOMContentLoaded 728×90 — from a **settings-driven zone
   list** (code/size/siteId/zoneId/device per row, seeded with the eight §12
   zones). The theme keeps only the inert `gax-inpage-async-*` placeholder divs.
2. **The referee moves inside the plugin** (we control print order once we own
   Gamma's tag). Final theme step, via aaPanel: DELETE `vodi-child/header-v3.php`
   (referee now redundant) and, in the same release, strip nothing else — the
   parent header still hardcodes Gamma's scripts, so the plugin must ship a
   child `header-v3.php` WITHOUT the Gamma blocks instead of deleting the
   override. Get this ordering right: plugin v2.0 active FIRST, then swap the
   header override, then purge AMS Cache.
3. **MSA desktop popup** (new from MSA 2026-08-12):
   `<script defer src="https://msacam.com/ads/revive-popup-pc.js?v=12"
   data-zone="89">` — per-device MSA settings (mobile 94 / desktop 89, separate
   script URLs), reusing the existing desktop-share setting and the `-pc` id
   family CSS fix already in the plugin.
4. **Desktop popup scoped to Economy first** — MSA's ask is "try it on
   Economy". Scope check must be client-side (page cache): match WP's body
   classes (`category-economy` etc.) against a settings field listing allowed
   categories; empty = site-wide. Confirm with the user whether Economy-only is
   the intent or just MSA's test page.
5. **Desktop stays ADDITIVE for now** — no desktop referee. Unknown whether
   Damrei's PTO Desktop (1739240031, 1600×900 — likely a takeover) collides
   with MSA's desktop popup. Same playbook as v1: ship logging (underlay-style
   detection on desktop too), measure overlap, then decide.
6. **Accepted trade-off:** the plugin becomes the money path — deactivating it
   stops ALL Damrei zones site-wide until reactivated. Deploy discipline stays:
   php -l before zip, verify served HTML after, purge cache.

### BUILT 2026-08-12 — v2.0.0, not yet uploaded

All six items implemented in `docs/wordpress/ams-msa-popup/ams-msa-popup.php`
(zip rebuilt). The no-Gamma child header is
`docs/wp-ads/vodi-child-header-v3-nogamma.php` (php-lint clean; the obfuscated
video in-view block diff-verified byte-identical to the live header's — it is
checksum-guarded, one wrong char kills it). As-built decisions beyond the plan:

1. **`gamma_enabled` ("Serve Damrei zones") defaults OFF**, so uploading v2.0.0
   changes nothing until it's ticked — v1.4.0 behaviour exactly. The zone list
   (Settings → MSA Popup, bottom) is seeded with all nine theme zones.
2. **The referee's MSA probability is now the Mobile share % setting** (still
   50 by default) instead of a hardcoded 0.5 — one knob for the split. When the
   MSA popup is disabled, the plugin-printed referee resolves "damrei" on every
   pageview, which automates §12's rollback warning (no more dark-mobile trap
   when the plugin is off but a referee is live).
3. **The flag is `Object.defineProperty` non-writable.** While the OLD referee
   header is still live (between plugin activation and the header swap), its
   `window.AMS_POPUP_WINNER = …` re-assignment silently loses, so head and
   footer keep reading one consistent flip.
4. **Transition guard:** after the plugin's `sendRequest()`, it swaps
   `gammatag.defineZone`/`sendRequest` for no-ops (keeping private refs for its
   own wide zones). The theme's still-hardcoded copy of the stack — live until
   the header swap + purge — can then neither double-define nor double-request,
   and the theme's broken DOMContentLoaded 728×90 call no-ops instead of
   throwing. Dormant once the new header is live.
5. **Footer Desktop 728×90 ships in the list but UNTICKED.** The theme's copy
   was dead code (§8 — never actually requested), so the port preserves reality;
   the plugin's "wide" device implementation is *correct* (defined inside
   `gammatag.cmd` at DOM ready when innerWidth > 500, with a sendRequest), so
   ticking it would turn a never-delivered zone genuinely ON — an ad-ops call.
6. **Desktop category scope is server-side per URL, not body classes.** §13.4's
   body-class idea doesn't work here: verified in the theme export that neither
   WP core nor Vodi's `body_classes` filter puts `category-{slug}` on single
   posts (archives only). Per-URL PHP (`has_category`/`is_category`) is
   page-cache-safe — a URL's categories are identical for every visitor.
   Seeded `economy`; **desktop_share stays 0**, so the desktop popup is inert
   until the user confirms Economy-only intent (§13.4's open question) and
   raises the share.
7. **Desktop stats get their own `d_`-prefixed counters** and their own tables
   on the stats screen (shown once desktop share > 0 or data exists). Mobile
   history reads unchanged.
8. **The new header keeps** the Damrei video in-view unit, the
   `ads.amscloud.cc` loader, pixels, and the placeholder divs — only the
   referee + Gamma loader + defines + the DOMContentLoaded block left. It also
   carries the §8.2 one-line XSS fix (`esc_attr` on the bgColor cookie echo).

**Deploy runbook (order matters, §13.2):**

1. Plugins → Add Plugin → Upload → `ams-msa-popup.zip` (2.0.0) → Replace
   current with uploaded. No behaviour change yet.
2. Settings → MSA Popup → tick **Serve Damrei zones** → Save. Uncached views
   now get the plugin's referee+stack; the theme's copy is neutralised by the
   guard (expect `AMS_ADS` in console with debug on).
3. aaPanel: overwrite `wp-content/themes/vodi-child/header-v3.php` with
   `vodi-child-header-v3-nogamma.php`'s content — owner `www`, 644 (WP-side
   theme replace still fails on root-owned `video-page/`).
4. Purge AMS Cache.
5. Desktop trial, when confirmed: set Desktop share % (popup fires only on the
   `economy` scope), Save, purge again. MSA desktop stays ADDITIVE — watch the
   d_ Underlay/Overlap columns for PTO Desktop collisions before any referee
   talk.

**Verify:** served HTML has `id="ams-popup-referee"` + `gaxpt.min.js` +
`id="ams-gamma-zones"` printed by wp_head, and (after step 3-4) the theme's
old GPAS block is gone. Mobile console with debug: `AMS_ADS {winner, defined}`
— underlay codes absent on "msa" wins — and `AMS_POP {referee: …}` matching.
Network: `gammaplatform` requests for the six non-underlay zones on every
pageview; `sknteam` only on MSA wins. Desktop (once share > 0): popup only on
Economy pages, `d_` stats rows appear. **Deactivating the plugin after step 3
stops ALL Damrei ads** — that's §13.6, not a bug.

## 14. v2.3.1 — why Damrei never showed (root-caused 2026-08-13, real-browser probe)

Trigger: the user tested on another computer, Chrome responsive mode
(iPhone 12 Pro) — a setup where Damrei "always showed" pre-MSA — and got
nothing. Direct ad-server probes said fill WAS available (live Wing creatives
returned for every infotainment popup/underlay zone), so the failure had to be
on-page. A puppeteer probe (emulated iPhone, fresh profiles, console+network)
against the live site found it, and economy.ams.com.kh (same stack, served by
its THEME, no plugin) was the working control.

**Three facts about `gaxpt.min.js`** (read in full — it's ~14KB):

1. `sendRequest()` serves ONE zone per call, **last-defined first** (LIFO),
   and advances to the next zone by **re-calling the public
   `gammatag.sendRequest()`** in the injected script's `done` callback.
2. `defineZone()` **silently drops any zone whose container div is not in the
   DOM** (`document.getElementById(code)` check at define time).
3. Its load handler runs **only the LAST queued `gammatag.cmd` callback**
   (`cmd[cmd.length-1]()`, once, at window load) — so two queued stacks can
   never both fire, and defines effectively run at window load.

**The bug (v2.0 → v2.3.0):** the transition guard no-op'd
`defineZone`/`sendRequest` right after our first call — fact 1 means the
recursion died after ONE zone: PTO Desktop on Damrei-win pageviews (204 on
mobile UA → Damrei's mobile popup could never render), Footer Mobile on MSA
wins. Economy, with no guard, requested every div-having zone — that's the
whole "works on economy, dead on infotainment" difference. Proven by a probe
that swallowed the no-op assignments and changed nothing else: same live page,
PTO Mobile immediately delivered the Wing popup creative.

**The second finding (fact 2):** the Underlay zones have never once been
requested from a page — on EITHER site — because no underlay placeholder div
ever existed (the §2A "self-injecting" note was about the creative's
positioning, not the request). §0's "underlay runs on every pageview" contract
was never actually being served. What everyone always saw was the PTO popup.

**v2.3.1 (built, zipped, php-lint clean):**

1. Transition guard DELETED (facts 1+3: it broke delivery and protected
   against nothing).
2. Per-row **"Auto div"** flag — the zones script creates a missing container
   in the content flow (`.entry-content` → `#content` → `.site-content` →
   body; first at ~25%, second at ~70% of children) before defining. Seeded ON
   for the two underlays; runs at window load so the DOM is complete.
3. §0 contract alignment, seeded AND upgraded into saved settings once
   (`plugins_loaded`, version-gated, only rewrites device when still "all"):
   underlays popup=0/Mobile/autodiv, PTO Mobile popup=1/Mobile, PTO Desktop
   popup=1/Desktop. Kills the wasted desktop-zone request on mobile pageviews.
4. Zone loop device-filters BEFORE the referee skip, so `AMS_LATE_DAMREI`
   only late-defines zones the device can serve.

**Pre-upload verification (local harness, real gaxpt from Gamma's CDN, the
plugin's actual inline scripts extracted from the PHP):** Damrei turn → 4 adx
requests (underlay ×2 = 200 + creative, Footer Mobile, PTO Mobile = 200 +
creative); MSA turn → PTO skipped, underlays still requested + filled,
`AMS_LATE_DAMREI` armed. No JS errors either turn.

**Deploy:** Plugins → Add Plugin → Upload → `ams-msa-popup.zip` (2.3.1) →
Replace current with uploaded. Then purge AMS Cache. No settings to change —
the upgrade routine fixes the zone rows itself.

**Verify (mobile UA / responsive mode, console+network):** on a Damrei-turn
pageview expect gammaplatform adx requests for BOTH underlay zones + Footer
Mobile + PTO Mobile (no PTO Desktop), the PTO popup or underlay visibly
rendering when Gamma fills, and `AMS_ADS.defined` listing the underlay codes
on EVERY pageview (msa turns included). Alternation: reload flips the turn
each time (localStorage `amsPopupTurn_m`). Watch §7.2's fill-rate stats after:
underlay impressions are NEW inventory Damrei bills for — if two full-screen
underlay slots per article is too much, untick one row's "Auto div".

**Note on the §status "5/5 flip-wins" verification above:** it predates this
root-cause and cannot have been popup renders under v2.2 (the guard made that
impossible); it most likely counted network delivery or cached-header
pageviews. The claim stands corrected by §14.

### v2.3.2 — underlays on article pages only (user request 2026-08-13, after v2.3.1 was confirmed working live)

New per-row **"Articles only"** flag: the row is dropped from the printed zone
list unless the URL is a single post (`is_single()`). Server-side per URL —
same page-cache reasoning as the desktop category scope (§13.6): a URL either
is an article or it isn't, for every visitor. Seeded ON for the two underlay
rows and set on saved settings by the (now 2.3.2-gated, idempotent) upgrade
routine. Deploy = upload zip → Replace current → **purge AMS Cache** (cached
non-article pages keep their old zone list until purged). Verify: homepage /
category pages print no underlay codes in `AMS_ADS.defined` and fire no
underlay adx requests; article pages behave exactly as §14's v2.3.1 verify.

## 15. The Economy package — v2.4.0 (built 2026-08-13, NOT yet deployed)

MSA's "try it on Economy" meant **economy.ams.com.kh** — a separate WordPress
install running the same Vodi parent + vodi-child pair and the same Gamma
stack, hand-pasted into **its parent theme's `header-v3.php`** (vodi-child has
no header override there, so the parent's copy is live — same situation
infotainment was in before §12). Analyzed from the full theme export
`themes.tar.gz`. Everything that was true of infotainment's header is true
there too: the same §8 bugs (Footer Desktop defined at DOMContentLoaded
outside `gammatag.cmd` with no sendRequest = dead code; the unescaped
`$_COOKIE['bgColor']` echo = reflected XSS), no underlay placeholder divs (so
per §14 fact 2 the underlays have never served there either), the same dead
commented GPAS/ad-exchange pop block, the same obfuscated Damrei video
in-view unit (same wid/zid), the same `ads.amscloud.cc` loader, and a child
`ads.js` enqueued the same way (so the §5 transform collision applies — the
plugin's CSS fix already covers it).

**Economy's Gamma zones** (theme order — gaxpt serves LIFO so order matters;
siteIds are the SAME as infotainment, zone ids mostly its own):

| Zone | id | Size | siteId | Notes |
| --- | --- | --- | --- | --- |
| Underlay | `1729764934` | 640×1386 | `1721642224` | no div in theme → auto-div, articles only |
| MR1 Zone2 | `1726823765` | 300×250 | `1721642224` | **same id as infotainment** |
| MR1 | `1729764905` | 300×250 | `1721642224` | |
| Underlay 2 | `1731396715` | 640×1386 | `1721642224` | no div → auto-div, articles only |
| Footer Mobile | `1729766383` | 720×250 | `1721642224` | div in header |
| MR1 Desktop | `1728357404` | 300×250 | `1725879762` | **same id as infotainment** |
| PTO Mobile | `1729764963` | 282×370 | `1721642224` | popup-flagged (refereed) |
| PTO Desktop | `1739329474` | 1600×900 | `1725879762` | popup-flagged (refereed) |
| Footer Desktop | `1725879986` | 728×90 | `1725879762` | **same id**, dead in theme (§8) → ships UNTICKED |

**The package = one plugin source, two per-site zips, one header file:**

1. **`ams-msa-popup-economy.zip` / `ams-msa-popup-infotainment.zip`
   (v2.4.1)** — built from the ONE source `docs/wordpress/ams-msa-popup/` by
   `build-msa-popup-zip.ps1`; each zip carries a build-time pin
   (`AMS_MSA_POPUP_SITE`) selecting its zone seed (economy's table above,
   contract flags pre-applied) and the desktop category scope default (empty
   on economy — the whole site IS Economy; infotainment's seed keeps the
   inert `economy` slug). The host check in `ams_msa_popup_is_economy()` is
   only the fallback for an unpinned build. BOTH zips install as inner folder
   `ams-msa-popup/` — the plugin's WP identity; renaming it would fork the
   plugin and orphan settings/stats. Saved settings always beat seeds, so
   uploading to infotainment changes nothing there. The §14 upgrade routine
   recognises both sites' underlay/PTO ids.
2. **`economy-vodi-child-header-v3-nogamma.php`** — economy's no-Gamma child
   override, derived from `economy-header-v3.php` with the identical §13
   treatment: Gamma loader + defines + sendRequest + the dead DOMContentLoaded
   728×90 block + the dead commented pop block stripped (replaced by a marker
   comment), bgColor XSS fixed, everything else byte-identical — including
   the checksum-guarded video in-view block. Rollback = delete the file (the
   parent's copy takes over; economy never had a child header before).

**Deploy runbook (economy.ams.com.kh, mirrors §13's order):**

1. wp-admin (economy) → Plugins → Add Plugin → Upload →
   `ams-msa-popup-economy.zip` → activate. Installs with Enabled OFF + Serve
   Damrei zones OFF — nothing changes yet. Check Settings → AMS Ads shows the
   ECONOMY zone table (pinned into this zip at build time — if it shows
   infotainment ids, the wrong zip was uploaded: stop and report).
2. Tick **Serve Damrei zones** → Save. Uncached pageviews now get the
   plugin's referee + stack; the theme's hardcoded copy still prints but
   gaxpt only runs the LAST `gammatag.cmd` callback (§14 fact 3), so the
   plugin's stack (wp_head prints before the theme's inline blocks that sit
   after `wp_head()` in the template — verify in served HTML) is the one that
   fires. Do not linger in this state: go straight to step 3.
3. aaPanel (economy's server) → write the override to
   `wp-content/themes/vodi-child/header-v3.php`, owner `www`, 644. (The WP
   theme-replace path is untested on economy and its vodi-child also carries
   a `video-page/` dir — assume the §12 root-ownership trap until proven
   otherwise.)
4. Purge economy's page cache (whatever it runs — verify it HAS one; if
   none, cached-HTML concerns don't apply).
5. MSA trial, per their ask: Settings → AMS Ads → Enabled ON, set
   **Desktop share** (50 = referee splits MSA desktop popup vs Damrei's PTO
   Desktop, like infotainment), Mobile share to taste (0 = mobile stays
   all-Damrei; 50 = same alternation as infotainment). Save, purge again.
6. ~~Confirm with MSA that zones 94/89 are right for economy~~ **RESOLVED
   2026-08-13, MSA issued economy's own tags: mobile `revive-popup.js?v=7`
   zone 90, desktop `revive-popup-pc.js?v=12` zone 89** (desktop shared with
   infotainment, mobile is economy-specific). Set Mobile zone = 90 in
   economy's settings; v2.4.2 seeds it for future fresh installs.

**Verify (economy, mobile UA + desktop):** served HTML carries
`id="ams-popup-referee"` + `id="ams-gamma-zones"` and (after step 3) the
theme's gaxpt block is gone; console `AMS_ADS.defined` lists economy's zone
ids (underlays included on article pages); gammaplatform adx requests carry
economy's zone ids; alternate turns flip per reload (`amsPopupTurn_m`);
`sknteam` requests only on MSA turns. §14's caveat applies here too: heavy
refreshing trips Gamma's per-visitor cap — fresh profiles for fill checks.

**Step 0 that is really step 1: WP admin access to economy.** All of the
above assumes the user (or a colleague) has wp-admin on economy and aaPanel
reach to its server — unconfirmed as of build time.

## 16. v2.5.0 — the settings screen revamp (2026-08-13, UI-only)

The user's verdict on Settings → AMS Ads as of v2.4.x: "very confusing,
doesn't have proper structure, some stuff are wrong wording... it's a mess."
Fair — it grew a row at a time from v1.0 and read like a changelog. v2.5.0
rewrites `ams_msa_popup_settings_page()` and NOTHING else: option keys,
defaults, sanitize, the stats pipeline and every public-site byte are
untouched, so upgrading a live install is a no-op for visitors.

The shape now:

- **Status box first**: what the plugin is doing right now, derived from the
  saved settings — MSA popups on/off (+ zones), Damrei serving on/off, split
  mode, backfill — with red warnings for the known foot-guns:
  - "Serve Damrei zones" OFF (if the no-Gamma header is live, Damrei is dark
    — the economy deploy-day mistake, §15);
  - desktop popup on while "One winner on desktop" is off (§13.5 stacking);
  - suppress mode with an empty selector list (inert).
- **Sections by intent**: 1 MSA popups · 2 splitting pageviews between MSA
  and Damrei · 3 Damrei (Gamma) zones · 4 checks & counting.
- **Plain wording**, jargon translated: referee → "one winner per pageview",
  no-fill fallback → "backfill empty pageviews", underlay detection →
  "Damrei overlap check", rotation → "how to split". Zone table columns:
  Popup slot / Make container / Articles only / Shows on / Container ID.
- **Dependency greying**: rows tagged `data-needs="msa"` / `"gamma"` dim
  while their master checkbox is off. Visual only ON PURPOSE — inputs are
  never `disabled`, so a greyed field still submits and toggling a master
  never loses the values under it.

Re-verify after future edits the same way this was verified: stub the ~20 WP
functions the page touches, include the plugin, call the page function, and
screenshot the HTML with headless Chrome — a live-like scenario plus one with
gamma off / referee off / suppress-no-selectors to see every warning and the
greying fire at once.

## 17. v2.6.0 — tabs, and the desktop category scope removed (2026-08-14)

Second pass on the screen, user request: tabs, and drop the field we never
use. Built + zipped, verified via the §16 stub-harness recipe (three headless
Chrome screenshots: Settings tab, Stats tab via `#stats`, all-warnings).

- **Settings | Stats tabs** (WP `nav-tab` styling) under the always-visible
  status box and warnings. Client-side only: the URL hash drives which tab
  shows (`#stats` = Stats, anything else = Settings), so WordPress's
  post-save redirect — which carries no hash — always lands back on Settings
  with the "Settings saved" notice in view. No option, slug or server
  behaviour changed by the tab itself.
- **"Desktop popup pages" (`desktop_categories`) REMOVED**, together with
  `ams_msa_popup_desktop_scope_ok()` and every place its answer was baked
  into cached pages (head referee probability, footer `desktopScopeOk`
  config, the front-end eligibility checks). The field was the leftover of
  the 2026-08-12 "try it on Economy" misreading (§14): once v2.4.0 made
  Economy its own site, no install ever needed a category filter. VERIFIED
  before removal, per the queued follow-up: both live sites bake
  `desktopScopeOk: true` into their public pages (checked 2026-08-14), i.e.
  both were already effectively site-wide — removal changes nothing. The
  desktop popup now runs site-wide whenever its share is above 0, exactly
  like mobile, and one cache-baked trap is gone. A stale
  `desktop_categories` key in a live install's saved option is ignored.
- Zone-table footnote added (the other queued follow-up): the **Name**
  column is label-only, never sent to Gamma.

Both per-site zips rebuilt (still NOT uploaded; live remains infotainment
v2.3.1 / economy v2.4.1 — one upgrade will jump straight to v2.6.0). The
interactive preview artifact was updated in place at the same URL.

## 18. v2.7.0 — the "Show both" split mode (2026-08-14)

User request, same day: "we display both but the first popup is still
alternating... display the second ads 3 second after the lead ads." Built as
a THIRD "How to split" choice — `rotation = 'both'` — so the two existing
modes are untouched and **rollback is switching the dropdown back**.
'alternate' stays the default; nothing changes on upgrade until the dropdown
is moved.

How it works (all reusing machinery that already existed):

- The referee flag now means **who leads** in this mode. Lead alternation is
  the same turn-taking as "Take turns" — same localStorage keys
  (`amsPopupTurn_m` / `_d`), Damrei first for new visitors, storage blocked
  → random flip.
- **Damrei leads:** its zones print from the head exactly as today; the
  footer delays MSA's injection by `LEAD_GAP_MS` (3000 ms).
- **MSA leads:** the head skips the popup-flagged Damrei zones exactly as
  today; the footer calls `window.AMS_LATE_DAMREI()` (the hook built for
  backfill in v2.3.0) at +3 s. gaxpt creates that hook at window load, which
  can land after +3 s on a slow page, so the call polls every 500 ms for up
  to 12 s instead of giving up.
- **Backfill is ignored in this mode** — the other side always runs. Both
  `fb_msa` and `fb_damrei` paths are gated off (`!bothMode`) so a duplicate
  late-define can't happen and the fb_* stats can't double-count.
- Stats: "Roll wins" counts pageviews MSA **led**; Fired/Shown count MSA
  regardless of position, so Fired > Roll wins is expected and the Stats-tab
  footnote says so. No new events, no schema change.
- MSA's share 0 still means "MSA popup off" (it never fires, not even
  trailing); with "Serve Damrei zones" off there is no referee flag, so
  sequencing is impossible and behaviour falls back to legacy additive —
  the standing gamma-off warning covers that state. The suppress overlap
  mode still applies to an MSA lead only.

Ad-ops consequences to expect, flagged in the option's description: both
networks now get a request on ~every pageview (their dashboard numbers will
move), and whichever side trails is seen less — MSA may ask about
viewability on trailing pageviews.

VERIFIED beyond the §16 screen recipe with a headless-Chrome runtime
simulation of the plugin's real generated head+footer output (network
blocked, gaxpt stood in for by spy `defineZone`/`sendRequest`, virtual
time): Damrei-lead pageview → Damrei defines at ~0 ms, MSA injects at
~3016 ms; MSA-lead pageview (turn key pre-seeded) → MSA injects at ~5 ms,
the always-on zones define immediately, and the held-back PTO defines at
~3020 ms with its own sendRequest. Node syntax-checked all three inline
scripts. Zips rebuilt, still NOT uploaded.

## 19. v2.8.0 — sequential "Show both" + first-pageview scope (2026-08-16)

v2.7.0 went live on infotainment 2026-08-16 and the user immediately saw the
flaw: "the second popup fire immediately after the first one, so they overlap
each other, when popup should be closed by the user or auto close first."
Measured on the live site (CDP headless Chrome, mobile UA, 250ms visibility
polling) before the fix:

- Damrei-lead: Damrei visible 2.8s→8.7s (Gamma auction ~2s, auto-close ~6s);
  MSA trailer fired at load+3s → visible 4.1s→9.7s. **Both stacked 4.5s.**
- MSA-lead: MSA visible 1.4s→6.5s (auto-close ~5s); Damrei trailer defined at
  load+3s → visible 4.1s→10.2s. **Both stacked 2.4s.**

Root cause: `LEAD_GAP_MS` counted from page load — blind to when the lead
actually appeared, and nothing ever waited for it to close.

### What changed (all inside the 'both' branch; alternate/random untouched)

1. **Close-triggered trailer** — `waitLeadThenFire(leadVisible, noShowMs, cb)`
   replaces the flat timer. Phase 1: poll (250ms) for the lead to APPEAR;
   never by `noShowMs` → its network declined → fire the trailer anyway.
   Per-lead deadlines: Damrei 8s (auction lands ~2–3s), **MSA 13s** — MSA's
   no-show is only final after its v1.3.0 retry (~12s); an 8s deadline could
   fire Damrei just before a late retry filled, recreating the stack.
   Phase 2: poll for it to DISAPPEAR (reader X or auto-close — both count),
   then wait the breather, then fire. Lead still visible at 30s
   (`LEAD_MAX_WAIT_MS`) → trailer SKIPPED (debug `second-skipped`) — stacking
   is the one outcome this exists to prevent. Lead visibility: MSA = its
   overlay ids; Damrei = the existing `damreiPopupVisible()`.
2. **`both_breather` setting** (0–30s, default 2) — quiet time between the
   lead closing and the trailer firing. 2s chosen deliberately: 1s reads as
   the same interruption continuing; past ~3s only costs reach (the later the
   second popup, the fewer readers still on the page).
3. **`both_scope` setting** — 'first' (DEFAULT) or 'every'. 'first' runs the
   both-treatment on the visit's FIRST pageview only (sessionStorage
   `amsMsaBothDone`, consumed only when a referee flag exists so a
   gamma-off pageview doesn't burn it); later pageviews behave exactly like
   "Take turns" — bothMode demotes to false, which also re-arms the fb_*
   backfill paths for those pageviews. Storage blocked → stays 'both'
   (fails toward revenue, matches pre-2.8 behaviour).
   **DEFAULTING TO 'first' IS A BEHAVIOUR CHANGE ON UPGRADE** — deliberate,
   owner-approved 2026-08-16 ("i like your recommendation, please make that
   happen"): both-on-every-pageview with cap 0 was the maximum-pressure
   combination (a five-article reader got 10 popups; now 6). Rollback of just
   this: set "Show both on" to every pageview.

Debug events gained a `leadSeen` flag (`second-msa` / `second-damrei`); no new
stats events, no schema change.

### Verified (harness in the session scratchpad, reusable pattern)

WP-stub PHP harness emits the plugin's REAL generated head+footer into an
HTML page; stubs simulate the measured live behaviour (Damrei auction 2.5s,
shows 6s; MSA fill 0.4s, shows 5s); CDP headless Chrome (network blackholed
via `--host-resolver-rules`) records console events + 250ms visibility:

- Damrei-lead: Damrei 2.5→8.5s, `second-msa leadSeen:true` at 10.6s (close
  +2s breather), MSA 11→16s. Zero overlap.
- MSA-lead: MSA 0.4→5.5s, `second-damrei leadSeen:true` at 7.6s, held-back
  PTO defined, Damrei 10.1→16.1s. Zero overlap.
- No-show: Damrei stub never fires → `second-msa leadSeen:false` at 8.0s.
- Scope 'first', two navigations in one tab: view 1 full both-treatment +
  `amsMsaBothDone=1`; view 2 one popup only, no trailer.

Zips rebuilt at v2.8.0 for both sites, NOT uploaded. Deploy = upload zip +
purge AMS Cache; the settings screen's status box states the active
scope/breather in plain words.

### 19.1 v2.8.1 — the Damrei "closed" signal (2026-08-16, same day)

v2.8.0 went live and the Damrei-lead half didn't work: the takeover came and
went, no `second-msa`. The harness had missed it because its stub filled the
zone container the way the CONTRACT says, not the way Gamma actually
delivers. Live probe (CDP, computed styles + rects at 4/8/12s):

- `gax-inpage-async-1721642896` exists from define time with THREE `<script>`
  children in a `width:0; height:10480px` static box — identical before,
  during and after the takeover. `childElementCount>0 && offsetHeight>50` is
  therefore permanently true on this theme.
- The visible takeover is a separate ANONYMOUS `<div>` (no id/class,
  z-index 99999) — only the big-overlay scan sees it, and it left the DOM at
  ~8–9s (auto-close confirmed).

Fix: `damreiPopupVisible()` now walks the container's children, skips
SCRIPT/STYLE/NOSCRIPT/LINK, and requires a rendered >10×10 box; otherwise
falls through to the big-overlay scan. Consequences:

- Phase 2 of the both-mode close-watch completes when the overlay goes →
  the MSA trailer fires (verified in the harness with a live-replica
  scripts-only container: `second-msa` at close+2s, both orders clean).
- The v2.3.0 backfill (`fb_msa`, "Damrei's turn still empty at ~4.5s") had
  been unable to call Damrei empty on this theme since it shipped — it
  starts judging for real. Expect `fb_msa` to appear in the stats for the
  first time; that is the fix working, not a new bug.

The harness stub now builds the container the live way (scripts-only,
0-wide) so this class of miss can't pass again.

### 19.2 v2.8.2 — underlays no longer count as "Damrei's popup" (2026-08-16)

User report after testing v2.8.1 on ARTICLES: "every MSA lead, i do Damrei
popup but when Damrei lead, i don't see MSA." Reproduced on a live article
(fresh visitor → Damrei leads): `second-skipped, reason:lead-still-open` at
the 30s ceiling. The v2.8.1 verification had run on the HOMEPAGE — no
underlays there (they're articles-only, §2.3.2), so the miss was invisible.

Live probe on the article:

- The always-on underlay creatives are **full-screen `position:fixed`
  z-index 99998 clips** — `#damrei-inner-clip-content-<rand>` inside
  `#damrei-apps-wrapper-underlay-<rand>` — that match the big-overlay scan
  and NEVER leave the DOM. On Damrei-lead article pageviews
  `damreiPopupVisible()` therefore never went false.
- Decisive structural fact: those clips are DESCENDANTS of their zone
  container (`… < #gax-inpage-async-1721642630 < …`), while the PTO
  takeover is an anonymous body-level div OUTSIDE every container.

Fix: the footer bakes `damreiOtherCodes` (containers of enabled NON-popup
zones); `scanCandidates(skipNonPopupZones)` skips any element inside one of
them, and `damreiPopupVisible()` passes true. The underlay-check LOGGING
call stays unfiltered — underlay candidates are its purpose. Verified in
the harness (now an article-page replica: `is_single()` true, autodiv
underlay container with a permanent fixed clip): trailer fires on time in
both lead orders with the underlay on screen throughout.

Also settled by the same probe — **the §7.1 underlay signature**, open
since v1.0: paste `[id^="damrei-inner-clip-content"]` into Settings → AMS
Ads section 4 (one line) to make Underlay seen / Overlap count for real.

Zips rebuilt at v2.8.2. The user flipped "Show both on" to EVERY pageview
(their call, reversing the 2.8.0 'first' default — they want the sequence
on every article).

## 20. v2.9.0 — both-sided stats + neutral wording (2026-08-16)

User request, before uploading v2.8.2: "I want to also track Damrei stats as
well... most of our settings seem to evolve around MSA... I want it to be
more general so that normal users can understand and use the plugin without
my presence." Built on the owner-approved shape: keep the real network names
(clearer than generic labels), make every surface symmetric. Counting and
wording only — zero ad-behaviour change. One source, both per-site zips.

What's new:

- **Damrei counters** (bare/`d_` device split, like MSA's): `dam_win` (the
  split awarded Damrei the turn/lead), `dam_fired` (its popup zones actually
  requested — head define, backfill, or "Show both" trailer; once per
  pageview), `dam_shown` (its popup appeared — the same v2.8.x visibility
  detection). Damrei fill rate = shown ÷ requested.
- **Pageview outcomes** — the headline table: exactly one of
  `both / only_msa / only_damrei / blank` per pageview, judged at page-leave
  in `flush()` (a reader who leaves before a popup's moment counts as not
  seeing it — deliberate; the table footnote says so). Shown combined across
  devices with percentages.
- **Stats tab order**: outcomes first, then MSA popup mobile/desktop, then
  Damrei popup mobile/desktop (Turn wins / Popup requested / Popup shown /
  Fill rate / Underlay seen); footnote rewritten network-neutrally ("take
  that number to that network").
- **Section 2 wording**: "MSA's share — mobile (%)" → "Pageview split —
  mobile: MSA [__]% — Damrei gets the rest (N%)". Same option keys —
  nothing re-saves. Status-box random-draw line lists both sides.

Verified: §16 stub render (new tables screenshot-checked with seeded fake
rows; settings render clean) + runtime beacon spy in the §19 harness —
Damrei-lead pageview flushes exactly
`{dam_win:1, dam_fired:1, dam_shown:1, fired:1, filled:1, close_auto:1, both:1}`,
MSA-lead flushes `{win:1, fired:1, filled:1, close_auto:1, dam_fired:1,
dam_shown:1, both:1}`. Event names fit the varchar(20) column; the beacon
whitelist covers all new names, so no schema change.

Zips rebuilt at v2.9.0 (carrying v2.8.1+v2.8.2 fixes). Live at build time:
infotainment v2.8.1 (articles missing the second popup — v2.8.2's fix ships
inside this upload), economy v2.4.1. Deploy: upload per-site zip + purge AMS
Cache. Damrei tables and outcomes start filling only after upload.
