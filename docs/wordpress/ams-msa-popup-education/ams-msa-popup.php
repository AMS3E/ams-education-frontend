<?php
/**
 * Plugin Name: AMS Ads Manager
 * Description: ALL ad-script serving for the site. Prints Damrei's (Gamma)
 *              zone stack from a settings-driven zone list, runs the
 *              MSA/Damrei referee on both devices, and fires MSA's mobile
 *              and desktop popups (per-site zone numbers). Client-side
 *              decisions (the site is page-cached), plugin-side frequency
 *              cap, Damrei-underlay detection, and a per-device stats screen.
 * Version:     2.9.0
 * Author:      Soth Kimleng
 *
 * v2.9.0 — BOTH-SIDED STATS + NEUTRAL WORDING (user request 2026-08-16:
 * "track Damrei stats as well... more general so that normal user can
 * understand and use the plugin without my presence"). The plugin grew out
 * of an MSA-popup task and its UI still read that way; this makes it an
 * even-handed ad manager. No ad behaviour changed — counting and wording
 * only.
 *   - NEW Damrei counters (bare/d_ device split like MSA's): dam_win (the
 *     split awarded Damrei the turn/lead), dam_fired (its popup zones were
 *     actually requested — head define or late define via backfill/"Show
 *     both" trailer), dam_shown (its popup appeared — same detection the
 *     v2.8.x sequencing uses). Fill rate = shown/requested, same as MSA's.
 *   - NEW pageview outcomes, judged at page-leave in flush(): exactly one
 *     of both / only_msa / only_damrei / blank per pageview (device-split
 *     counters, shown combined) — the owner's-eye "what did readers
 *     actually see" table at the top of the Stats tab. A reader who leaves
 *     before a popup's moment counts as not seeing it, deliberately.
 *   - Stats tab: outcomes table first, then "MSA popup — mobile/desktop",
 *     then "Damrei popup — mobile/desktop" (Turn wins / Popup requested /
 *     Popup shown / Fill rate / Underlay seen). Footnote rewritten
 *     network-neutrally.
 *   - Section 2: "MSA's share — mobile (%)" became "Pageview split —
 *     mobile: MSA _% — Damrei gets the rest (N%)" (same option keys,
 *     nothing to re-save); status box random-draw line shows both sides.
 *   - Clicks/revenue remain uncountable from our side for BOTH networks
 *     (cross-origin creatives) — their dashboards stay billing truth.
 *
 * v2.8.2 — UNDERLAYS NO LONGER COUNT AS "DAMREI'S POPUP" (live-probed
 * 2026-08-16, user report: "every MSA lead, i do Damrei popup but when
 * Damrei lead, i don't see MSA"): v2.8.1's close-watch worked on the
 * HOMEPAGE but not on ARTICLE pages — the articles-only underlay creatives
 * (#damrei-inner-clip-content-*, position:fixed z-index 99998, full-screen)
 * match the big-overlay scan and never leave the DOM, so on Damrei-lead
 * article pageviews damreiPopupVisible() stayed true for the page's life
 * and the MSA trailer skipped at the 30s ceiling. Probe fact that enables
 * the fix: underlay creatives are DESCENDANTS of their zone container
 * (... < #gax-inpage-async-1721642630), while the PTO takeover renders as
 * an anonymous body-level div OUTSIDE any container. So the footer now
 * bakes damreiOtherCodes (containers of enabled NON-popup zones) and the
 * popup-visibility scan skips any element inside one of them
 * (el.closest) — the underlay-check LOGGING scan stays unfiltered on
 * purpose, underlay candidates are its whole point. Also affects the
 * v2.3.0 fb_msa judgement on article pages, same blind spot.
 * Bonus from the same probe: the underlay signature for the §7.1 overlap
 * check is [id^="damrei-inner-clip-content"] — paste it into Settings ->
 * AMS Ads section 4 to make Underlay seen / Overlap count for real.
 *
 * v2.8.1 — THE DAMREI "CLOSED" SIGNAL FIXED (live-probed 2026-08-16, right
 * after v2.8.0 went live): on Damrei-lead pageviews the MSA trailer never
 * fired. Root cause in damreiPopupVisible()'s container test — the live PTO
 * container holds Gamma's three <script> tags in a 0-wide box from page load
 * on (the takeover renders in a separate anonymous overlay div), so
 * childElementCount>0 && offsetHeight>50 was ALWAYS true and the v2.8.0
 * phase-2 close-watch waited forever (trailer skipped at the 30s ceiling).
 * The test now measures rendered creative CHILDREN (script/style/noscript/
 * link skipped, >10x10 box required); the big-overlay scan stays the second
 * signal. Side effect, deliberate: the v2.3.0 backfill's "Damrei showed
 * nothing" judgement (fb_msa) had the same blind spot on this theme — it
 * could never call Damrei empty — and starts working as designed.
 *
 * v2.8.0 — SEQUENTIAL "SHOW BOTH" + FIRST-PAGEVIEW SCOPE (user request
 * 2026-08-16, after watching v2.7.0 live: "the second popup fire immediately
 * after the first one, so they overlap... popup should be closed by the user
 * or auto close first"). Measured on the live site before the change:
 * Damrei-lead pageviews had both popups stacked ~4.1s–8.7s, MSA-lead
 * ~4.1s–6.5s — the +3s trailer timer counted from page load, blind to when
 * the lead actually appeared (~2.8s for Damrei's auction) or closed
 * (auto-close ~5–6s). Two changes, both confined to the 'both' mode:
 *   1. The trailer now fires on the LEAD'S CLOSE, not a clock: watch the
 *      lead popup appear (MSA overlay ids / damreiPopupVisible()), watch it
 *      disappear (reader X or auto-close), breathe both_breather seconds
 *      (NEW setting, default 2, clamp 0–30), then fire. Lead never appears
 *      within 8s (LEAD_NOSHOW_MS — no fill) -> trailer fires anyway so the
 *      pageview isn't wasted. Lead still visible after 30s (LEAD_MAX_WAIT_MS)
 *      -> trailer SKIPPED, never stacked on top.
 *   2. NEW "Show both on" sub-setting (both_scope): 'first' = the both
 *      treatment runs on the FIRST pageview of the visit only
 *      (sessionStorage amsMsaBothDone); later pageviews behave exactly like
 *      "Take turns" — one popup each, alternating, backfill re-armed.
 *      'every' = v2.7.0 behaviour on every pageview. DEFAULT IS 'first' —
 *      a deliberate behaviour change on upgrade, chosen by the owner
 *      2026-08-16 ("i like your recommendation, please make that happen"):
 *      two popups on every pageview was the maximum-pressure combination.
 *      Rollback of just this: set "Show both on" to every pageview.
 *      Storage blocked -> can't tell first from later -> stays 'both'
 *      (the pre-2.8 behaviour, fails toward revenue).
 * 'alternate'/'random' modes: byte-identical behaviour. No new stats events.
 *
 * v2.7.0 — "SHOW BOTH" SPLIT MODE (user request 2026-08-14: "we display both
 * but the first popup is still alternating... display the second ads 3
 * second after the lead ads"). A THIRD "How to split" choice, rotation =
 * 'both': every pageview fires BOTH popup systems, the LEAD alternating per
 * visitor per device exactly like "Take turns" (same localStorage turn keys,
 * Damrei first), and the trailing side firing a fixed 3 s after the lead
 * (LEAD_GAP_MS). Mechanics reuse what exists — when MSA leads, the head
 * skips Damrei's popup zones as before and the footer calls
 * window.AMS_LATE_DAMREI() at +3 s (polling briefly in case gaxpt hasn't
 * defined it yet); when Damrei leads, the head defines its zones as before
 * and the footer delays MSA's injection by 3 s. The referee flag now means
 * "who leads" in this mode. Backfill is ignored while 'both' is selected
 * (the other side always runs; the no-fill fb_* paths are gated off so the
 * stats can't double-count). "Roll wins" counts pageviews MSA led. The two
 * old modes are byte-identical in behaviour — switching the dropdown back
 * IS the rollback. 'alternate' stays the default.
 *
 * v2.6.0 — TABS + DESKTOP SCOPE REMOVED (user request 2026-08-14):
 *   - Settings -> AMS Ads is now two tabs — Settings and Stats — under the
 *     always-visible status box and warnings. Client-side only (location.hash
 *     #stats), so saving still lands on the Settings tab. No option changed.
 *   - The "Desktop popup pages" field (desktop_categories) is GONE, and with
 *     it ams_msa_popup_desktop_scope_ok() and every bake of the scope answer
 *     into cached pages: the desktop popup now runs site-wide whenever its
 *     share is above 0, exactly like mobile. The field was the leftover of
 *     the 2026-08-12 "try it on Economy" misreading (which really meant the
 *     separate economy SITE, v2.4.0) — VERIFIED before removal: both live
 *     sites bake desktopScopeOk:true into their pages (checked 2026-08-14),
 *     i.e. both were already effectively site-wide, so this changes nothing.
 *     A stale desktop_categories key in a live install's saved option is
 *     simply ignored. One less cache-baked trap.
 *
 * v2.5.1 — INFOTAINMENT'S OWN MSA DESKTOP ZONE (from MSA 2026-08-14, "new
 * script specific for PC please try it on Infotainment": revive-popup-pc.js
 * ?v=12 data-zone=93). Supersedes the 2026-08-13 "desktop 89 shared" note.
 * MSA's full confirmed map (all four tags resent 2026-08-14): mobile
 * revive-popup.js?v=7 zones 94=infotainment/90=economy; PC
 * revive-popup-pc.js?v=12 zones 93=infotainment/89=economy. The desktop-zone
 * DEFAULT now picks by site, like the mobile zone. Seed-only change — live
 * installs keep their saved zone fields; infotainment's live settings need
 * the zone typed in by hand (93) + AMS Cache purge, economy's live 89 is
 * already right.
 *
 * v2.5.0 — SETTINGS SCREEN REVAMP (user request 2026-08-13: the screen was
 * "very confusing, doesn't have proper structure, some stuff are wrong
 * wording"). UI-ONLY — no option key, default, sanitize rule, stats counter
 * or front-end behaviour changed; upgrading is safe and changes nothing on
 * the public site. What changed on Settings -> AMS Ads:
 *   - A status box on top: what the plugin is doing RIGHT NOW (MSA popups,
 *     Damrei serving, split mode, backfill), plus red warnings for the
 *     combinations that have burned us — Damrei serving OFF while the
 *     no-Gamma header is live (the economy ad-dark deploy), desktop popup on
 *     without "one winner" protection, suppress mode with no selectors.
 *   - Four numbered sections grouped by intent: 1 MSA popups, 2 splitting
 *     pageviews, 3 Damrei zones, 4 checks & counting — instead of one flat
 *     table interleaving all five concerns.
 *   - Plain-language labels and one-line descriptions; the version-history
 *     prose ("v2.3.0. Alternate guarantees...") moved out of the field
 *     descriptions — it lives in this header and the README.
 *   - Fields grey out while their master switch (MSA popups / Serve Damrei
 *     zones) is off. Visual only: greyed inputs still submit, so toggling a
 *     master never loses the values under it.
 *   - The day-by-day stats tables sit in collapsible blocks.
 *
 * v2.4.2 — ECONOMY'S OWN MSA MOBILE ZONE (from MSA 2026-08-13): economy's
 * mobile popup is zone 90 (not infotainment's 94); desktop 89 is shared.
 * The mobile-zone DEFAULT now picks by site. Seed-only change — live
 * installs keep their saved zone fields.
 *
 * v2.4.1 — PER-SITE ZIPS (user request 2026-08-13): the build script now
 * emits TWO zips from THIS ONE source file —
 * ams-msa-popup-infotainment.zip and ams-msa-popup-economy.zip — each with
 * the site pinned via define( 'AMS_MSA_POPUP_SITE', ... ) injected at the
 * @AMS_SITE_PIN@ marker, so each zip's zone seed is hard-wired and does not
 * depend on detecting the site's domain. The INNER folder in both zips stays
 * ams-msa-popup/ — that is the plugin's WP identity; a different folder name
 * would install as a NEW plugin and orphan the live settings + stats. Edit
 * only this source file; the generated per-site copies are build output.
 *
 * v2.4.0 — THE ECONOMY PACKAGE (2026-08-13): one plugin, two sites. The zone
 * seed and one default now pick by host — economy.ams.com.kh seeds its own
 * theme's nine Gamma zones (its own underlay/PTO/footer zone ids, the same
 * two siteIds) and an EMPTY desktop category scope (the whole site is
 * Economy); every other host keeps the infotainment seed unchanged. Saved
 * settings always beat seeds, so the live infotainment install does not move.
 * The upgrade routine's contract alignment now recognises BOTH sites' zone
 * ids. Companion no-Gamma child header for economy:
 * docs/wp-ads/economy-vodi-child-header-v3-nogamma.php (README section 15).
 *
 * v2.3.2 — UNDERLAYS ON ARTICLE PAGES ONLY (user request 2026-08-13, right
 * after v2.3.1 made the underlays serve at all): new per-row "Articles only"
 * flag — the row is dropped from the printed zone list unless the URL is a
 * single post (is_single()). Server-side per URL like the category scope, so
 * page caching is safe: a URL either is an article or it isn't, for every
 * visitor. Seeded + upgraded ON for the two underlay rows. Purge AMS Cache
 * after deploy or cached non-article pages keep their old zone list.
 *
 * v2.3.1 — THE TRANSITION GUARD KILLED DAMREI (root-caused 2026-08-13 in a
 * real-browser probe after "Damrei never shows on mobile" reports):
 *   - Gamma's gaxpt.min.js serves zones ONE AT A TIME, last-defined first,
 *     and continues to the next zone by RE-CALLING the public
 *     gammatag.sendRequest() when each injection finishes. The v2.0 guard
 *     no-op'd that function right after our first call, so the chain died
 *     after a single zone — always the LAST-defined one (PTO Desktop, which
 *     Gamma 204s on mobile). Net effect: Damrei's mobile popup could never
 *     appear. Guard DELETED — the no-Gamma header is live, nothing else
 *     defines zones, and gaxpt only ever runs the LAST gammatag.cmd callback
 *     anyway (its load handler pops one), so double-stacks were impossible.
 *   - Underlay zones NEVER actually served (on this site or Economy):
 *     gaxpt's defineZone silently drops any zone whose placeholder div is
 *     missing, and the 640x1386 underlays have none. New per-row "Auto div"
 *     flag: the zones script creates the missing container in the content
 *     flow (~25% / ~70% down) before defining. Seeded ON for the underlays.
 *   - Contract alignment (README section 0) seeded + upgraded into saved
 *     settings: underlays popup=0 (always-on, never refereed) + Device
 *     Mobile; PTO Mobile popup=1 + Mobile; PTO Desktop Device Desktop (no
 *     more wasted desktop-zone request on every mobile pageview).
 *   - Zone loop now device-filters BEFORE the referee skip, so the late
 *     fallback list only ever holds zones this device could serve.
 *
 * v2.3.0 — ALTERNATION + NO-FILL FALLBACK (user request 2026-08-13, after
 * Gamma's per-visitor frequency cap made Damrei-win pageviews come up blank
 * for heavy refreshers):
 *   - Rotation "alternate" (the new default): instead of a random flip, each
 *     visitor's pageviews take strict turns — Damrei, MSA, Damrei, ... —
 *     tracked per device in localStorage (amsPopupTurn_m / amsPopupTurn_d,
 *     Damrei first for new visitors; storage blocked -> random flip).
 *     Client-side as always, so page caching is irrelevant to fairness.
 *   - No-fill fallback (on by default): when the turn-holder shows nothing,
 *     the other side runs. Damrei's turn: checked ~4.5s in (its popup zones'
 *     containers empty/hidden and no takeover overlay on screen) -> MSA
 *     fires late (fb_msa stat). MSA's turn: after its final no-fill verdict
 *     (~12s, retry included) -> the skipped Damrei popup zones are defined
 *     late via window.AMS_LATE_DAMREI, printed by the head script (fb_damrei
 *     stat). A pageview is only ever blank if BOTH sides declined.
 *
 * v2.2.0 — THE DESKTOP REFEREE (user decision 2026-08-13, after seeing MSA's
 * desktop popup stack on top of Damrei's PTO Desktop takeover live). The
 * referee now flips on BOTH devices: mobile (p = Mobile share) decides MSA
 * popup vs the Damrei underlays, desktop (p = Desktop share, only inside the
 * category scope) decides MSA's desktop popup vs every popup-flagged desktop
 * zone — PTO Desktop is popup-flagged as of this version (a one-time upgrade
 * routine flags it in saved settings too). One winner per pageview per
 * device; nothing stacks. "Desktop referee" can be unticked to return to the
 * old additive desktop behaviour.
 *
 * NAMING: known as "AMS MSA Popup" through v2.0.0 — renamed once it took over
 * the whole ad stack. The folder/file/slug stay ams-msa-popup ON PURPOSE:
 * that's the plugin's identity to WordPress, and changing it would fork the
 * plugin (breaking Replace-current upgrades and orphaning settings + stats).
 * Only the display name, menu label, and page slug changed.
 *
 * ---------------------------------------------------------------------------
 * WHY A PLUGIN: the host bans file editing from WordPress (server-side changes
 * go through aaPanel). Uploading a plugin zip through Plugins -> Add Plugin ->
 * Upload is a normal admin action.
 *
 * v2.0 TRADE-OFF, ACCEPTED (README section 13.6): this plugin is now the money
 * path. With "Serve Damrei zones" on and the no-Gamma header live, DEACTIVATING
 * THE PLUGIN STOPS ALL DAMREI ZONES SITE-WIDE until it is reactivated.
 *
 * WHAT IT PRINTS:
 *
 * A) wp_head (only when "Serve Damrei zones from this plugin" is ticked):
 *
 *   1. The REFEREE, before Gamma's tag: window.AMS_POPUP_WINNER = one coin
 *      flip per pageview. Mobile: "msa" with probability = Mobile share %.
 *      Desktop (since 2.2.0, when Desktop referee is on): "msa" with
 *      probability = Desktop share %, forced to "damrei" when the MSA popup
 *      is disabled. The flag is defined
 *      non-writable, so while the OLD referee header is still live its
 *      re-assignment silently loses and both systems keep reading one
 *      consistent flip.
 *   2. Gamma's loader (gaxpt.min.js) plus every enabled zone row from the
 *      settings-driven zone list — seeded with the nine zones the theme
 *      hardcoded. Zones flagged "popup" (the two 640x1386 underlays and,
 *      since 2.2.0, the 1600x900 PTO Desktop takeover) are skipped when the
 *      referee awarded the pageview to MSA: a zone never defined is never
 *      requested, no billed impression. One sendRequest().
 *      (v2.0's "transition guard" — no-op'ing defineZone/sendRequest after
 *      our call — was DELETED in 2.3.1: gaxpt re-enters sendRequest per
 *      zone, so the guard cut delivery to one zone. See the 2.3.1 note.)
 *      Zones with device "wide" replicate the theme's DOMContentLoaded
 *      innerWidth>500 gate — but done CORRECTLY (inside gammatag.cmd, with
 *      a sendRequest), unlike the theme's dead copy (README section 8). The
 *      Footer Desktop 728x90 row ships DISABLED for exactly that reason:
 *      the theme's version never actually served, so enabling it here is a
 *      deliberate ad-ops decision, not a default.
 *
 * B) wp_footer (when Enabled): one <style> + one inline <script>, as v1.x:
 *
 *   1. Mobile: obeys window.AMS_POPUP_WINNER when set (whether printed by
 *      this plugin or by the old theme header); falls back to its own
 *      Mobile-share roll when the flag is absent — so plugin and header can
 *      each deploy or roll back without the other going dark.
 *   2. Desktop (NEW in v2.0, README section 13.3-13.5): MSA's desktop popup
 *      script (revive-popup-pc.js, per-site zone), site-wide, per the Desktop
 *      share % / referee decision. (The category scope that once limited it
 *      was removed in v2.6.0.)
 *   3. Frequency cap (localStorage, default OFF), stamped only on fill.
 *   4. Underlay detection: log mode records whether a Damrei underlay was on
 *      screen ~2.5s after load — on BOTH devices now, so desktop overlap
 *      with Damrei's PTO Desktop (likely a takeover) gets measured before
 *      any desktop referee decision (section 13.5). Suppress mode fires MSA
 *      only when Damrei declined the pageview.
 *   5. Stats: same one-beacon-per-pageview counters, now split per device —
 *      desktop popup events use a "d_" prefix and get their own tables.
 *
 * THE CSS FIX: the child theme's ads.js applies transform:scale() to every
 * Revive iframe. The <style> neutralises it inside BOTH MSA id families
 * (#msa-revive-popup-ad and #msa-revive-pc-popup-ad) — with the desktop -pc
 * build now in use, both families are live, not just defensive.
 *
 * The full design record lives in the frontend repo, docs/wp-ads/README.md.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AMS_MSA_POPUP_OPTION', 'ams_msa_popup_settings' );

define( 'AMS_MSA_POPUP_SITE', 'education' ); // GENERATED by build-msa-popup-zip.ps1 for the EDUCATION zip - edit docs/wordpress/ams-msa-popup/, NOT this file.

// v2.4.0: which site is this install serving? The plugin ships to two
// WordPress sites (infotainment.ams.com.kh and economy.ams.com.kh — README
// section 15) whose themes hardcoded different Gamma zone ids. The seed must
// be right on FIRST load, before settings exist. v2.4.1: the per-site zips
// PIN the answer at build time (AMS_MSA_POPUP_SITE, injected by the zip
// builder at the @AMS_SITE_PIN@ marker) — deterministic, no reliance on the
// site's configured domain. The host check remains as the fallback for an
// unpinned build; unknown hosts get the infotainment seed (the status quo).
function ams_msa_popup_is_economy() {
	if ( defined( 'AMS_MSA_POPUP_SITE' ) ) {
		return 'economy' === AMS_MSA_POPUP_SITE;
	}
	$host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
	return false !== strpos( $host, 'economy' );
}

// The nine Gamma zones exactly as each site's theme hardcoded them (README
// sections 2A and 15), in the same order — gaxpt serves LIFO, last-defined
// first, so order is behaviour. code '' = derived as gax-inpage-async-{zoneId}.
// Contract model (README section 0): the UNDERLAYS are Damrei's always-on
// product — popup=0, never refereed, mobile/tablet only — and autodiv=1
// because gaxpt drops any zone whose container div is missing (neither theme
// ever had underlay divs, so they never actually served). The POPUP pair the
// referee splits is PTO Mobile / PTO Desktop, per device. Footer Desktop ships
// disabled: both themes' copies were dead code (section 8 bug — defined outside
// gammatag.cmd, never requested), so turning it on is a decision, not a port.
function ams_msa_popup_default_zones() {
	if ( ams_msa_popup_is_economy() ) {
		return array(
			array( 'label' => 'Underlay', 'zone_id' => '1729764934', 'site_id' => '1721642224', 'w' => 640, 'h' => 1386, 'device' => 'mobile', 'popup' => 0, 'enabled' => 1, 'autodiv' => 1, 'single' => 1, 'code' => '' ),
			array( 'label' => 'MR1 Zone2', 'zone_id' => '1726823765', 'site_id' => '1721642224', 'w' => 300, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
			array( 'label' => 'MR1', 'zone_id' => '1729764905', 'site_id' => '1721642224', 'w' => 300, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
			array( 'label' => 'Underlay 2', 'zone_id' => '1731396715', 'site_id' => '1721642224', 'w' => 640, 'h' => 1386, 'device' => 'mobile', 'popup' => 0, 'enabled' => 1, 'autodiv' => 1, 'single' => 1, 'code' => '' ),
			array( 'label' => 'Footer Mobile', 'zone_id' => '1729766383', 'site_id' => '1721642224', 'w' => 720, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
			array( 'label' => 'MR1 Desktop', 'zone_id' => '1728357404', 'site_id' => '1725879762', 'w' => 300, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
			array( 'label' => 'PTO Mobile', 'zone_id' => '1729764963', 'site_id' => '1721642224', 'w' => 282, 'h' => 370, 'device' => 'mobile', 'popup' => 1, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
			array( 'label' => 'PTO Desktop', 'zone_id' => '1739329474', 'site_id' => '1725879762', 'w' => 1600, 'h' => 900, 'device' => 'desktop', 'popup' => 1, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
			array( 'label' => 'Footer Desktop (was dead in theme)', 'zone_id' => '1725879986', 'site_id' => '1725879762', 'w' => 728, 'h' => 90, 'device' => 'wide', 'popup' => 0, 'enabled' => 0, 'autodiv' => 0, 'code' => '' ),
		);
	}
	return array(
		array( 'label' => 'Underlay', 'zone_id' => '1721642630', 'site_id' => '1721642224', 'w' => 640, 'h' => 1386, 'device' => 'mobile', 'popup' => 0, 'enabled' => 1, 'autodiv' => 1, 'single' => 1, 'code' => '' ),
		array( 'label' => 'MR1 Zone2', 'zone_id' => '1726823765', 'site_id' => '1721642224', 'w' => 300, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
		array( 'label' => 'MR1', 'zone_id' => '1721642412', 'site_id' => '1721642224', 'w' => 300, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
		array( 'label' => 'Underlay 2', 'zone_id' => '1722239706', 'site_id' => '1721642224', 'w' => 640, 'h' => 1386, 'device' => 'mobile', 'popup' => 0, 'enabled' => 1, 'autodiv' => 1, 'single' => 1, 'code' => '' ),
		array( 'label' => 'MR1 Desktop', 'zone_id' => '1728357404', 'site_id' => '1725879762', 'w' => 300, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
		array( 'label' => 'Footer Mobile', 'zone_id' => '1725858296', 'site_id' => '1721642224', 'w' => 720, 'h' => 250, 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
		array( 'label' => 'PTO Mobile', 'zone_id' => '1721642896', 'site_id' => '1721642224', 'w' => 282, 'h' => 370, 'device' => 'mobile', 'popup' => 1, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
		array( 'label' => 'PTO Desktop', 'zone_id' => '1739240031', 'site_id' => '1725879762', 'w' => 1600, 'h' => 900, 'device' => 'desktop', 'popup' => 1, 'enabled' => 1, 'autodiv' => 0, 'code' => '' ),
		array( 'label' => 'Footer Desktop (was dead in theme)', 'zone_id' => '1725879986', 'site_id' => '1725879762', 'w' => 728, 'h' => 90, 'device' => 'wide', 'popup' => 0, 'enabled' => 0, 'autodiv' => 0, 'code' => '' ),
	);
}

function ams_msa_popup_defaults() {
	return array(
		'enabled'            => 0, // OFF on install: configure first, then enable. Admin testing hits LIVE.
		'script_url'         => 'https://msacam.com/ads/revive-popup.js?v=7',
		// MSA zones per site (MSA 2026-08-13): mobile 94 = infotainment,
		// 90 = economy; desktop 89 is shared by both sites.
		'zone'               => ams_msa_popup_is_economy() ? '90' : '94',
		'mobile_share'       => 50, // v2.0: also the referee's MSA probability when Gamma serving is on
		'desktop_share'      => 0, // raise to try MSA's desktop popup (zone 89); 0 = desktop popup off
		'desktop_referee'    => 1, // v2.2.0: one flip decides MSA desktop popup OR the popup-flagged
		                           // Damrei desktop zones (PTO). Off = old additive stacking.
		'rotation'           => 'alternate', // v2.3.0: alternate = strict turns per visitor; random = share % flip
		                           // v2.7.0: 'both' = both popups, lead alternates; v2.8.0: trailer waits for the lead to close
		'both_scope'         => 'first', // v2.8.0: 'first' = both only on the visit's first pageview (then take turns); 'every' = v2.7.0 behaviour
		'both_breather'      => 2, // v2.8.0: seconds between the lead closing and the trailer firing (both mode only)
		'fallback'           => 1, // v2.3.0: turn-holder shows nothing -> the other side runs
		'desktop_script_url' => 'https://msacam.com/ads/revive-popup-pc.js?v=12',
		// MSA desktop zones per site (confirmed by MSA 2026-08-14):
		// 93 = infotainment, 89 = economy ("89 shared" was wrong).
		'desktop_zone'       => ams_msa_popup_is_economy() ? '89' : '93',
		// v2.6.0: desktop_categories (the desktop popup's category scope) was
		// REMOVED — both live sites were already scope-open, and the baked
		// per-page answer was a purge-AMS-Cache trap. Desktop runs site-wide.
		'cap_hours'          => 0, // user decision 2026-08-11: no cap; the roll/referee is the limiter
		'underlay_mode'      => 'log', // off | log | suppress
		'underlay_selectors' => '', // one CSS selector per line; empty = signature not collected yet
		'stats'              => 1, // beacon + stats screen; off = ads keep running, counting stops
		'debug'              => 0,
		'gamma_enabled'      => 0, // v2.0: print Damrei's zones + referee from here. OFF on upgrade —
		                           // flip it as deploy step 2, BEFORE the no-Gamma header swap (section 13.2).
		'zones'              => array(), // empty = use ams_msa_popup_default_zones() (see ams_msa_popup_settings)
	);
}

function ams_msa_popup_settings() {
	$saved = get_option( AMS_MSA_POPUP_OPTION, array() );
	if ( ! is_array( $saved ) ) {
		$saved = array();
	}
	$o = array_merge( ams_msa_popup_defaults(), $saved );
	if ( empty( $o['zones'] ) || ! is_array( $o['zones'] ) ) {
		$o['zones'] = ams_msa_popup_default_zones();
	}
	return $o;
}

// One-time upgrade of SAVED settings (the seed alone never reaches a site
// whose zone list is already in the DB). 2.2.0: popup-flag PTO Desktop for
// the desktop referee. 2.3.1: align the saved rows with the section-0
// contract — underlays always-on (popup=0) + Device Mobile + autodiv (their
// container div never existed, so they never served); PTO Mobile popup=1 +
// Mobile; PTO Desktop Device Desktop. Device is only touched when still
// "all", so a deliberate later edit survives re-activation. 2.3.2: underlays
// get "Articles only" (single=1). 2.4.0: the id sets cover BOTH sites' zones
// (infotainment + economy — README section 15). All steps idempotent — the
// whole block re-runs for any site below the current version.
add_action( 'plugins_loaded', 'ams_msa_popup_upgrade' );
function ams_msa_popup_upgrade() {
	if ( version_compare( get_option( 'ams_msa_popup_version', '0' ), '2.4.0', '>=' ) ) {
		return;
	}
	$underlays   = array( '1721642630', '1722239706', '1729764934', '1731396715' );
	$pto_mobile  = array( '1721642896', '1729764963' );
	$pto_desktop = array( '1739240031', '1739329474' );
	$saved       = get_option( AMS_MSA_POPUP_OPTION, array() );
	if ( is_array( $saved ) && ! empty( $saved['zones'] ) && is_array( $saved['zones'] ) ) {
		foreach ( $saved['zones'] as $i => $z ) {
			$zid    = isset( $z['zone_id'] ) ? (string) $z['zone_id'] : '';
			$device = isset( $z['device'] ) ? (string) $z['device'] : 'all';
			if ( in_array( $zid, $underlays, true ) ) {
				$saved['zones'][ $i ]['popup']   = 0;
				$saved['zones'][ $i ]['autodiv'] = 1;
				$saved['zones'][ $i ]['single']  = 1; // 2.3.2: articles only
				if ( 'all' === $device ) {
					$saved['zones'][ $i ]['device'] = 'mobile';
				}
			} elseif ( in_array( $zid, $pto_mobile, true ) ) {
				$saved['zones'][ $i ]['popup'] = 1;
				if ( 'all' === $device ) {
					$saved['zones'][ $i ]['device'] = 'mobile';
				}
			} elseif ( in_array( $zid, $pto_desktop, true ) ) {
				$saved['zones'][ $i ]['popup'] = 1;
				if ( 'all' === $device ) {
					$saved['zones'][ $i ]['device'] = 'desktop';
				}
			}
		}
		update_option( AMS_MSA_POPUP_OPTION, $saved );
	}
	update_option( 'ams_msa_popup_version', '2.4.0', false );
}

/* ------------------------------------------------------------------------- *
 * Stats storage: one tiny table of per-day counters
 * ------------------------------------------------------------------------- */

function ams_msa_popup_table() {
	global $wpdb;
	return $wpdb->prefix . 'ams_msa_popup_stats';
}

// Every event name the beacon may increment. Anything else is dropped.
// v2.0: each popup event exists twice — bare = the mobile popup (zone 94),
// "d_" prefix = the desktop popup (zone 89). Pageviews were already split.
function ams_msa_popup_events() {
	$popup = array(
		'win',        // roll/referee chose MSA
		'capped',     // roll won but the frequency cap blocked it (only when cap armed)
		'fired',      // MSA's script tag injected
		'filled',     // popup actually showed (Revive iframe appeared)
		'nofill',     // both attempts fired and nothing arrived (final verdict)
		'retry',      // first attempt timed out, second attempt launched (v1.3.0)
		'close_user', // reader closed it (x / Esc) before the auto-close
		'close_auto', // popup auto-closed
		'underlay',   // a Damrei underlay/takeover was on screen at the ~2.5s check
		'overlap',    // both popups on the same pageview (filled AND underlay)
		'suppressed', // suppress mode skipped MSA because Damrei was showing
		'fb_msa',     // Damrei's turn showed nothing -> MSA fired as fallback (v2.3.0)
		'fb_damrei',  // MSA's turn came up no-fill -> Damrei popup zones defined late (v2.3.0)
		// v2.9.0 — Damrei's side of the ledger (same bare/d_ device split):
		'dam_win',    // referee gave Damrei the turn (or the lead in "Show both")
		'dam_fired',  // Damrei's popup zones were requested (head define or late define)
		'dam_shown',  // Damrei's popup actually appeared on screen
		// v2.9.0 — what the pageview actually delivered, judged at page-leave:
		'both',       // both popups were seen this pageview
		'only_msa',   // only MSA's popup was seen
		'only_damrei',// only Damrei's popup was seen
		'blank',      // neither popup was seen (declines, or reader left early)
	);
	$events = array(
		'pv_m', // mobile pageview (SAMPLED 1-in-10 — display multiplies by 10)
		'pv_d', // desktop pageview (sampled likewise)
	);
	foreach ( $popup as $ev ) {
		$events[] = $ev;
		$events[] = 'd_' . $ev;
	}
	return $events;
}

function ams_msa_popup_ensure_table() {
	if ( '1' === get_option( 'ams_msa_popup_db' ) ) {
		return;
	}
	global $wpdb;
	$table   = ams_msa_popup_table();
	$charset = $wpdb->get_charset_collate();
	$wpdb->query( "CREATE TABLE IF NOT EXISTS `{$table}` (
		day date NOT NULL,
		event varchar(20) NOT NULL,
		cnt bigint(20) unsigned NOT NULL DEFAULT 0,
		PRIMARY KEY (day, event)
	) {$charset}" );
	update_option( 'ams_msa_popup_db', '1', false );
}
register_activation_hook( __FILE__, 'ams_msa_popup_ensure_table' );

/* ------------------------------------------------------------------------- *
 * Stats intake: the beacon endpoint
 *
 * Public POST, one per pageview at most, body {"e":{"filled":1,...}}. Event
 * names are whitelisted, counts clamped, everything aggregates into daily
 * counters — nothing per-visitor is stored, so there is nothing to abuse
 * beyond inflating a counter, which the clamp keeps cheap.
 * ------------------------------------------------------------------------- */

add_action( 'rest_api_init', 'ams_msa_popup_rest_init' );
function ams_msa_popup_rest_init() {
	register_rest_route(
		'ams-msa-popup/v1',
		'/e',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => 'ams_msa_popup_beacon',
		)
	);
}

function ams_msa_popup_beacon( $req ) {
	$o = ams_msa_popup_settings();
	if ( ! $o['enabled'] || ! $o['stats'] ) {
		return new WP_REST_Response( null, 204 );
	}

	$body = json_decode( $req->get_body(), true );
	$in   = ( is_array( $body ) && isset( $body['e'] ) && is_array( $body['e'] ) ) ? $body['e'] : array();

	$rows = array();
	foreach ( ams_msa_popup_events() as $ev ) {
		if ( empty( $in[ $ev ] ) || ! is_numeric( $in[ $ev ] ) ) {
			continue;
		}
		$rows[ $ev ] = max( 1, min( 20, (int) $in[ $ev ] ) );
	}
	if ( ! $rows ) {
		return new WP_REST_Response( null, 204 );
	}

	ams_msa_popup_ensure_table();
	global $wpdb;
	$table        = ams_msa_popup_table();
	$day          = current_time( 'Y-m-d' );
	$placeholders = array();
	$values       = array();
	foreach ( $rows as $ev => $n ) {
		$placeholders[] = '(%s,%s,%d)';
		array_push( $values, $day, $ev, $n );
	}
	// Atomic per-row increments: concurrent beacons never lose updates.
	$sql = "INSERT INTO `{$table}` (day, event, cnt) VALUES " . implode( ',', $placeholders ) .
		' ON DUPLICATE KEY UPDATE cnt = cnt + VALUES(cnt)';
	$wpdb->query( $wpdb->prepare( $sql, $values ) ); // phpcs:ignore WordPress.DB.PreparedSQL

	return new WP_REST_Response( null, 204 );
}

/* ------------------------------------------------------------------------- *
 * Settings screen (Settings -> AMS Ads): stats on top, settings below
 * ------------------------------------------------------------------------- */

add_action( 'admin_menu', 'ams_msa_popup_admin_menu' );
function ams_msa_popup_admin_menu() {
	add_options_page(
		'AMS Ads Manager',
		'AMS Ads',
		'manage_options',
		'ams-ads-manager',
		'ams_msa_popup_settings_page'
	);
}

add_action( 'admin_init', 'ams_msa_popup_admin_init' );
function ams_msa_popup_admin_init() {
	register_setting(
		'ams_msa_popup',
		AMS_MSA_POPUP_OPTION,
		array( 'sanitize_callback' => 'ams_msa_popup_sanitize' )
	);
}

// Settings link next to Activate/Deactivate on the Plugins screen.
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'ams_msa_popup_action_links' );
function ams_msa_popup_action_links( $links ) {
	array_unshift(
		$links,
		'<a href="' . esc_url( admin_url( 'options-general.php?page=ams-ads-manager' ) ) . '">Settings</a>'
	);
	return $links;
}

function ams_msa_popup_clamp_int( $value, $min, $max, $fallback ) {
	if ( ! is_numeric( $value ) ) {
		return $fallback;
	}
	return max( $min, min( $max, (int) $value ) );
}

function ams_msa_popup_sanitize( $in ) {
	$d = ams_msa_popup_defaults();
	if ( ! is_array( $in ) ) {
		return $d;
	}

	$out                    = array();
	$out['enabled']         = empty( $in['enabled'] ) ? 0 : 1;
	$out['stats']           = empty( $in['stats'] ) ? 0 : 1;
	$out['debug']           = empty( $in['debug'] ) ? 0 : 1;
	$out['gamma_enabled']   = empty( $in['gamma_enabled'] ) ? 0 : 1;
	$out['desktop_referee'] = empty( $in['desktop_referee'] ) ? 0 : 1;
	$out['fallback']        = empty( $in['fallback'] ) ? 0 : 1;

	$rot             = isset( $in['rotation'] ) ? (string) $in['rotation'] : '';
	$out['rotation'] = in_array( $rot, array( 'alternate', 'random', 'both' ), true ) ? $rot : $d['rotation'];

	$scope             = isset( $in['both_scope'] ) ? (string) $in['both_scope'] : '';
	$out['both_scope'] = in_array( $scope, array( 'first', 'every' ), true ) ? $scope : $d['both_scope'];

	$out['both_breather'] = ams_msa_popup_clamp_int( isset( $in['both_breather'] ) ? $in['both_breather'] : null, 0, 30, $d['both_breather'] );

	$url               = isset( $in['script_url'] ) ? esc_url_raw( trim( (string) $in['script_url'] ), array( 'https', 'http' ) ) : '';
	$out['script_url'] = $url ? $url : $d['script_url'];

	$zone        = isset( $in['zone'] ) ? preg_replace( '/\D/', '', (string) $in['zone'] ) : '';
	$out['zone'] = ( '' === $zone ) ? $d['zone'] : $zone;

	$durl                     = isset( $in['desktop_script_url'] ) ? esc_url_raw( trim( (string) $in['desktop_script_url'] ), array( 'https', 'http' ) ) : '';
	$out['desktop_script_url'] = $durl ? $durl : $d['desktop_script_url'];

	$dzone               = isset( $in['desktop_zone'] ) ? preg_replace( '/\D/', '', (string) $in['desktop_zone'] ) : '';
	$out['desktop_zone'] = ( '' === $dzone ) ? $d['desktop_zone'] : $dzone;

	$out['mobile_share']  = ams_msa_popup_clamp_int( isset( $in['mobile_share'] ) ? $in['mobile_share'] : null, 0, 100, $d['mobile_share'] );
	$out['desktop_share'] = ams_msa_popup_clamp_int( isset( $in['desktop_share'] ) ? $in['desktop_share'] : null, 0, 100, $d['desktop_share'] );
	$out['cap_hours']     = ams_msa_popup_clamp_int( isset( $in['cap_hours'] ) ? $in['cap_hours'] : null, 0, 720, $d['cap_hours'] );

	$mode                 = isset( $in['underlay_mode'] ) ? (string) $in['underlay_mode'] : '';
	$out['underlay_mode'] = in_array( $mode, array( 'off', 'log', 'suppress' ), true ) ? $mode : $d['underlay_mode'];

	$selectors = isset( $in['underlay_selectors'] ) ? sanitize_textarea_field( (string) $in['underlay_selectors'] ) : '';
	$lines     = array();
	foreach ( preg_split( '/\r\n|\r|\n/', $selectors ) as $line ) {
		$line = trim( $line );
		if ( '' !== $line ) {
			$lines[] = $line;
		}
	}
	$out['underlay_selectors'] = implode( "\n", $lines );

	// Zone rows: a row without a numeric zone AND site id is dropped (that is
	// also how the blank "add" rows disappear). Emptying every row restores
	// the seeded defaults — turn off "Serve Damrei zones" to stop serving.
	$zones = array();
	if ( isset( $in['zones'] ) && is_array( $in['zones'] ) ) {
		foreach ( $in['zones'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$zone_id = isset( $row['zone_id'] ) ? preg_replace( '/\D/', '', (string) $row['zone_id'] ) : '';
			$site_id = isset( $row['site_id'] ) ? preg_replace( '/\D/', '', (string) $row['site_id'] ) : '';
			if ( '' === $zone_id || '' === $site_id ) {
				continue;
			}
			$device  = isset( $row['device'] ) ? (string) $row['device'] : 'all';
			$zones[] = array(
				'label'   => isset( $row['label'] ) ? sanitize_text_field( (string) $row['label'] ) : '',
				'zone_id' => $zone_id,
				'site_id' => $site_id,
				'w'       => ams_msa_popup_clamp_int( isset( $row['w'] ) ? $row['w'] : null, 1, 4000, 300 ),
				'h'       => ams_msa_popup_clamp_int( isset( $row['h'] ) ? $row['h'] : null, 1, 4000, 250 ),
				'device'  => in_array( $device, array( 'all', 'mobile', 'desktop', 'wide' ), true ) ? $device : 'all',
				'popup'   => empty( $row['popup'] ) ? 0 : 1,
				'enabled' => empty( $row['enabled'] ) ? 0 : 1,
				'autodiv' => empty( $row['autodiv'] ) ? 0 : 1,
				'single'  => empty( $row['single'] ) ? 0 : 1,
				'code'    => isset( $row['code'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $row['code'] ) : '',
			);
		}
	}
	$out['zones'] = $zones ? $zones : ams_msa_popup_default_zones();

	return $out;
}

// Last 30 days of counters as [day][event] => cnt.
function ams_msa_popup_stats_by_day() {
	ams_msa_popup_ensure_table();
	global $wpdb;
	$table = ams_msa_popup_table();
	$since = date( 'Y-m-d', current_time( 'timestamp' ) - 29 * DAY_IN_SECONDS );
	$rows  = $wpdb->get_results(
		$wpdb->prepare( "SELECT day, event, cnt FROM `{$table}` WHERE day >= %s", $since ), // phpcs:ignore WordPress.DB.PreparedSQL
		ARRAY_A
	);
	$by_day = array();
	foreach ( (array) $rows as $r ) {
		$by_day[ $r['day'] ][ $r['event'] ] = (int) $r['cnt'];
	}
	return $by_day;
}

// Sum events over the day range [$from_ago .. $to_ago] days before today.
function ams_msa_popup_stats_range( $by_day, $from_ago, $to_ago ) {
	$totals = array_fill_keys( ams_msa_popup_events(), 0 );
	$now    = current_time( 'timestamp' );
	for ( $i = $to_ago; $i <= $from_ago; $i++ ) {
		$day = date( 'Y-m-d', $now - $i * DAY_IN_SECONDS );
		if ( empty( $by_day[ $day ] ) ) {
			continue;
		}
		foreach ( $by_day[ $day ] as $ev => $cnt ) {
			if ( isset( $totals[ $ev ] ) ) {
				$totals[ $ev ] += $cnt;
			}
		}
	}
	return $totals;
}

function ams_msa_popup_pct( $part, $whole ) {
	return $whole > 0 ? round( 100 * $part / $whole ) . '%' : '–';
}

// One stats row. $p is the event prefix: '' = mobile popup, 'd_' = desktop.
function ams_msa_popup_stats_row_html( $label, $t, $p = '' ) {
	$pv = 10 * $t[ '' === $p ? 'pv_m' : 'pv_d' ]; // pageviews are sampled 1-in-10
	echo '<tr>';
	echo '<td><strong>' . esc_html( $label ) . '</strong></td>';
	echo '<td>' . esc_html( number_format_i18n( $pv ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'win' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'fired' ] ) ) . '</td>';
	echo '<td><strong>' . esc_html( number_format_i18n( $t[ $p . 'filled' ] ) ) . '</strong></td>';
	echo '<td>' . esc_html( ams_msa_popup_pct( $t[ $p . 'filled' ], $t[ $p . 'fired' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'close_user' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'close_auto' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'underlay' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'overlap' ] ) ) . '</td>';
	echo '</tr>';
}

function ams_msa_popup_stats_head_html() {
	echo '<thead><tr>';
	echo '<th></th><th>Pageviews (est.)</th><th>Roll wins</th><th>Fired</th><th>Shown</th><th>Fill rate</th>';
	echo '<th>Closed by reader</th><th>Auto-closed</th><th>Underlay seen</th><th>Overlap</th>';
	echo '</tr></thead>';
}

function ams_msa_popup_stats_summary_html( $by_day, $p = '' ) {
	echo '<table class="widefat striped" style="max-width:1100px">';
	ams_msa_popup_stats_head_html();
	echo '<tbody>';
	ams_msa_popup_stats_row_html( 'Today', ams_msa_popup_stats_range( $by_day, 0, 0 ), $p );
	ams_msa_popup_stats_row_html( 'Yesterday', ams_msa_popup_stats_range( $by_day, 1, 1 ), $p );
	ams_msa_popup_stats_row_html( 'Last 7 days', ams_msa_popup_stats_range( $by_day, 6, 0 ), $p );
	ams_msa_popup_stats_row_html( 'Last 30 days', ams_msa_popup_stats_range( $by_day, 29, 0 ), $p );
	echo '</tbody></table>';
}

function ams_msa_popup_stats_daily_html( $by_day, $p = '' ) {
	echo '<table class="widefat striped" style="max-width:1100px">';
	ams_msa_popup_stats_head_html();
	echo '<tbody>';
	$now = current_time( 'timestamp' );
	for ( $i = 0; $i <= 13; $i++ ) {
		$day = date( 'Y-m-d', $now - $i * DAY_IN_SECONDS );
		if ( empty( $by_day[ $day ] ) && $i > 0 ) {
			continue; // skip empty past days; always show today
		}
		ams_msa_popup_stats_row_html( $day, ams_msa_popup_stats_range( $by_day, $i, $i ), $p );
	}
	echo '</tbody></table>';
}

// v2.9.0: Damrei's side of the ledger. Same bare/d_ device split as MSA's rows.
function ams_msa_popup_damrei_row_html( $label, $t, $p = '' ) {
	echo '<tr>';
	echo '<td><strong>' . esc_html( $label ) . '</strong></td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'dam_win' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'dam_fired' ] ) ) . '</td>';
	echo '<td><strong>' . esc_html( number_format_i18n( $t[ $p . 'dam_shown' ] ) ) . '</strong></td>';
	echo '<td>' . esc_html( ams_msa_popup_pct( $t[ $p . 'dam_shown' ], $t[ $p . 'dam_fired' ] ) ) . '</td>';
	echo '<td>' . esc_html( number_format_i18n( $t[ $p . 'underlay' ] ) ) . '</td>';
	echo '</tr>';
}

function ams_msa_popup_damrei_summary_html( $by_day, $p = '' ) {
	echo '<table class="widefat striped" style="max-width:900px">';
	echo '<thead><tr><th></th><th>Turn wins</th><th>Popup requested</th><th>Popup shown</th><th>Fill rate</th><th>Underlay seen</th></tr></thead>';
	echo '<tbody>';
	ams_msa_popup_damrei_row_html( 'Today', ams_msa_popup_stats_range( $by_day, 0, 0 ), $p );
	ams_msa_popup_damrei_row_html( 'Yesterday', ams_msa_popup_stats_range( $by_day, 1, 1 ), $p );
	ams_msa_popup_damrei_row_html( 'Last 7 days', ams_msa_popup_stats_range( $by_day, 6, 0 ), $p );
	ams_msa_popup_damrei_row_html( 'Last 30 days', ams_msa_popup_stats_range( $by_day, 29, 0 ), $p );
	echo '</tbody></table>';
}

// v2.9.0: the owner's-eye view — of the pageviews we could judge (counted at
// page-leave, both devices together), how many actually delivered both popups,
// one, or none.
function ams_msa_popup_outcomes_row_html( $label, $t ) {
	$both   = $t['both'] + $t['d_both'];
	$msa    = $t['only_msa'] + $t['d_only_msa'];
	$damrei = $t['only_damrei'] + $t['d_only_damrei'];
	$none   = $t['blank'] + $t['d_blank'];
	$total  = $both + $msa + $damrei + $none;
	echo '<tr>';
	echo '<td><strong>' . esc_html( $label ) . '</strong></td>';
	foreach ( array( $both, $msa, $damrei, $none ) as $n ) {
		echo '<td>' . esc_html( number_format_i18n( $n ) ) . ' <span style="color:#777">(' . esc_html( ams_msa_popup_pct( $n, $total ) ) . ')</span></td>';
	}
	echo '</tr>';
}

function ams_msa_popup_outcomes_summary_html( $by_day ) {
	echo '<table class="widefat striped" style="max-width:900px">';
	echo '<thead><tr><th></th><th>Both popups</th><th>Only MSA</th><th>Only Damrei</th><th>Neither</th></tr></thead>';
	echo '<tbody>';
	ams_msa_popup_outcomes_row_html( 'Today', ams_msa_popup_stats_range( $by_day, 0, 0 ) );
	ams_msa_popup_outcomes_row_html( 'Yesterday', ams_msa_popup_stats_range( $by_day, 1, 1 ) );
	ams_msa_popup_outcomes_row_html( 'Last 7 days', ams_msa_popup_stats_range( $by_day, 6, 0 ) );
	ams_msa_popup_outcomes_row_html( 'Last 30 days', ams_msa_popup_stats_range( $by_day, 29, 0 ) );
	echo '</tbody></table>';
}

function ams_msa_popup_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$o = ams_msa_popup_settings();

	// The status box: what the plugin is doing RIGHT NOW, derived from saved
	// settings, plus red warnings for the combinations that have bitten us —
	// economy went ad-dark on deploy day because the no-Gamma header went live
	// while "Serve Damrei zones" was still off; a warning here would have said so.
	$zones_on = 0;
	foreach ( $o['zones'] as $z ) {
		if ( ! empty( $z['enabled'] ) ) {
			$zones_on++;
		}
	}
	if ( $o['enabled'] ) {
		$msa_status = 'On — mobile popup (zone ' . $o['zone'] . ')' .
			( $o['desktop_share'] > 0 ? ' and desktop popup (zone ' . $o['desktop_zone'] . ')' : '; desktop popup off (its share is 0)' );
	} else {
		$msa_status = 'Off — no MSA popups anywhere';
	}
	$damrei_status = $o['gamma_enabled']
		? 'Served by this plugin — ' . $zones_on . ' of ' . count( $o['zones'] ) . ' zone rows on'
		: 'NOT served by this plugin';
	if ( ! $o['enabled'] ) {
		$split_status = 'Every pageview goes to Damrei (MSA popups are off)';
	} elseif ( 'both' === $o['rotation'] ) {
		$split_status = ( 'first' === $o['both_scope']
			? 'Both popups on the FIRST pageview of each visit (after that: one per pageview, taking turns)'
			: 'Both popups on every pageview' )
			. ' — taking turns going first; the second waits for the first to close, then '
			. (int) $o['both_breather'] . 's more';
	} elseif ( 'alternate' === $o['rotation'] ) {
		$split_status = 'Taking turns, per visitor per device — Damrei first';
	} else {
		$split_status = 'Random draw — mobile: MSA ' . (int) $o['mobile_share'] . '% / Damrei ' . (int) ( 100 - $o['mobile_share'] ) . '%; desktop: MSA ' . (int) $o['desktop_share'] . '% / Damrei ' . (int) ( 100 - $o['desktop_share'] ) . '%';
	}

	$warnings = array();
	if ( ! $o['gamma_enabled'] ) {
		$warnings[] = 'Damrei zones are NOT being served by this plugin. Both our sites run the no-Gamma theme header, so if that header is live, Damrei ads are dark right now. Turn on "Serve Damrei zones" (section 3) — and on a fresh deploy, always turn it on BEFORE the header goes live.';
	}
	if ( $o['gamma_enabled'] && ! $o['enabled'] ) {
		$warnings[] = 'MSA popups are off, so Damrei gets every pageview — and all of section 2 is idle until "Show MSA popup ads" (section 1) is back on.';
	}
	if ( $o['enabled'] && $o['desktop_share'] > 0 && ! $o['desktop_referee'] ) {
		$warnings[] = 'The desktop popup is on but "One winner on desktop" (section 2) is off — MSA\'s desktop popup can appear on top of Damrei\'s desktop takeover. That stacking was seen live before it got its own switch.';
	}
	if ( 'suppress' === $o['underlay_mode'] && '' === trim( $o['underlay_selectors'] ) ) {
		$warnings[] = 'The overlap check is set to hold MSA back, but the selector list (section 4) is empty — nothing is ever held back until it is filled in.';
	}
	?>
	<style id="ams-ads-admin-css">
	.ams-status{border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;padding:8px 16px;max-width:1068px;margin:16px 0}
	.ams-status th{text-align:left;padding:4px 24px 4px 0;white-space:nowrap;vertical-align:top}
	.ams-status td{padding:4px 0}
	.ams-warn{border:1px solid #c3c4c7;border-left:4px solid #d63638;background:#fcf0f1;padding:1px 16px;max-width:1068px;margin:8px 0}
	.ams-section{margin-top:32px;padding-top:12px;border-top:1px solid #c3c4c7;max-width:1100px}
	.ams-inert{opacity:.4}
	</style>
	<div class="wrap">
		<h1>AMS Ads Manager</h1>

		<div class="ams-status">
			<table>
				<tr><th>MSA popups</th><td><?php echo esc_html( $msa_status ); ?></td></tr>
				<tr><th>Damrei zones</th><td><?php echo esc_html( $damrei_status ); ?></td></tr>
				<tr><th>Pageview split</th><td><?php echo esc_html( $split_status ); ?></td></tr>
				<tr><th>Backfill</th><td><?php
				if ( 'both' === $o['rotation'] && $o['enabled'] ) {
					echo 'Not applicable — both sides already run on every pageview';
				} else {
					echo $o['fallback'] ? 'On — a pageview whose winner shows nothing is offered to the other side' : 'Off — a pageview whose winner shows nothing stays blank';
				}
				?></td></tr>
			</table>
			<p><strong>This screen controls the live site.</strong> After saving any change, <strong>purge AMS Cache</strong> — cached pages keep the old behaviour until you do.</p>
		</div>
		<?php foreach ( $warnings as $w ) : ?>
			<div class="ams-warn"><p><?php echo esc_html( $w ); ?></p></div>
		<?php endforeach; ?>

		<h2 class="nav-tab-wrapper" id="ams-tabs" style="margin-top:16px">
			<a href="#settings" class="nav-tab nav-tab-active">Settings</a>
			<a href="#stats" class="nav-tab">Stats</a>
		</h2>

		<div id="ams-tab-stats" style="display:none">
		<?php
		$by_day  = ams_msa_popup_stats_by_day();
		$has_any = ! empty( $by_day );
		if ( ! $has_any ) {
			echo '<p>No data yet — counting starts once "Show MSA popup ads" (Settings tab, section 1) is on and pageviews come in. (Counting itself: ' . ( $o['stats'] ? 'on' : '<strong>off — see Settings tab, section 4</strong>' ) . '.)</p>';
		} else {
			$t30         = ams_msa_popup_stats_range( $by_day, 29, 0 );
			$has_desktop = $o['desktop_share'] > 0 || $t30['d_win'] > 0 || $t30['d_fired'] > 0;
			$has_outcomes       = $t30['both'] + $t30['d_both'] + $t30['only_msa'] + $t30['d_only_msa'] + $t30['only_damrei'] + $t30['d_only_damrei'] + $t30['blank'] + $t30['d_blank'] > 0;
			$has_damrei         = $t30['dam_win'] + $t30['dam_fired'] > 0;
			$has_damrei_desktop = $t30['d_dam_win'] + $t30['d_dam_fired'] > 0;

			if ( $has_outcomes ) {
				echo '<h3>What pageviews delivered — both devices together</h3>';
				ams_msa_popup_outcomes_summary_html( $by_day );
				echo '<p class="description" style="max-width:900px">Judged when the reader leaves the page, so a reader who moves on before a popup&#39;s moment counts as not seeing it — this is what was actually seen, not what was scheduled. &ldquo;Neither&rdquo; includes pageviews where both networks declined and quick visits.</p>';
			}

			echo '<h3>MSA popup — mobile (zone ' . esc_html( $o['zone'] ) . ')</h3>';
			ams_msa_popup_stats_summary_html( $by_day, '' );
			if ( $has_desktop ) {
				echo '<h3>MSA popup — desktop (zone ' . esc_html( $o['desktop_zone'] ) . ')</h3>';
				ams_msa_popup_stats_summary_html( $by_day, 'd_' );
			}
			if ( $has_damrei ) {
				echo '<h3>Damrei popup — mobile</h3>';
				ams_msa_popup_damrei_summary_html( $by_day, '' );
			}
			if ( $has_damrei_desktop ) {
				echo '<h3>Damrei popup — desktop</h3>';
				ams_msa_popup_damrei_summary_html( $by_day, 'd_' );
			}
			?>
			<p class="description" style="max-width:1100px">
				Pageviews are sampled 1-in-10 and shown &times;10 (an estimate); all other events
				are counted exactly. <em>Shown</em> = the popup actually displayed. <em>Fill
				rate</em> = shown &divide; requested — when a network's fill rate is low, its
				server is declining our requests: take that number to that network.
				<em>Turn wins / Roll wins</em> = pageviews the split (section 2) awarded to that
				side — in "Show both" it means who went FIRST, and either side can still fire
				after the other closes, so Fired outrunning wins is expected there.
				<em>Underlay seen / Overlap</em> only count while the overlap check (Settings
				tab, section 4) isn't Off; <em>Overlap</em> = both systems' ads on one pageview.
				Clicks and revenue can't be counted from our side (the creatives are
				cross-origin iframes) — MSA's and Gamma's own dashboards stay the numbers
				that matter for billing.
			</p>
			<details style="max-width:1100px;margin-top:12px">
				<summary style="cursor:pointer"><strong>Last 14 days, day by day — mobile</strong></summary>
				<?php ams_msa_popup_stats_daily_html( $by_day, '' ); ?>
			</details>
			<?php
			if ( $has_desktop ) {
				echo '<details style="max-width:1100px;margin-top:12px"><summary style="cursor:pointer"><strong>Last 14 days, day by day — desktop</strong></summary>';
				ams_msa_popup_stats_daily_html( $by_day, 'd_' );
				echo '</details>';
			}
		}
		?>
		</div>

		<div id="ams-tab-settings">
		<form method="post" action="options.php">
			<?php settings_fields( 'ams_msa_popup' ); ?>

			<h2 class="ams-section">1 &middot; MSA popups</h2>
			<p style="max-width:800px">
				MSA's popup ad — a separate script and zone number per device, all four
				supplied by MSA. When MSA edit a script they bump the <code>?v=</code> in
				its URL: paste the new URL here, nothing to redeploy.
			</p>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">MSA popups</th>
					<td>
						<label>
							<input type="checkbox" id="ams-enabled" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[enabled]" value="1" <?php checked( $o['enabled'] ); ?> />
							Show MSA popup ads on the site
						</label>
						<p class="description">Off = MSA never fires and every pageview goes to Damrei. Whether this plugin serves <em>Damrei's</em> ads is a separate switch (section 3). Greyed-out fields below are inactive while this is off — they still save, nothing is lost by toggling.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-script-url">Mobile popup script</label></th>
					<td>
						<input type="url" id="ams-msa-script-url" class="regular-text code" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[script_url]" value="<?php echo esc_attr( $o['script_url'] ); ?>" />
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-zone">Mobile zone number</label></th>
					<td>
						<input type="text" id="ams-msa-zone" class="small-text" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[zone]" value="<?php echo esc_attr( $o['zone'] ); ?>" />
						<p class="description">Assigned by MSA: 94 = infotainment, 90 = economy.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-desktop-script-url">Desktop popup script</label></th>
					<td>
						<input type="url" id="ams-msa-desktop-script-url" class="regular-text code" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[desktop_script_url]" value="<?php echo esc_attr( $o['desktop_script_url'] ); ?>" />
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-desktop-zone">Desktop zone number</label></th>
					<td>
						<input type="text" id="ams-msa-desktop-zone" class="small-text" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[desktop_zone]" value="<?php echo esc_attr( $o['desktop_zone'] ); ?>" />
						<p class="description">Assigned by MSA: 93 = infotainment, 89 = economy.</p>
					</td>
				</tr>
			</table>

			<h2 class="ams-section">2 &middot; Splitting pageviews between MSA and Damrei</h2>
			<p style="max-width:800px">
				Who shows on each pageview, per device. The first two choices show ONE
				popup per pageview — MSA's or Damrei's, never both; "Show both" runs
				both in sequence, the lead alternating and the second waiting for the
				first to close. The
				decision runs in the visitor's browser (the site is page-cached, so the
				server can't vary per visitor). It only applies while MSA popups
				(section 1) are on — otherwise Damrei simply gets everything.
			</p>
			<table class="form-table" role="presentation">
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-rotation">How to split</label></th>
					<td>
						<select id="ams-msa-rotation" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[rotation]">
							<option value="alternate" <?php selected( $o['rotation'], 'alternate' ); ?>>Take turns — each visitor sees Damrei and MSA alternate, pageview by pageview</option>
							<option value="random" <?php selected( $o['rotation'], 'random' ); ?>>Random draw — every pageview is an independent coin flip at the shares below</option>
							<option value="both" <?php selected( $o['rotation'], 'both' ); ?>>Show both — the pageview gets both popups, one after the other, taking turns going first</option>
						</select>
						<p class="description">Take turns (the default) means no visitor ever hits an unlucky streak of one side. Turns are remembered in the visitor's browser, per device; Damrei goes first. <strong>Show both</strong> keeps that same turn-taking but for who goes FIRST — the second popup waits until the first one is CLOSED (by the reader or its own auto-close), then the breather below, then fires. If the first never shows within 8&nbsp;seconds, the second fires anyway. Both networks see more requests than the one-popup modes and whichever side trails gets seen less — expect their dashboards to move. Needs "Serve Damrei zones" (section 3) on; without it the order can't be controlled. The two settings below apply to this choice only.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-both-scope">Show both on</label></th>
					<td>
						<select id="ams-msa-both-scope" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[both_scope]">
							<option value="first" <?php selected( $o['both_scope'], 'first' ); ?>>The first pageview of each visit — later pageviews take turns, one popup each</option>
							<option value="every" <?php selected( $o['both_scope'], 'every' ); ?>>Every pageview — both popups, every page, the whole visit</option>
						</select>
						<p class="description">Only used while "How to split" is <strong>Show both</strong>. First-pageview (the default) is the audience-friendly cut: the visit opens with both networks served while attention is highest, then readers get the one-per-pageview rhythm — someone reading five articles sees 6 popups instead of 10. A visit = one browser session.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-both-breather">Breather between popups (seconds)</label></th>
					<td>
						<input type="number" id="ams-msa-both-breather" class="small-text" min="0" max="30" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[both_breather]" value="<?php echo esc_attr( $o['both_breather'] ); ?>" />
						<p class="description">Only used while "How to split" is <strong>Show both</strong>: quiet time between the first popup closing and the second appearing. 2 is the sweet spot — 1 feels like an ambush, past 3 just pays reach for no extra calm (the second popup shows to fewer readers the later it fires).</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-mobile-share">Pageview split — mobile</label></th>
					<td>
						MSA <input type="number" id="ams-msa-mobile-share" class="small-text" min="0" max="100" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[mobile_share]" value="<?php echo esc_attr( $o['mobile_share'] ); ?>" />% &mdash; Damrei gets the rest (<?php echo (int) ( 100 - $o['mobile_share'] ); ?>%)
						<p class="description">How mobile pageviews divide between the two networks. 50 = an even split; <strong>0 = MSA's mobile popup off</strong>, every mobile pageview goes to Damrei. With "Take turns" the exact number only matters where a browser blocks storage (it becomes the coin-flip odds there) — 0 still switches MSA off.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-desktop-share">Pageview split — desktop</label></th>
					<td>
						MSA <input type="number" id="ams-msa-desktop-share" class="small-text" min="0" max="100" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[desktop_share]" value="<?php echo esc_attr( $o['desktop_share'] ); ?>" />% &mdash; Damrei gets the rest (<?php echo (int) ( 100 - $o['desktop_share'] ); ?>%)
						<p class="description">Same as above, for desktop pageviews. <strong>0 = MSA's desktop popup off</strong>, desktop belongs to Damrei alone.</p>
					</td>
				</tr>
				<tr data-needs="msa gamma">
					<th scope="row">One winner on desktop</th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[desktop_referee]" value="1" <?php checked( $o['desktop_referee'] ); ?> />
							Never show MSA's desktop popup and Damrei's desktop takeover on the same pageview
						</label>
						<p class="description">Keep this on — the two were seen stacked on top of each other live. Works only while "Serve Damrei zones" (section 3) is on, because the decision rides that script.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row">Backfill empty pageviews</th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[fallback]" value="1" <?php checked( $o['fallback'] ); ?> />
							If the winning side shows no ad, give the other side a late chance
						</label>
						<p class="description">Damrei's pageview still empty ~4.5&nbsp;s in &rarr; MSA fires late. MSA's pageview a confirmed no-show (~12&nbsp;s, retry included) &rarr; Damrei's popup zones get a late request. A pageview only stays blank when both sides declined. Counted as <code>fb_msa</code> / <code>fb_damrei</code> in the stats. Ignored while "How to split" is <strong>Show both</strong> — the other side always runs there anyway.</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-cap-hours">Frequency cap (hours)</label></th>
					<td>
						<input type="number" id="ams-msa-cap-hours" class="small-text" min="0" max="720" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[cap_hours]" value="<?php echo esc_attr( $o['cap_hours'] ); ?>" />
						<p class="description">At most one MSA popup per visitor per this many hours, counting only popups that actually displayed. Both devices share the one cap. <strong>0 = no cap</strong> — the split above is the limiter (the current agreement).</p>
					</td>
				</tr>
			</table>

			<h2 class="ams-section">3 &middot; Damrei (Gamma) zones</h2>
			<p style="max-width:800px">
				This plugin prints Damrei's whole ad stack — the winner decision, Gamma's
				<code>gaxpt.min.js</code> loader and every enabled zone row below —
				replacing the copy that used to be hardcoded in the theme's header.
				<strong>Deploy order on a fresh site:</strong> tick "Serve Damrei zones"
				FIRST, then put the no-Gamma header live, then purge AMS Cache — the other
				order leaves the site ad-dark until the box is ticked. (While plugin and
				old header are both live nothing double-fires: Gamma's library only runs
				the last zone list it was given.)
				<strong style="color:#b32d2e">With the no-Gamma header live — true on both
				our sites — this plugin is the only thing serving Damrei: unticking the box
				below, or deactivating the plugin, turns ALL Damrei ads off site-wide.</strong>
			</p>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">Serve Damrei zones</th>
					<td>
						<label>
							<input type="checkbox" id="ams-gamma-enabled" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[gamma_enabled]" value="1" <?php checked( $o['gamma_enabled'] ); ?> />
							Print the winner decision, Gamma's loader and the zone list below on every page
						</label>
					</td>
				</tr>
			</table>
			<div data-needs="gamma">
			<table class="widefat striped" style="max-width:1100px">
				<thead>
					<tr>
						<th>On</th>
						<th>Name</th>
						<th>Zone ID</th>
						<th>Site ID</th>
						<th>W</th>
						<th>H</th>
						<th>Shows on</th>
						<th>Popup slot</th>
						<th>Make container</th>
						<th>Articles only</th>
						<th>Container ID (blank = automatic)</th>
					</tr>
				</thead>
				<tbody>
					<?php
					$rows = $o['zones'];
					$rows[] = array( 'label' => '', 'zone_id' => '', 'site_id' => '', 'w' => '', 'h' => '', 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'single' => 0, 'code' => '' );
					$rows[] = array( 'label' => '', 'zone_id' => '', 'site_id' => '', 'w' => '', 'h' => '', 'device' => 'all', 'popup' => 0, 'enabled' => 1, 'autodiv' => 0, 'single' => 0, 'code' => '' );
					foreach ( $rows as $i => $z ) {
						$n = esc_attr( AMS_MSA_POPUP_OPTION ) . '[zones][' . (int) $i . ']';
						echo '<tr>';
						echo '<td><input type="checkbox" name="' . $n . '[enabled]" value="1" ' . checked( ! empty( $z['enabled'] ), true, false ) . ' /></td>';
						echo '<td><input type="text" name="' . $n . '[label]" value="' . esc_attr( $z['label'] ) . '" /></td>';
						echo '<td><input type="text" class="small-text" name="' . $n . '[zone_id]" value="' . esc_attr( $z['zone_id'] ) . '" /></td>';
						echo '<td><input type="text" class="small-text" name="' . $n . '[site_id]" value="' . esc_attr( $z['site_id'] ) . '" /></td>';
						echo '<td><input type="number" class="small-text" name="' . $n . '[w]" value="' . esc_attr( $z['w'] ) . '" /></td>';
						echo '<td><input type="number" class="small-text" name="' . $n . '[h]" value="' . esc_attr( $z['h'] ) . '" /></td>';
						echo '<td><select name="' . $n . '[device]">';
						foreach ( array( 'all' => 'All devices', 'mobile' => 'Mobile', 'desktop' => 'Desktop', 'wide' => 'Wide screens (&gt;500px)' ) as $dv => $dl ) {
							echo '<option value="' . esc_attr( $dv ) . '" ' . selected( $z['device'], $dv, false ) . '>' . $dl . '</option>';
						}
						echo '</select></td>';
						echo '<td><input type="checkbox" name="' . $n . '[popup]" value="1" ' . checked( ! empty( $z['popup'] ), true, false ) . ' /></td>';
						echo '<td><input type="checkbox" name="' . $n . '[autodiv]" value="1" ' . checked( ! empty( $z['autodiv'] ), true, false ) . ' /></td>';
						echo '<td><input type="checkbox" name="' . $n . '[single]" value="1" ' . checked( ! empty( $z['single'] ), true, false ) . ' /></td>';
						echo '<td><input type="text" class="regular-text code" name="' . $n . '[code]" value="' . esc_attr( $z['code'] ) . '" placeholder="gax-inpage-async-' . esc_attr( $z['zone_id'] ) . '" /></td>';
						echo '</tr>';
					}
					?>
				</tbody>
			</table>
			<p class="description" style="max-width:1100px">
				Seeded with the nine zones this site's theme used to hardcode. A row needs both
				IDs to be kept — blank rows are dropped, and emptying every row restores the seed.
				<em>Name</em> is a label for this screen only — it is never sent to Gamma; only
				the IDs and sizes matter to ad serving.
				<em>Popup slot</em>: the zone competes for the popup slot shared with MSA, so it
				sits out pageviews MSA wins — per the contract that is ONLY the two PTO takeovers;
				the 640&times;1386 underlays are Damrei's separate always-on product and stay
				unticked. <em>Make container</em>: the plugin creates the zone's div in the
				article body when the page has none — required for the underlays, because Gamma
				silently skips any zone whose div is missing (the reason they never served from
				the theme). <em>Articles only</em>: the zone prints only on single article pages —
				on for the underlays, whose reveal needs an article to scroll through; purge AMS
				Cache after changing it. <em>Wide screens</em> under "Shows on": the row runs only
				when the window is wider than 500&nbsp;px at load — Footer Desktop ships off
				because the theme's copy never actually worked, so turning it on is an ad-ops
				decision, not a default. Damrei's in-video ad is not managed here — it stays in
				the theme.
			</p>
			</div>

			<h2 class="ams-section">4 &middot; Checks &amp; counting</h2>
			<table class="form-table" role="presentation">
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-underlay-mode">Damrei overlap check</label></th>
					<td>
						<select id="ams-msa-underlay-mode" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[underlay_mode]">
							<option value="off" <?php selected( $o['underlay_mode'], 'off' ); ?>>Off</option>
							<option value="log" <?php selected( $o['underlay_mode'], 'log' ); ?>>Watch and count (recommended)</option>
							<option value="suppress" <?php selected( $o['underlay_mode'], 'suppress' ); ?>>Hold MSA back when a Damrei underlay is already showing</option>
						</select>
						<p class="description">
							Watch and count: ~2.5&nbsp;s after load, record whether a Damrei
							underlay/takeover is on screen — feeds the "Underlay seen" and "Overlap"
							stats columns and the browser console, never blocks MSA. Hold back: MSA
							waits for that check and fires only when nothing matched — costs
							~2.5&nbsp;s of MSA viewability and needs the selector list below.
						</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row"><label for="ams-msa-underlay-selectors">Underlay selectors</label></th>
					<td>
						<textarea id="ams-msa-underlay-selectors" class="large-text code" rows="3" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[underlay_selectors]"><?php echo esc_textarea( $o['underlay_selectors'] ); ?></textarea>
						<p class="description">
							How to recognise Damrei's underlay in the page — one CSS selector per line.
							<strong>Not collected yet.</strong> While this is empty and the check above
							is on "Watch and count", the plugin logs candidate elements (large, pinned,
							high z-index) to the browser console as <code>AMS_POP</code>; the recurring
							one that isn't <code>msa-revive-*</code> is the underlay — paste its selector
							here, no redeploy needed. "Hold MSA back" does nothing while this is empty.
						</p>
					</td>
				</tr>
				<tr data-needs="msa">
					<th scope="row">Count activity</th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[stats]" value="1" <?php checked( $o['stats'] ); ?> />
							Feed the stats tables at the top of this screen
						</label>
						<p class="description">One small beacon per pageview at most; daily totals only, nothing stored per visitor. Off = ads keep running, counting stops.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Console logging</th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( AMS_MSA_POPUP_OPTION ); ?>[debug]" value="1" <?php checked( $o['debug'] ); ?> />
							Log every decision to the browser console (<code>AMS_POP</code> = the popups, <code>AMS_ADS</code> = the Damrei stack)
						</label>
						<p class="description">For checking the live site in DevTools; visitors never see anything. Leave off day to day.</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		</div>
		<script id="ams-ads-admin-js">
		/* Grey out fields whose master switch is off. Visual only — greyed inputs
		   still submit, so toggling a master never loses the values under it. */
		(function () {
			var msa = document.getElementById("ams-enabled");
			var gamma = document.getElementById("ams-gamma-enabled");
			function apply() {
				var els = document.querySelectorAll("[data-needs]");
				for (var i = 0; i < els.length; i++) {
					var need = els[i].getAttribute("data-needs");
					var ok = (need.indexOf("msa") === -1 || msa.checked) &&
						(need.indexOf("gamma") === -1 || gamma.checked);
					els[i].classList.toggle("ams-inert", !ok);
				}
			}
			msa.addEventListener("change", apply);
			gamma.addEventListener("change", apply);
			apply();
		})();
		/* Tabs: Settings | Stats. Driven by the URL hash so the browser's own
		   link navigation does the work — #stats shows Stats, anything else
		   shows Settings. A save reloads the page WITHOUT a hash, so it always
		   lands back on Settings with the notices in view. */
		(function () {
			var links = document.querySelectorAll("#ams-tabs .nav-tab");
			function apply() {
				var current = location.hash === "#stats" ? "stats" : "settings";
				for (var i = 0; i < links.length; i++) {
					var tab = links[i].getAttribute("href").slice(1);
					links[i].className = "nav-tab" + (tab === current ? " nav-tab-active" : "");
					document.getElementById("ams-tab-" + tab).style.display = tab === current ? "" : "none";
				}
			}
			window.addEventListener("hashchange", apply);
			apply();
		})();
		</script>
	</div>
	<?php
}

/* ------------------------------------------------------------------------- *
 * Head: the referee + Damrei's zone stack (only when gamma_enabled)
 * ------------------------------------------------------------------------- */

add_action( 'wp_head', 'ams_msa_popup_head', 1 );
function ams_msa_popup_head() {
	$o = ams_msa_popup_settings();
	if ( ! $o['gamma_enabled'] ) {
		return;
	}

	// Referee probabilities per device. MSA popup off => 0 on both, every
	// pageview resolves "damrei" and Damrei's zones always run (the §12
	// rollback rule, automated). Desktop (2.2.0): 0 when the desktop referee
	// is off (old additive behaviour).
	$msa_p_mobile  = $o['enabled'] ? (int) $o['mobile_share'] : 0;
	$msa_p_desktop = ( $o['enabled'] && $o['desktop_referee'] ) ? (int) $o['desktop_share'] : 0;

	$zones = array();
	foreach ( $o['zones'] as $z ) {
		if ( empty( $z['enabled'] ) ) {
			continue;
		}
		// "Articles only" rows exist solely on single posts. Per-URL, so the
		// page cache freezing the answer into each page is correct (a URL
		// either is an article or it isn't, for every visitor).
		if ( ! empty( $z['single'] ) && ! is_single() ) {
			continue;
		}
		$zones[] = array(
			'code'    => '' !== $z['code'] ? $z['code'] : 'gax-inpage-async-' . $z['zone_id'],
			'w'       => (int) $z['w'],
			'h'       => (int) $z['h'],
			'siteId'  => $z['site_id'],
			'zoneId'  => $z['zone_id'],
			'device'  => $z['device'],
			'popup'   => (int) $z['popup'],
			'autodiv' => empty( $z['autodiv'] ) ? 0 : 1,
		);
	}
	?>
<script id="ams-popup-referee">
/* AMS popup referee (v2.0: in the plugin; v2.2: both devices; v2.3: strict
   alternation — README section 12/13). Decides per pageview which popup
   system may fire: MSA's popup, or Damrei's popup-flagged zones — never both
   stacked. "alternate" takes turns per visitor via localStorage (Damrei
   first; storage blocked -> random flip); "random" is the share-% flip;
   "both" (v2.7.0) reuses the alternate turn-taking but the flag means who
   LEADS — the footer fires the other side after the lead closes (v2.8.0;
   scope may limit "both" to the visit's first pageview). A pageview where MSA
   is ineligible (popup disabled, share 0) resolves "damrei" WITHOUT
   consuming a turn. Non-writable so the old theme header's referee (until
   the header swap lands) cannot re-flip it. */
(function () {
	var m = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
	var p = m ? <?php echo (int) $msa_p_mobile; ?> : <?php echo (int) $msa_p_desktop; ?>;
	var alternate = <?php echo in_array( $o['rotation'], array( 'alternate', 'both' ), true ) ? 'true' : 'false'; ?>;
	var w;
	if (p <= 0) {
		w = "damrei";
	} else if (alternate) {
		try {
			var key = m ? "amsPopupTurn_m" : "amsPopupTurn_d";
			w = localStorage.getItem(key) === "msa" ? "msa" : "damrei";
			localStorage.setItem(key, w === "msa" ? "damrei" : "msa");
		} catch (e) {
			w = (Math.random() * 100 < p) ? "msa" : "damrei";
		}
	} else {
		w = (Math.random() * 100 < p) ? "msa" : "damrei";
	}
	try {
		Object.defineProperty(window, "AMS_POPUP_WINNER", { value: w, writable: false, configurable: false });
	} catch (e) {
		window.AMS_POPUP_WINNER = w;
	}
})();
</script>
<script async src="//ssp-cdn.gammaplatform.com/js/gaxpt.min.js"></script>
<script id="ams-gamma-zones">
(function () {
	"use strict";
	var zones = <?php echo wp_json_encode( $zones ); ?>;
	var debug = <?php echo $o['debug'] ? 'true' : 'false'; ?>;
	var isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
	window._ase_region = window._ase_region || "SGP";
	window.gammatag = window.gammatag || {};
	gammatag.cmd = gammatag.cmd || [];
	gammatag.cmd.push(function () {
		function define(z) {
			gammatag.defineZone({
				code: z.code,
				size: [z.w, z.h],
				params: { siteId: z.siteId, zoneId: z.zoneId, zoneType: "Inpage" }
			});
		}
		// gaxpt's defineZone silently DROPS any zone whose container div is not
		// in the DOM (a document.getElementById check). The theme never printed
		// divs for the self-positioning underlays, so they never served — from
		// the theme OR this plugin. "Auto div" rows get their container created
		// here, spread through the content flow so the underlay reveal is
		// something readers actually scroll past. Safe timing: gaxpt runs this
		// callback at window load, so the DOM is complete.
		var autodivsMade = 0;
		function ensureDiv(z) {
			if (!z.autodiv || document.getElementById(z.code)) return;
			var host = document.querySelector(".entry-content") ||
				document.querySelector("#content") ||
				document.querySelector(".site-content") || document.body;
			var d = document.createElement("div");
			d.id = z.code;
			var kids = host.children;
			var at = Math.floor(kids.length * (autodivsMade === 0 ? 0.25 : 0.7));
			host.insertBefore(d, kids[at] || null);
			autodivsMade++;
		}
		var defined = [];
		var wide = [];
		var skipped = [];
		for (var i = 0; i < zones.length; i++) {
			var z = zones[i];
			// Device first, so the referee's skipped[] (= the late-fallback
			// list) only ever holds zones this device could actually serve.
			if (z.device === "mobile" && !isMobile) continue;
			if (z.device === "desktop" && isMobile) continue;
			// Referee: a popup zone is never DEFINED on "msa" pageviews, so no
			// request and no billed impression. Test is !== "msa" (fail-open):
			// a missing flag behaves additively, never blacks out Damrei.
			// In "both" mode the skip still happens when MSA leads — the
			// footer then fires these via AMS_LATE_DAMREI() once MSA's
			// popup has closed (v2.8.0).
			if (z.popup && window.AMS_POPUP_WINNER === "msa") { skipped.push(z); continue; }
			if (z.device === "wide") { wide.push(z); continue; } // needs innerWidth at DOM ready
			ensureDiv(z);
			define(z);
			defined.push(z.code);
		}
		gammatag.sendRequest();

		/* NO GUARD HERE — deliberately. v2.0 through v2.3.0 no-op'd
		   gammatag.defineZone/sendRequest at this point to shield against the
		   old theme header's copy of this stack. But gaxpt serves zones ONE AT
		   A TIME and advances to the next by RE-CALLING the public
		   gammatag.sendRequest() when each injection finishes — the no-op cut
		   delivery to a single zone per pageview (always the last-defined one),
		   which is why Damrei's mobile popup never appeared under v2.x. The
		   shield was also unnecessary: gaxpt's load handler runs only the LAST
		   queued gammatag.cmd callback, so two stacks cannot both fire. */

		// v2.3.0 no-fill fallback, Damrei side: when MSA held the turn but came
		// up empty, the footer calls this to give the skipped Damrei popup
		// zones a late chance. One-shot; undefined when nothing was skipped.
		if (skipped.length) {
			window.AMS_LATE_DAMREI = function () {
				if (!skipped.length) return false;
				for (var i = 0; i < skipped.length; i++) {
					ensureDiv(skipped[i]);
					define(skipped[i]);
					defined.push(skipped[i].code);
				}
				skipped = [];
				gammatag.sendRequest();
				return true;
			};
		}

		if (wide.length) {
			var fireWide = function () {
				if (window.innerWidth <= 500) return;
				for (var i = 0; i < wide.length; i++) {
					ensureDiv(wide[i]);
					define(wide[i]);
					defined.push(wide[i].code);
				}
				gammatag.sendRequest();
			};
			if (document.readyState !== "loading") fireWide();
			else document.addEventListener("DOMContentLoaded", fireWide);
		}
		if (debug) {
			try { console.log("AMS_ADS", { winner: window.AMS_POPUP_WINNER, defined: defined }); } catch (e) {}
		}
	});
})();
</script>
	<?php
}

/* ------------------------------------------------------------------------- *
 * Front end: one <style> + one inline <script> in wp_footer
 * ------------------------------------------------------------------------- */

add_action( 'wp_footer', 'ams_msa_popup_footer', 20 );
function ams_msa_popup_footer() {
	$o = ams_msa_popup_settings();
	if ( ! $o['enabled'] ) {
		return;
	}

	$selectors = array();
	if ( '' !== $o['underlay_selectors'] ) {
		$selectors = preg_split( '/\r\n|\r|\n/', $o['underlay_selectors'] );
	}

	// Containers of Damrei's popup-flagged zones — the no-fill fallback watches
	// these to decide whether Damrei's turn actually produced something.
	// v2.8.2: also the containers of every OTHER enabled zone — the popup
	// visibility scan must IGNORE creatives inside those (the articles-only
	// underlays render full-screen fixed z-99998 clips INSIDE their container
	// and never leave the DOM; counting them as "Damrei's popup" froze the
	// both-mode close-watch on article pages).
	$popup_codes = array();
	$other_codes = array();
	foreach ( $o['zones'] as $z ) {
		if ( empty( $z['enabled'] ) ) {
			continue;
		}
		$code = '' !== $z['code'] ? $z['code'] : 'gax-inpage-async-' . $z['zone_id'];
		if ( ! empty( $z['popup'] ) ) {
			$popup_codes[] = $code;
		} else {
			$other_codes[] = $code;
		}
	}

	$cfg = array(
		'scriptUrl'         => $o['script_url'],
		'zone'              => (string) $o['zone'],
		'desktopScriptUrl'  => $o['desktop_script_url'],
		'desktopZone'       => (string) $o['desktop_zone'],
		'desktopReferee'    => (bool) $o['desktop_referee'],
		'rotation'          => $o['rotation'],
		'bothScope'         => $o['both_scope'],
		'bothBreatherSec'   => (int) $o['both_breather'],
		'fallback'          => (bool) $o['fallback'],
		'damreiPopupCodes'  => $popup_codes,
		'damreiOtherCodes'  => $other_codes,
		'mobileShare'       => (int) $o['mobile_share'],
		'desktopShare'      => (int) $o['desktop_share'],
		'capHours'          => (int) $o['cap_hours'],
		'underlayMode'      => $o['underlay_mode'],
		'underlaySelectors' => array_values( $selectors ),
		'statsUrl'          => $o['stats'] ? esc_url_raw( rest_url( 'ams-msa-popup/v1/e' ) ) : '',
		'debug'             => (bool) $o['debug'],
	);
	?>
<style id="ams-msa-popup-css">
/* The child theme's ads.js scales every Revive iframe to its wrapper width and
   pins the wrapper height. Inside MSA's popup box that shrinks the creative
   (MSA's width/height use !important, its transform doesn't). Undo it there,
   for both MSA id families — mobile and the -pc desktop build. */
#msa-revive-popup-ad .revive-responsive,
#msa-revive-pc-popup-ad .revive-responsive {
	width: 100% !important;
	height: 100% !important;
}
#msa-revive-popup-ad iframe,
#msa-revive-pc-popup-ad iframe {
	transform: none !important;
}
</style>
<script id="ams-msa-popup-js">
(function () {
	"use strict";
	var cfg = <?php echo wp_json_encode( $cfg ); ?>;

	var CAP_KEY = "amsMsaPopupShownAt";
	var DETECT_DELAY_MS = 2500; // Damrei's underlay self-injects after sendRequest(); give it time
	var FILL_POLL_MS = 300;
	var FILL_POLL_MAX_MS = 6000; // MSA's own no-fill timeout is 3500ms
	var CLOSE_POLL_MS = 250;
	var CLOSE_POLL_MAX_MS = 15000; // auto-close fires at ~5s; past 15s stop watching
	var USER_CLOSE_BEFORE_MS = 4600; // gone before this = the reader closed it
	var PV_SAMPLE = 0.1; // pageview counting is sampled; the stats screen scales x10
	var DAMREI_FILL_WAIT_MS = 4500; // Gamma's takeover auction lands ~2-3s in; judge it after this
	// "both" mode sequencing (v2.8.0) — the trailer fires when the LEAD CLOSES:
	var LEAD_POLL_MS = 250;
	var LEAD_NOSHOW_DAMREI_MS = 8000;  // Damrei lead never appeared (auction lands ~2-3s) -> fire the trailer anyway
	var LEAD_NOSHOW_MSA_MS = 13000;    // MSA lead: its no-show is only final after the retry (~12s) -> wait it out
	var LEAD_MAX_WAIT_MS = 30000;      // lead STILL visible past this -> skip the trailer, never stack
	var BOTH_DONE_KEY = "amsMsaBothDone"; // sessionStorage: this visit already had its both-pageview

	function say(payload) {
		try { console.log("AMS_POP", payload); } catch (e) {}
	}

	/* --- stats: count in memory, send one beacon on page-leave ------------ */
	var stats = {};
	var sawFill = false;
	var sawUnderlay = false;
	var overlapCounted = false;
	var damreiShown = false;    // v2.9.0: Damrei's popup appeared this pageview
	var outcomeCounted = false; // v2.9.0: the pageview-outcome event went out

	// The theme's own mobile test, reused verbatim so plugin and theme agree.
	var isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);

	function bump(k) {
		if (cfg.statsUrl) stats[k] = (stats[k] || 0) + 1;
	}

	// Popup events split per device: bare = mobile popup, d_ = desktop popup.
	function bumpP(k) {
		bump(isMobile ? k : "d_" + k);
	}

	function flush() {
		if (!cfg.statsUrl || !navigator.sendBeacon) return;
		if (sawFill && sawUnderlay && !overlapCounted) {
			overlapCounted = true;
			bumpP("overlap");
		}
		// v2.9.0: what did this pageview actually deliver? Judged here, at
		// page-leave — a reader who moves on before a popup's moment honestly
		// counts as not having seen it.
		if (!outcomeCounted) {
			outcomeCounted = true;
			bumpP(sawFill ? (damreiShown ? "both" : "only_msa") : (damreiShown ? "only_damrei" : "blank"));
		}
		var any = false;
		for (var k in stats) { any = true; break; }
		if (!any) return;
		var payload = JSON.stringify({ e: stats });
		stats = {}; // deltas only: if the tab comes back and more happens, a second beacon carries just that
		try { navigator.sendBeacon(cfg.statsUrl, payload); } catch (e) {}
	}
	window.addEventListener("pagehide", flush);
	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState === "hidden") flush();
	});

	/* --- the decision ----------------------------------------------------- */

	if (Math.random() < PV_SAMPLE) bump(isMobile ? "pv_m" : "pv_d");

	// Mobile: the referee flag IS the roll when present (set by this plugin's
	// head script since v2.0, or by the old theme header until it's swapped) —
	// obey it or the two systems disagree. Missing flag -> our own additive
	// roll, so neither deploy order goes dark.
	// Desktop: with the desktop referee ON (2.2.0 default) the flag decides
	// here too — the head already skipped Damrei's PTO on "msa" pageviews, so
	// disobeying it would either stack the popups or blank the pageview. With
	// it off, or no flag at all, the old additive scope+share roll applies.
	var referee = typeof window.AMS_POPUP_WINNER === "string" ? window.AMS_POPUP_WINNER : "";
	// v2.7.0 "both" mode: the flag means who LEADS, not the only winner —
	// the trailing side fires once the lead has closed (v2.8.0). Without a
	// referee flag (gamma serving off / old header) sequencing is impossible
	// and the legacy additive behaviour applies unchanged.
	var bothMode = cfg.rotation === "both";
	// v2.8.0 'first' scope: only the visit's first pageview gets the both
	// treatment; after that this pageview behaves exactly like "Take turns"
	// (bothMode false re-arms the fb_* backfill paths below). The marker is
	// only consumed when sequencing can actually run (referee flag present).
	// Storage blocked -> can't tell first from later -> stays 'both'.
	if (bothMode && cfg.bothScope === "first") {
		try {
			if (sessionStorage.getItem(BOTH_DONE_KEY)) {
				bothMode = false;
			} else if (typeof window.AMS_POPUP_WINNER === "string") {
				sessionStorage.setItem(BOTH_DONE_KEY, "1");
			}
		} catch (e) {}
	}
	var roll = Math.random();
	var winner = "none";
	if (isMobile) {
		if (referee) {
			winner = referee === "msa" ? "msa" : "none";
		} else {
			winner = roll * 100 < cfg.mobileShare ? "msa" : "none";
		}
	} else if (referee && cfg.desktopReferee) {
		winner = referee === "msa" ? "msa" : "none";
	} else {
		winner = roll * 100 < cfg.desktopShare ? "msa" : "none";
	}
	if (winner === "msa") bumpP("win");

	var capped = false;
	if (cfg.capHours > 0) {
		try {
			var last = parseInt(localStorage.getItem(CAP_KEY), 10);
			if (last && Date.now() - last < cfg.capHours * 3600000) capped = true;
		} catch (e) {} // localStorage blocked -> uncapped, matches MSA's own behaviour
	}
	if (winner === "msa" && capped) bumpP("capped");

	// Selector-based check once a signature is configured in Settings -> AMS Ads.
	function findUnderlay() {
		for (var i = 0; i < cfg.underlaySelectors.length; i++) {
			var el = null;
			try { el = document.querySelector(cfg.underlaySelectors[i]); } catch (e) {}
			if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
				return { found: true, configured: true, match: cfg.underlaySelectors[i] };
			}
		}
		return { found: false, configured: cfg.underlaySelectors.length > 0 };
	}

	// Signature collector: big fixed/absolute high-z elements that are not ours.
	// Runs in log-only mode while no signature is configured.
	// v2.8.2: skipNonPopupZones=true additionally ignores anything living
	// inside a non-popup zone's container — the always-on underlays render
	// full-screen fixed clips INSIDE their container and never close, so the
	// POPUP-visibility check must not see them. The underlay-check logging
	// call stays unfiltered: underlay candidates are its whole point.
	var otherZoneSel = cfg.damreiOtherCodes.map(function (c) { return "#" + c; }).join(", ");
	function scanCandidates(skipNonPopupZones) {
		var out = [];
		var all = document.querySelectorAll("body *");
		for (var i = 0; i < all.length; i++) {
			var el = all[i];
			if (el.id && el.id.indexOf("msa-revive") === 0) continue;
			if (el.closest && el.closest("#msa-revive-popup-overlay, #msa-revive-pc-popup-overlay")) continue;
			if (skipNonPopupZones && otherZoneSel && el.closest && el.closest(otherZoneSel)) continue;
			var s;
			try { s = getComputedStyle(el); } catch (e) { continue; }
			if ((s.position === "fixed" || s.position === "absolute") && +s.zIndex > 999 &&
					el.offsetWidth > 200 && el.offsetHeight > 200) {
				out.push({
					tag: el.tagName,
					id: el.id,
					cls: ("" + el.className).slice(0, 120),
					z: s.zIndex,
					w: el.offsetWidth,
					h: el.offsetHeight
				});
			}
		}
		return out;
	}

	// Did Damrei's turn actually produce a popup? True when any popup-flagged
	// zone's container holds a RENDERED creative, or the big-overlay scan finds
	// a takeover. v2.8.1: the container test must measure creative CHILDREN,
	// not the container — probed live 2026-08-16, the PTO container holds three
	// <script> tags in a 0-wide/10480-tall box from page load on, ad or no ad
	// (the takeover itself renders in a separate anonymous overlay div), so the
	// old childElementCount>0 && offsetHeight>50 test was ALWAYS true here: the
	// v2.8.0 close-watch never saw Damrei "close" (trailer skipped at 30s) and
	// the v2.3.0 fb_msa judgement could never call Damrei empty.
	function damreiPopupVisible() {
		for (var i = 0; i < cfg.damreiPopupCodes.length; i++) {
			var el = document.getElementById(cfg.damreiPopupCodes[i]);
			if (!el) continue;
			for (var j = 0; j < el.children.length; j++) {
				var kid = el.children[j];
				if (/^(SCRIPT|STYLE|NOSCRIPT|LINK)$/.test(kid.tagName)) continue;
				if (kid.offsetWidth > 10 && kid.offsetHeight > 10) return true;
			}
		}
		return scanCandidates(true).length > 0;
	}

	/* --- v2.9.0: Damrei's side of the ledger ------------------------------ */
	// Only meaningful while this plugin serves Damrei's zones (a referee flag
	// exists exactly then). dam_win mirrors MSA's "win"; dam_fired counts the
	// pageviews where Damrei's popup zones were actually requested (defined in
	// the head, or defined late by backfill / the "Show both" trailer);
	// dam_shown = its popup really appeared (same detection the sequencing
	// uses). Clicks/revenue stay unknowable from our side, as with MSA.
	var damreiFiredCounted = false;
	function countDamreiFired() {
		if (damreiFiredCounted) return;
		damreiFiredCounted = true;
		bumpP("dam_fired");
	}
	if (referee === "damrei") bumpP("dam_win");
	if (referee && referee !== "msa" && cfg.damreiPopupCodes.length) {
		countDamreiFired(); // the head defined the popup zones for this pageview
	}
	if (referee && cfg.damreiPopupCodes.length) {
		var dsWaited = 0;
		var dsT = setInterval(function () {
			dsWaited += 500;
			if (damreiPopupVisible()) {
				clearInterval(dsT);
				damreiShown = true;
				bumpP("dam_shown");
			} else if (dsWaited >= 20000) {
				clearInterval(dsT); // covers late defines: trailer/backfill land well before 20s
			}
		}, 500);
	}

	// MSA's script self-destructs 3.5s after it runs; every network hop inside
	// that window counts. Fetching the Revive loader in parallel with MSA's own
	// script (instead of letting MSA request it afterwards) removes a whole
	// sequential fetch from that budget. MSA's loadRevive() sees our copy
	// (script[src^=...]) and skips adding a second one; if MSA ever moves ad
	// servers this preload becomes a harmless extra fetch and their script
	// loads its own.
	var REVIVE_LOADER_URL = "https://sknteam.com/www/delivery/asyncjs.php";
	var retried = false;

	// v2.0: per-device MSA build — mobile zone 94, desktop the -pc build/zone 89.
	var msaUrl = isMobile ? cfg.scriptUrl : cfg.desktopScriptUrl;
	var msaZone = isMobile ? cfg.zone : cfg.desktopZone;

	function injectMsa() {
		var s = document.createElement("script");
		s.defer = true;
		s.src = msaUrl;
		s.setAttribute("data-zone", msaZone);
		document.body.appendChild(s);
		kickstartRevive();
		watchForFill();
	}

	function fire() {
		if (!document.querySelector('script[src^="' + REVIVE_LOADER_URL + '"]')) {
			var l = document.createElement("script");
			l.async = true;
			l.src = REVIVE_LOADER_URL;
			document.body.appendChild(l);
		}
		bumpP("fired");
		injectMsa();
	}

	// MSA's 3.5s deadline can't be raised from outside — but their cleanup
	// resets the guard flag, so the script can legally run again. A second
	// attempt starts with everything cached (MSA script, Revive loader already
	// registered, creative often cached too) and our kickstart fires the ad
	// request immediately, so it nearly always beats the 3.5s.
	function retryOnce() {
		if (retried) return false;
		retried = true;
		bumpP("retry");
		if (cfg.debug) say({ event: "retry" });
		injectMsa();
		return true;
	}

	// THE 0%-FILL FIX (v1.2.1). Revive's async loader (sknteam) only scans for
	// <ins> slots immediately when document.readyState is "complete"; otherwise
	// it waits for DOMContentLoaded (already gone by the time we inject) or
	// window load (many seconds away on this ad-heavy page) — and MSA's script
	// gives up after 3.5s, so the popup never showed. MSA's own rescan fallback
	// (reviveAsync.push) is broken — reviveAsync is an object, push throws. So
	// once the loader has registered, we trigger its scan ourselves:
	// ra.apply(ra.detect()) is exactly what its own refresh event does. Safe on
	// both sides: detect() marks the <ins> data-revive-loaded and skips marked
	// ones, so loader-initiated and our scan can never double-request. The
	// revive-id is read off MSA's own <ins>, nothing hardcoded.
	function kickstartRevive() {
		var waited = 0;
		var t = setInterval(function () {
			waited += 200;
			var ins = document.querySelector("#msa-revive-popup-ad ins[data-revive-id], #msa-revive-pc-popup-ad ins[data-revive-id]");
			if (!ins) {
				if (waited >= 6000) clearInterval(t); // popup gone or never built
				return;
			}
			if (ins.getAttribute("data-revive-loaded")) {
				clearInterval(t); // the loader's own scan got there first — done
				return;
			}
			var id = ins.getAttribute("data-revive-id");
			var ra = window.reviveAsync && window.reviveAsync[id];
			if (ra && typeof ra.detect === "function" && typeof ra.apply === "function") {
				clearInterval(t);
				try {
					ra.apply(ra.detect());
					if (cfg.debug) say({ event: "revive-kickstart", reviveId: id });
				} catch (e) {
					if (cfg.debug) say({ event: "revive-kickstart-failed", error: String(e) });
				}
			} else if (waited >= 6000) {
				clearInterval(t); // loader never arrived; MSA's no-fill cleanup handles the rest
			}
		}, 200);
	}

	// Watch for the popup actually filling (Revive injects an iframe into the ad
	// box). Fill is when the frequency cap gets stamped — no-fill pageviews don't
	// burn the window — and when the close-watcher starts.
	function watchForFill() {
		var waited = 0;
		var t = setInterval(function () {
			waited += FILL_POLL_MS;
			var filled = document.querySelector("#msa-revive-popup-ad iframe, #msa-revive-pc-popup-ad iframe");
			if (filled) {
				clearInterval(t);
				sawFill = true;
				bumpP("filled");
				if (cfg.capHours > 0) {
					try { localStorage.setItem(CAP_KEY, String(Date.now())); } catch (e) {}
				}
				if (cfg.debug) say({ event: "filled", capHours: cfg.capHours });
				watchForClose(Date.now());
			} else if (waited >= FILL_POLL_MAX_MS) {
				clearInterval(t);
				if (!retryOnce()) {
					bumpP("nofill");
					if (cfg.debug) say({ event: "no-fill" });
					// v2.3.0: MSA's turn is a bust — hand the pageview to the
					// Damrei popup zones the head skipped (one-shot, only
					// exists when something was actually skipped). Not in
					// "both" mode: Damrei already fired at +3s there.
					if (cfg.fallback && !bothMode && typeof window.AMS_LATE_DAMREI === "function") {
						bumpP("fb_damrei");
						countDamreiFired();
						if (cfg.debug) say({ event: "fallback-damrei" });
						try { window.AMS_LATE_DAMREI(); } catch (e) {}
					}
				}
			}
		}, FILL_POLL_MS);
	}

	// The overlay disappearing well before MSA's auto-close means the reader
	// closed it (x or Esc) — a rough but honest annoyance signal.
	function watchForClose(fillTime) {
		var t = setInterval(function () {
			var overlay = document.getElementById("msa-revive-popup-overlay") ||
				document.getElementById("msa-revive-pc-popup-overlay");
			if (!overlay) {
				clearInterval(t);
				var shownFor = Date.now() - fillTime;
				bumpP(shownFor < USER_CLOSE_BEFORE_MS ? "close_user" : "close_auto");
				if (cfg.debug) say({ event: "closed", after_ms: shownFor });
			} else if (Date.now() - fillTime >= CLOSE_POLL_MAX_MS) {
				clearInterval(t);
			}
		}, CLOSE_POLL_MS);
	}

	// Log-only mode always logs its check (that is the mode's whole purpose:
	// measuring the real Damrei/MSA overlap rate), debug on or off. Runs on
	// BOTH devices since v2.0 — desktop sightings land in the d_ counters, the
	// pre-referee homework for Damrei's PTO Desktop (README section 13.5).
	function scheduleUnderlayLog() {
		if (cfg.underlayMode !== "log") return;
		setTimeout(function () {
			var u = findUnderlay();
			if (u.found) { sawUnderlay = true; bumpP("underlay"); }
			var payload = { event: "underlay-check", configured: u.configured, found: u.found };
			if (u.match) payload.match = u.match;
			if (!u.configured) payload.candidates = scanCandidates();
			say(payload);
		}, DETECT_DELAY_MS);
	}

	function sayDecision(underlay) {
		say({ isMobile: isMobile, referee: referee || "none", roll: +roll.toFixed(2), winner: winner, capped: capped, underlay: underlay });
	}

	if (cfg.underlayMode === "suppress" && winner === "msa" && !capped) {
		setTimeout(function () {
			var u = findUnderlay();
			if (u.found) { sawUnderlay = true; bumpP("underlay"); bumpP("suppressed"); }
			if (cfg.debug) sayDecision(u.found);
			if (!u.found) fire();
		}, DETECT_DELAY_MS);
	} else {
		if (cfg.debug) sayDecision(false);
		if (winner === "msa" && !capped) fire();
		scheduleUnderlayLog();
	}

	var msaEligible = isMobile ? cfg.mobileShare > 0 : (cfg.desktopReferee && cfg.desktopShare > 0);

	// v2.8.0 "both": the trailer fires when the LEAD CLOSES, not on a clock.
	// v2.7.0's fixed +3s from page load overlapped in BOTH orders on the live
	// site (Damrei needs ~2.8s of auction before appearing; both popups
	// auto-close only at ~5-6s). Phase 1: wait for the lead to APPEAR — never
	// by noShowMs means its network declined, fire the trailer so the
	// pageview isn't wasted (noShowMs is per lead: MSA's verdict is only
	// final after its retry). Phase 2: wait for it to DISAPPEAR (reader X or
	// auto-close), breathe cfg.bothBreatherSec, fire. A lead still up past
	// LEAD_MAX_WAIT_MS (reader interacting / something wedged) skips the
	// trailer entirely — stacking is the one outcome this exists to prevent.
	function waitLeadThenFire(leadVisible, noShowMs, fireTrailer) {
		var waited = 0;
		var t = setInterval(function () {
			waited += LEAD_POLL_MS;
			if (leadVisible()) {
				clearInterval(t);
				var shown = setInterval(function () {
					waited += LEAD_POLL_MS;
					if (!leadVisible()) {
						clearInterval(shown);
						setTimeout(function () { fireTrailer(true); }, cfg.bothBreatherSec * 1000);
					} else if (waited >= LEAD_MAX_WAIT_MS) {
						clearInterval(shown);
						if (cfg.debug) say({ event: "second-skipped", reason: "lead-still-open" });
					}
				}, LEAD_POLL_MS);
			} else if (waited >= noShowMs) {
				clearInterval(t);
				fireTrailer(false);
			}
		}, LEAD_POLL_MS);
	}

	if (bothMode && referee) {
		if (referee === "damrei" && msaEligible && !capped) {
			// Damrei led (its zones are in the head as usual) -> MSA trails
			// once Damrei's popup has been and gone.
			waitLeadThenFire(damreiPopupVisible, LEAD_NOSHOW_DAMREI_MS, function (leadSeen) {
				if (cfg.debug) say({ event: "second-msa", leadSeen: leadSeen });
				fire();
			});
		} else if (referee === "msa") {
			// MSA led (the head skipped Damrei's popup zones as usual) ->
			// Damrei trails via the same late-define hook backfill uses.
			// gaxpt creates that hook at window load, which can lag on a
			// slow page — poll for it rather than give up.
			var msaOverlayVisible = function () {
				var ov = document.getElementById("msa-revive-popup-overlay") ||
					document.getElementById("msa-revive-pc-popup-overlay");
				return !!ov && ov.offsetWidth > 0 && ov.offsetHeight > 0;
			};
			waitLeadThenFire(msaOverlayVisible, LEAD_NOSHOW_MSA_MS, function (leadSeen) {
				var lateWaited = 0;
				(function trailDamrei() {
					if (typeof window.AMS_LATE_DAMREI === "function") {
						if (cfg.debug) say({ event: "second-damrei", leadSeen: leadSeen });
						countDamreiFired();
						try { window.AMS_LATE_DAMREI(); } catch (e) {}
					} else if (lateWaited < 12000) {
						lateWaited += 500;
						setTimeout(trailDamrei, 500);
					}
				})();
			});
		}
	} else if (cfg.fallback && !bothMode && referee === "damrei" && msaEligible && !capped) {
		// v2.3.0: Damrei held the turn but its popup shows nothing by the
		// check (Gamma declined the request or capped this visitor) -> MSA
		// takes the pageview late instead of it going blank. Only on
		// refereed pageviews where MSA was actually eligible, and never
		// over a rendered takeover.
		setTimeout(function () {
			if (damreiPopupVisible()) return;
			bumpP("fb_msa");
			if (cfg.debug) say({ event: "fallback-msa" });
			fire();
		}, DAMREI_FILL_WAIT_MS);
	}
})();
</script>
	<?php
}
