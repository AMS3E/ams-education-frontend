<?php
/**
 * Deleting the plugin removes its options and its one stats table. The
 * visitor-side frequency-cap timestamp lives in each visitor's localStorage
 * and simply stops being read.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'ams_msa_popup_settings' );
delete_option( 'ams_msa_popup_db' );
delete_option( 'ams_msa_popup_version' );

global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}ams_msa_popup_stats`" );
