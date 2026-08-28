<?php
/**
 * SHORTINIT read-path probe.
 *
 * Answers the question: what does reading AMS data actually cost if we skip
 * WordPress's plugin/theme/hook/REST boot entirely?
 *
 * Measured baseline to beat: ~3,900 ms for any REST call (see ams-boot-timer).
 * Of that, ~1,200 ms is loading 60 plugin files and ~2,000 ms is running their
 * hooks. SHORTINIT skips both: it loads WordPress's DB layer and stops.
 *
 * This file is hit DIRECTLY, not through WordPress routing:
 *   /wp-content/plugins/ams-fast-probe/fast.php?k=<token>
 *
 * READ-ONLY. Every statement below is a SELECT.
 *
 * It reports three things:
 *   1. Timing — boot vs. each query, against the same REQUEST_TIME_FLOAT basis
 *      the boot timer used, so the numbers are directly comparable.
 *   2. Real rows, to prove the data is genuinely there and correct.
 *   3. A capability map — which WordPress helpers survive SHORTINIT. That is
 *      what a real implementation would be built on, so it is worth knowing
 *      before committing to the approach rather than after.
 */

$AMS_TOKEN = '3beec66aa4ce417392';

/** wp_list_pluck() is not loaded under SHORTINIT. */
function ams_pluck_ids( $rows ) {
	$ids = array();
	foreach ( (array) $rows as $r ) {
		$ids[] = (int) $r->ID;
	}
	return $ids ? $ids : array( 0 );
}

/** mbstring is not guaranteed. */
function ams_cut( $text, $len ) {
	$text = (string) $text;
	return function_exists( 'mb_substr' ) ? mb_substr( $text, 0, $len ) : substr( $text, 0, $len );
}

header( 'Content-Type: text/plain; charset=utf-8' );
header( 'X-Robots-Tag: noindex, nofollow' );

if ( ! isset( $_GET['k'] ) || ! hash_equals( $AMS_TOKEN, (string) $_GET['k'] ) ) {
	http_response_code( 403 );
	echo "forbidden\n";
	exit;
}

$t_request = isset( $_SERVER['REQUEST_TIME_FLOAT'] ) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : microtime( true );
$ms        = function ( $seconds ) {
	return number_format( $seconds * 1000, 1 ) . ' ms';
};

/* ── locate wp-load.php ──────────────────────────────────────────────────────
 * Normally three levels up (wp-content/plugins/<us>/), but walk up a few more
 * in case wp-content has been relocated.
 */
$wp_load = '';
$dir     = __DIR__;
for ( $i = 0; $i < 6; $i++ ) {
	$dir = dirname( $dir );
	if ( file_exists( $dir . '/wp-load.php' ) ) {
		$wp_load = $dir . '/wp-load.php';
		break;
	}
}
if ( ! $wp_load ) {
	echo "could not locate wp-load.php from " . __DIR__ . "\n";
	exit;
}

/* ── the whole point: boot WordPress WITHOUT plugins, theme, or hooks ─────── */
define( 'SHORTINIT', true );
$t0 = microtime( true );
require $wp_load;
$t_boot = microtime( true ) - $t0;

global $wpdb;
if ( ! isset( $wpdb ) || ! is_object( $wpdb ) ) {
	echo "SHORTINIT did not give us \$wpdb — this approach will not work as-is.\n";
	exit;
}

// wp_set_wpdb_vars() normally fills these in before SHORTINIT returns, but fall
// back to the prefix so a surprise here reports a number instead of a fatal.
$T_POSTS    = $wpdb->posts ? $wpdb->posts : $wpdb->prefix . 'posts';
$T_POSTMETA = $wpdb->postmeta ? $wpdb->postmeta : $wpdb->prefix . 'postmeta';
$T_USERS    = $wpdb->users ? $wpdb->users : $wpdb->base_prefix . 'users';

$out   = array();
$out[] = '==== AMS FAST PROBE (SHORTINIT direct read path) ================';
$out[] = 'PHP ' . PHP_VERSION . '   SAPI: ' . PHP_SAPI;
$out[] = 'Table prefix: ' . $wpdb->prefix;
$out[] = '';
$out[] = 'WordPress boot (SHORTINIT): ' . $ms( $t_boot );
$out[] = '';

/* ── real queries, each timed ────────────────────────────────────────────── */

$timings = array();

// 1. Articles list — the admin's Articles screen, 20 newest of any status.
$q0    = microtime( true );
$posts = $wpdb->get_results(
	"SELECT ID, post_title, post_status, post_date, post_author, post_name
	 FROM $T_POSTS
	 WHERE post_type = 'post'
	   AND post_status IN ('publish','draft','pending','future','private')
	 ORDER BY post_date DESC
	 LIMIT 20"
);
$timings['articles list (20 newest)'] = microtime( true ) - $q0;

// 2. Post counts by status — the Dashboard tiles.
$q0     = microtime( true );
$counts = $wpdb->get_results(
	"SELECT post_status, COUNT(*) AS n
	 FROM $T_POSTS
	 WHERE post_type = 'post'
	 GROUP BY post_status"
);
$timings['dashboard counts'] = microtime( true ) - $q0;

// 3. Programs list — movies, which is what the Programs screen shows.
$q0     = microtime( true );
$movies = $wpdb->get_results(
	"SELECT ID, post_title, post_status, post_date, post_name
	 FROM $T_POSTS
	 WHERE post_type = 'movie'
	   AND post_status IN ('publish','draft','pending','private')
	 ORDER BY post_date DESC
	 LIMIT 50"
);
$timings['programs list (movies)'] = microtime( true ) - $q0;

// 4. Their meta in ONE query — the _khi_tv_show_id link and friends. This is
//    the shape that matters: N posts + their meta without an N+1.
$meta_rows = array();
if ( $movies ) {
	$ids = implode( ',', ams_pluck_ids( $movies ) );
	$q0  = microtime( true );
	$meta_rows = $wpdb->get_results(
		"SELECT post_id, meta_key, meta_value
		 FROM $T_POSTMETA
		 WHERE post_id IN ($ids)
		   AND meta_key IN ('_khi_tv_show_id','_movie_release_date','_movie_run_time','_thumbnail_id')"
	);
	$timings['their meta (single query)'] = microtime( true ) - $q0;
}

// 5. Authors — the Users screen / author filter.
$q0      = microtime( true );
$authors = $wpdb->get_results(
	"SELECT ID, user_login, display_name FROM $T_USERS ORDER BY display_name LIMIT 20"
);
$timings['authors'] = microtime( true ) - $q0;

$out[] = '---- QUERY TIMINGS ---------------------------------------------';
$query_total = 0.0;
foreach ( $timings as $label => $t ) {
	$out[]        = '  ' . str_pad( $ms( $t ), 12 ) . $label;
	$query_total += $t;
}
$out[] = '  ' . str_pad( $ms( $query_total ), 12 ) . 'ALL QUERIES';
$out[] = '';

$total = microtime( true ) - $t_request;
$out[] = '---- BOTTOM LINE -----------------------------------------------';
$out[] = '  TOTAL, PHP start to here: ' . $ms( $total );
$out[] = '';
$out[] = '  Compare with the boot timer: a normal REST call on this server';
$out[] = '  costs ~3,900 ms before it does any work at all.';
if ( $total > 0 ) {
	$out[] = '  Speedup on this request: ' . number_format( 3.9 / $total, 1 ) . 'x';
}
$out[] = '';

/* ── prove the data is real ──────────────────────────────────────────────── */
$out[] = '---- DATA SANITY (proof these are real rows) -------------------';
$out[] = 'Posts returned: ' . count( $posts );
foreach ( array_slice( (array) $posts, 0, 3 ) as $p ) {
	$out[] = '  #' . $p->ID . '  [' . $p->post_status . ']  ' . $p->post_date . '  ' . ams_cut( $p->post_title, 50 );
}
$out[] = 'Post counts by status:';
foreach ( (array) $counts as $c ) {
	$out[] = '  ' . str_pad( $c->post_status, 12 ) . $c->n;
}
$out[] = 'Movies returned: ' . count( $movies ) . '   meta rows: ' . count( $meta_rows );
foreach ( array_slice( (array) $movies, 0, 3 ) as $m ) {
	$out[] = '  #' . $m->ID . '  [' . $m->post_status . ']  ' . ams_cut( $m->post_title, 40 );
}
$out[] = 'Users returned: ' . count( $authors );
$out[] = '';

/* ── what survives SHORTINIT ─────────────────────────────────────────────── */
$out[] = '---- WHAT IS AVAILABLE UNDER SHORTINIT -------------------------';
$out[] = 'This decides how a real implementation gets written.';
$out[] = '';
$checks = array(
	'$wpdb'                => isset( $wpdb ) && is_object( $wpdb ),
	'apply_filters()'      => function_exists( 'apply_filters' ),
	'get_option()'         => function_exists( 'get_option' ),
	'get_post()'           => function_exists( 'get_post' ),
	'get_post_meta()'      => function_exists( 'get_post_meta' ),
	'WP_Query class'       => class_exists( 'WP_Query' ),
	'wp_cache_get()'       => function_exists( 'wp_cache_get' ),
	'external object cache' => function_exists( 'wp_using_ext_object_cache' ) && wp_using_ext_object_cache(),
	'wp_get_current_user()' => function_exists( 'wp_get_current_user' ),
	'wp_hash() / wp_salt()' => function_exists( 'wp_salt' ),
	'sanitize_text_field()' => function_exists( 'sanitize_text_field' ),
	'AUTH_SALT constant'    => defined( 'AUTH_SALT' ),
	'LOGGED_IN_SALT const'  => defined( 'LOGGED_IN_SALT' ),
);
foreach ( $checks as $label => $ok ) {
	$out[] = '  ' . ( $ok ? '[yes]' : '[NO ]' ) . '  ' . $label;
}
$out[] = '';
$out[] = 'Auth note: if wp_salt() is absent but the SALT CONSTANTS are defined,';
$out[] = 'our existing X-AMS-Token can still be verified here by recomputing the';
$out[] = 'HMAC directly — which is what a real endpoint would do.';
$out[] = '';
$out[] = 'WHEN DONE: delete the ams-fast-probe plugin from wp-admin.';

echo implode( "\n", $out ) . "\n";

