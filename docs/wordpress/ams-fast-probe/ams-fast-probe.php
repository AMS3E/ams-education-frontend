<?php
/**
 * Plugin Name: AMS Fast Probe (TEMPORARY DIAGNOSTIC)
 * Description: Ships a SHORTINIT endpoint (fast.php) that answers real queries
 *              WITHOUT booting plugins/theme/hooks, to measure what a direct
 *              read path would cost. INSTALL BUT DO NOT ACTIVATE.
 * Version:     1.0
 * Author:      Soth Kimleng
 *
 * This file is deliberately inert. The whole point of the probe is the sibling
 * file fast.php, which is reached DIRECTLY over HTTP and never goes through
 * WordPress's plugin/theme/REST stack at all:
 *
 *   https://<site>/wp-content/plugins/ams-fast-probe/fast.php?k=3beec66aa4ce417392
 *
 * You do NOT need to activate this plugin — installing it just puts the files
 * on disk. Leaving it deactivated means it adds exactly zero cost to every
 * other request on the site.
 */

// Intentionally does nothing when loaded by WordPress.
