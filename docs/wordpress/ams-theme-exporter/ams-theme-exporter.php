<?php
/**
 * Plugin Name: AMS Theme Exporter
 * Description: Tools -> Theme Exporter. Downloads any installed theme as a zip,
 *              byte-for-byte, straight from the server. Read-only: it never
 *              writes to the theme, the database, or anywhere else.
 * Version:     1.0.0
 * Author:      Soth Kimleng
 *
 * ---------------------------------------------------------------------------
 * WHY: the host bans file editing from WordPress and we have no aaPanel, so
 * the only sanctioned write path is the zip installer (Plugins/Themes ->
 * Upload). "Replace active with uploaded" (WP 5.5+) swaps the WHOLE theme
 * directory, so before we can ship an edited vodi-child we need an exact copy
 * of what is live NOW - every template, functions.php, ads.js, assets, all of
 * it. This plugin is that copy machine, and the exported zip doubles as the
 * rollback (re-upload it untouched to restore the theme exactly).
 *
 * It stays installed as a reference tool (user decision 2026-08-12): the
 * screen also shows each theme's file count, size and newest-modified file,
 * which is a cheap drift check before any future replace.
 *
 * HOW: admin-post.php action, manage_options + nonce. Zips with ZipArchive
 * (PclZip fallback - WP bundles it), entry names forward-slashed under one
 * top-level "<slug>/" folder so the zip re-uploads cleanly. Streams the file
 * and deletes the temp copy. No options, no tables; deleting the plugin
 * leaves zero residue.
 *
 * The full design record lives in the frontend repo, docs/wp-ads/README.md.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_menu', function () {
	add_management_page(
		'Theme Exporter',
		'Theme Exporter',
		'manage_options',
		'ams-theme-exporter',
		'ams_theme_exporter_render_page'
	);
} );

/**
 * One pass over a theme directory: file count, total bytes, and the
 * newest-modified file (path + mtime). The newest file is the drift
 * indicator - if it's newer than our last export, the live theme changed.
 */
function ams_theme_exporter_scan( $dir ) {
	$stats = array( 'files' => 0, 'bytes' => 0, 'newest_file' => '', 'newest_mtime' => 0 );
	if ( ! is_dir( $dir ) ) {
		return $stats;
	}
	$iter = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ),
		RecursiveIteratorIterator::LEAVES_ONLY
	);
	foreach ( $iter as $file ) {
		if ( ! $file->isFile() ) {
			continue;
		}
		$stats['files']++;
		$stats['bytes'] += $file->getSize();
		$mtime           = $file->getMTime();
		if ( $mtime > $stats['newest_mtime'] ) {
			$stats['newest_mtime'] = $mtime;
			$stats['newest_file']  = ltrim( str_replace( '\\', '/', substr( $file->getPathname(), strlen( $dir ) ) ), '/' );
		}
	}
	return $stats;
}

function ams_theme_exporter_render_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Insufficient permissions.' );
	}
	$active = get_stylesheet();
	$parent = get_template();
	echo '<div class="wrap"><h1>Theme Exporter</h1>';
	echo '<p>Downloads a theme directory as a zip, exactly as it sits on the server. ';
	echo 'The zip re-uploads via <strong>Appearance &rarr; Themes &rarr; Add New &rarr; Upload</strong> ';
	echo '("Replace active with uploaded"), so an untouched export is also the rollback.</p>';
	echo '<table class="widefat striped" style="max-width:1100px">';
	echo '<thead><tr><th>Theme</th><th>Version</th><th>Status</th><th style="text-align:right">Files</th><th style="text-align:right">Size</th><th>Newest file (drift check)</th><th></th></tr></thead><tbody>';

	foreach ( wp_get_themes() as $slug => $theme ) {
		$scan = ams_theme_exporter_scan( $theme->get_stylesheet_directory() );
		if ( $slug === $active ) {
			$status = '<strong>Active</strong>';
		} elseif ( $slug === $parent ) {
			$status = 'Parent of active';
		} else {
			$status = 'Inactive';
		}
		$newest = '&mdash;';
		if ( $scan['newest_mtime'] ) {
			$newest = esc_html( $scan['newest_file'] ) . '<br><span style="color:#666">'
				. esc_html( wp_date( 'Y-m-d H:i', $scan['newest_mtime'] ) ) . '</span>';
		}
		$url = wp_nonce_url(
			admin_url( 'admin-post.php?action=ams_theme_export&theme=' . rawurlencode( $slug ) ),
			'ams_theme_export_' . $slug
		);
		echo '<tr>';
		echo '<td><strong>' . esc_html( $theme->get( 'Name' ) ) . '</strong><br><code>' . esc_html( $slug ) . '</code></td>';
		echo '<td>' . esc_html( $theme->get( 'Version' ) ) . '</td>';
		echo '<td>' . $status . '</td>';
		echo '<td style="text-align:right">' . esc_html( number_format_i18n( $scan['files'] ) ) . '</td>';
		echo '<td style="text-align:right">' . esc_html( size_format( $scan['bytes'] ) ) . '</td>';
		echo '<td>' . $newest . '</td>';
		echo '<td><a class="button button-primary" href="' . esc_url( $url ) . '">Download zip</a></td>';
		echo '</tr>';
	}
	echo '</tbody></table>';
	echo '<p style="color:#666;max-width:1100px">Read-only. Nothing on this screen or behind the download button writes to the server '
		. '(the zip is built in the system temp dir and deleted after streaming).</p>';
	echo '</div>';
}

add_action( 'admin_post_ams_theme_export', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Insufficient permissions.' );
	}
	$slug = isset( $_GET['theme'] ) ? sanitize_text_field( wp_unslash( $_GET['theme'] ) ) : '';
	check_admin_referer( 'ams_theme_export_' . $slug );

	$theme = wp_get_theme( $slug );
	if ( ! $theme->exists() ) {
		wp_die( 'No such theme: ' . esc_html( $slug ) );
	}
	$root = wp_normalize_path( $theme->get_stylesheet_directory() );
	if ( ! is_dir( $root ) ) {
		wp_die( 'Theme directory not found.' );
	}

	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( 300 );
	}

	$zip_path = wp_normalize_path( get_temp_dir() ) . $slug . '-export-' . gmdate( 'Ymd-His' ) . '.zip';
	$ok       = class_exists( 'ZipArchive' )
		? ams_theme_exporter_zip_ziparchive( $root, $slug, $zip_path )
		: ams_theme_exporter_zip_pclzip( $root, $zip_path );

	if ( ! $ok || ! file_exists( $zip_path ) ) {
		wp_die( 'Failed to build the zip (ZipArchive ' . ( class_exists( 'ZipArchive' ) ? 'present' : 'MISSING, PclZip fallback used' ) . ').' );
	}

	nocache_headers();
	header( 'Content-Type: application/zip' );
	header( 'Content-Disposition: attachment; filename="' . basename( $zip_path ) . '"' );
	header( 'Content-Length: ' . filesize( $zip_path ) );

	// Stream in chunks; readfile() can spike memory behind some output buffers.
	$fh = fopen( $zip_path, 'rb' );
	if ( $fh ) {
		while ( ! feof( $fh ) ) {
			echo fread( $fh, 1024 * 1024 ); // phpcs:ignore WordPress.Security.EscapeOutput
			flush();
		}
		fclose( $fh );
	}
	unlink( $zip_path );
	exit;
} );

/**
 * Entry names are written by hand with forward slashes under "<slug>/" -
 * same rule as our plugin build script; WordPress's installer rejects
 * backslash entry names and expects one top-level folder.
 */
function ams_theme_exporter_zip_ziparchive( $root, $slug, $zip_path ) {
	$zip = new ZipArchive();
	if ( true !== $zip->open( $zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
		return false;
	}
	$iter = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ),
		RecursiveIteratorIterator::LEAVES_ONLY
	);
	foreach ( $iter as $file ) {
		if ( ! $file->isFile() ) {
			continue;
		}
		$abs   = wp_normalize_path( $file->getPathname() );
		$entry = $slug . '/' . ltrim( substr( $abs, strlen( $root ) ), '/' );
		if ( ! $zip->addFile( $file->getPathname(), $entry ) ) {
			$zip->close();
			return false;
		}
	}
	return $zip->close();
}

function ams_theme_exporter_zip_pclzip( $root, $zip_path ) {
	if ( ! class_exists( 'PclZip' ) ) {
		require_once ABSPATH . 'wp-admin/includes/class-pclzip.php';
	}
	$zip = new PclZip( $zip_path );
	// Stripping dirname($root) leaves entries rooted at "<slug>/..." .
	$res = $zip->create( $root, PCLZIP_OPT_REMOVE_PATH, dirname( $root ) );
	return 0 !== $res;
}
