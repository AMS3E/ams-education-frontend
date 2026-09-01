<?php
/**
 * Plugin Name: AMS Fast Read API
 * Description: SHORTINIT direct-SQL read path for the AMS admin dashboard. Serves
 *              the same data as WP REST at ~1/13th the cost by skipping the
 *              plugin/theme/hook/REST boot. INSTALL BUT DO NOT ACTIVATE.
 * Version:     1.8.5
 * Author:      Soth Kimleng
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS DELIBERATELY INERT. Do not activate this plugin.
 * ---------------------------------------------------------------------------
 *
 * The working code is the sibling file `fast.php`, which is reached DIRECTLY
 * over HTTP and never passes through WordPress's plugin/theme/REST stack:
 *
 *   https://<site>/wp-content/plugins/ams-fast-api/fast.php
 *
 * Activating this plugin would add it to the 63 plugins whose boot is the very
 * cost we are bypassing. Installing it only puts the files on disk, which is
 * all `fast.php` needs — so a DEACTIVATED install costs every other request on
 * the site exactly zero.
 *
 * WHY A SEPARATE PLUGIN INSTEAD OF A FILE INSIDE ams-frontend-api:
 * the read path is new and unproven, and ams-frontend-api is load-bearing for
 * the entire public site. Shipping this separately means installing, updating
 * or deleting it cannot touch the live plugin. Once the fast path is proven end
 * to end (and the admin depends on it), fold `fast.php` into ams-frontend-api
 * so the two can never drift apart in deployment — the SQL below reads exactly
 * the meta keys ams-frontend-api's writes produce.
 *
 * SECURITY MODEL, in one paragraph: `fast.php` accepts the same per-user
 * X-AMS-Token that ams-frontend-api mints, verifies its HMAC against the same
 * derived key, loads that user's capabilities out of the database, and scopes
 * every query to what WordPress itself would let that user read. It is
 * read-only: every statement it runs is a SELECT.
 *
 * TO REMOVE: wp-admin -> Plugins -> Delete. Nothing else references it.
 */

// Intentionally does nothing when loaded by WordPress.
