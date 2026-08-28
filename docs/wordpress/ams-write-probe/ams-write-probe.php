<?php
/**
 * Plugin Name: AMS Write Probe (TEMPORARY DIAGNOSTIC)
 * Description: Ships write.php, hit directly over HTTP, which answers what a
 *              post write actually costs and WHICH plugins charge for it.
 *              INSTALL BUT DO NOT ACTIVATE.
 * Version:     1.1
 * Author:      Soth Kimleng
 *
 * Deliberately inert, exactly like ams-fast-probe: the point is the sibling
 * file, reached directly over HTTP.
 *
 *   PHASE A — read-only, names every callback on the write hooks and the plugin
 *   file each one lives in:
 *     https://<site>/wp-content/plugins/ams-write-probe/write.php?k=<token>
 *
 *   PHASE B — timed writes, DRAFTS ONLY, hard-deleted before it answers:
 *     https://<site>/wp-content/plugins/ams-write-probe/write.php?k=<token>&write=1
 *
 * You do NOT need to activate this plugin. Installing it puts the files on
 * disk; leaving it deactivated means it costs every other request nothing.
 */

// Intentionally does nothing when loaded by WordPress.
