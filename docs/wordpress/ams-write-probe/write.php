<?php
/**
 * Which callback, exactly, is spending the time on a post write?
 *
 * v1 of this probe answered the shape of the problem and got one thing wrong by
 * omission, so v2 stops sampling and starts attributing:
 *
 *   v1 found  — a draft insert costs 224ms with all 62 plugins hooked (so
 *               wp_insert_post is NOT where minutes go), term assignment is 97%
 *               plugin overhead (2,464ms -> 72ms), and wp_delete_post takes
 *               ~98 SECONDS even with every write hook already removed.
 *   v1 missed — it called wp_insert_post directly, which skips the whole
 *               `rest_*_insert_post` family. The admin writes through REST, and
 *               that is where block-editor-era plugins moved their work.
 *
 * So v2 does two things differently:
 *
 *   1. It WRAPS every callback on every write/delete hook in a timer, instead of
 *      timing the operation as a whole. The output is a ranked per-callback
 *      table — "this method, in this plugin, cost 94 seconds" — which needs no
 *      interpretation and no further guessing.
 *   2. It creates through `rest_do_request`, the exact path the admin tool uses,
 *      so `rest_after_insert_post` finally shows up in the numbers.
 *
 * Hit DIRECTLY, not through WordPress routing:
 *   /wp-content/plugins/ams-write-probe/write.php?k=<token>          (phase A)
 *   /wp-content/plugins/ams-write-probe/write.php?k=<token>&write=1  (phase A+B)
 *
 * PHASE A IS READ-ONLY — it walks $wp_filter and reports, wrapping nothing.
 *
 * PHASE B writes, narrowly: post_status is 'draft' and never anything else, so
 * no publish transition fires and nothing reaches the public site. Both posts
 * are hard-deleted before the response is written, titles are prefixed
 * [AMS WRITE PROBE], and anything a crashed run left behind is reported under
 * `leftover`.
 */

$AMS_TOKEN = 'a7f3c1d9e2b64058';

if ( ! isset( $_GET['k'] ) || ! hash_equals( $AMS_TOKEN, (string) $_GET['k'] ) ) {
	header( 'Content-Type: application/json; charset=utf-8' );
	http_response_code( 403 );
	echo json_encode( array( 'ok' => false, 'error' => 'bad key' ) );
	exit;
}

$boot_started = microtime( true );

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
	header( 'Content-Type: application/json; charset=utf-8' );
	http_response_code( 500 );
	echo json_encode( array( 'ok' => false, 'error' => 'wp-load.php not found' ) );
	exit;
}

require_once $wp_load;

$boot_ms = round( ( microtime( true ) - $boot_started ) * 1000, 1 );

header( 'Content-Type: application/json; charset=utf-8' );
header( 'X-Robots-Tag: noindex, nofollow' );

/* ---------------------------------------------------------------------------
 * Every hook a create or a delete passes through. The `rest_` family and the
 * delete family are the two v1 never looked at, and between them they hold the
 * whole unexplained cost.
 * ------------------------------------------------------------------------- */
$WRITE_HOOKS = array(
	// create / update
	'rest_pre_insert_post',
	'rest_insert_post',
	'rest_after_insert_post',
	'wp_insert_post_empty_content',
	'wp_insert_post_data',
	'wp_insert_post_parent',
	'pre_post_update',
	'wp_insert_post',
	'save_post',
	'save_post_post',
	'post_updated',
	'wp_after_insert_post',
	'transition_post_status',
	'draft_to_publish',
	'new_to_publish',
	'publish_post',
	'added_post_meta',
	'updated_post_meta',
	'update_post_metadata',
	'set_object_terms',
	'edited_term_taxonomy',
	'edited_term_taxonomies',
	// delete / trash — v1's 98 seconds live somewhere in here
	'wp_trash_post',
	'trashed_post',
	'pre_delete_post',
	'before_delete_post',
	'delete_post',
	'deleted_post',
	'after_delete_post',
	'delete_post_meta',
	'deleted_post_meta',
	'delete_term_relationships',
	'deleted_term_relationships',
	'clean_post_cache',
);

/** A callable rendered as a name plus the FILE it lives in — the file is what
 *  identifies the plugin responsible, which is the entire point. */
function ams_cb_info( $fn ) {
	$name = '(unknown)';
	$file = '';
	$line = 0;

	try {
		if ( is_string( $fn ) ) {
			$name = $fn;
			if ( function_exists( $fn ) ) {
				$r    = new ReflectionFunction( $fn );
				$file = (string) $r->getFileName();
				$line = (int) $r->getStartLine();
			}
		} elseif ( $fn instanceof Closure ) {
			$name = 'Closure';
			$r    = new ReflectionFunction( $fn );
			$file = (string) $r->getFileName();
			$line = (int) $r->getStartLine();
		} elseif ( is_array( $fn ) && count( $fn ) === 2 ) {
			$cls  = is_object( $fn[0] ) ? get_class( $fn[0] ) : (string) $fn[0];
			$name = $cls . '::' . (string) $fn[1];
			$r    = new ReflectionMethod( $cls, (string) $fn[1] );
			$file = (string) $r->getFileName();
			$line = (int) $r->getStartLine();
		} elseif ( is_object( $fn ) ) {
			$name = get_class( $fn ) . '::__invoke';
			$r    = new ReflectionMethod( get_class( $fn ), '__invoke' );
			$file = (string) $r->getFileName();
			$line = (int) $r->getStartLine();
		}
	} catch ( Throwable $e ) {
		// A callback we cannot reflect is still worth naming.
	}

	$rel    = $file;
	$origin = 'core';
	if ( defined( 'WP_PLUGIN_DIR' ) && $file && strpos( $file, WP_PLUGIN_DIR ) === 0 ) {
		$rel    = ltrim( substr( $file, strlen( WP_PLUGIN_DIR ) ), '/\\' );
		$origin = 'plugin';
	} elseif ( $file && strpos( $file, 'themes' ) !== false ) {
		$origin = 'theme';
		if ( defined( 'ABSPATH' ) && strpos( $file, ABSPATH ) === 0 ) {
			$rel = ltrim( substr( $file, strlen( ABSPATH ) ), '/\\' );
		}
	} elseif ( defined( 'ABSPATH' ) && $file && strpos( $file, ABSPATH ) === 0 ) {
		$rel = ltrim( substr( $file, strlen( ABSPATH ) ), '/\\' );
	}

	return array(
		'cb'     => $name,
		'at'     => $rel . ( $line ? ':' . $line : '' ),
		'origin' => $origin,
	);
}

/** Everything registered on a hook, in priority order. Read-only. */
function ams_hook_map( $hook ) {
	global $wp_filter;
	if ( empty( $wp_filter[ $hook ] ) ) {
		return array();
	}
	$out       = array();
	$callbacks = $wp_filter[ $hook ]->callbacks;
	ksort( $callbacks );
	foreach ( $callbacks as $priority => $entries ) {
		foreach ( $entries as $entry ) {
			$info             = ams_cb_info( $entry['function'] );
			$info['priority'] = (int) $priority;
			$out[]            = $info;
		}
	}
	return $out;
}

$report = array(
	'ok'     => true,
	'probe'  => 'v2 (per-callback attribution)',
	'phase'  => isset( $_GET['write'] ) && $_GET['write'] === '1' ? 'A+B' : 'A',
	'wp'     => get_bloginfo( 'version' ),
	'php'    => PHP_VERSION,
	'timing' => array( 'wpBootMs' => $boot_ms ),
);

/* --- PHASE A ------------------------------------------------------------- */

$counts = array();
$hooks  = array();
foreach ( $WRITE_HOOKS as $hook ) {
	$map = ams_hook_map( $hook );
	if ( $map ) {
		$hooks[ $hook ] = $map;
	}
	$counts[ $hook ] = count( $map );
}
$report['hookCounts'] = array_filter( $counts );
$report['hooks']      = $hooks;

/* --- PHASE B: attribute the time, callback by callback -------------------- */

if ( $report['phase'] === 'A+B' ) {

	/** Accumulator: "hook | callback" => {calls, ms}. Written by the wrappers. */
	$LOG = array();

	/**
	 * Replace every callback on $hook with a closure that times the original.
	 *
	 * The wrapper returns whatever the original returned, so FILTERS keep
	 * working (a filter whose value is swallowed would change behaviour, and a
	 * probe that changes behaviour measures something else). Priority and
	 * accepted_args are preserved so ordering is untouched.
	 */
	$instrument = function ( $hook ) use ( &$LOG ) {
		global $wp_filter;
		if ( empty( $wp_filter[ $hook ] ) ) {
			return;
		}
		// Snapshot first: we mutate the very structure we are walking.
		$callbacks = $wp_filter[ $hook ]->callbacks;
		foreach ( $callbacks as $priority => $entries ) {
			foreach ( $entries as $entry ) {
				$fn   = $entry['function'];
				$args = max( 1, (int) $entry['accepted_args'] );
				$info = ams_cb_info( $fn );
				$key  = $hook . ' | ' . $info['cb'];

				remove_filter( $hook, $fn, $priority );
				add_filter(
					$hook,
					function () use ( $fn, $key, $hook, $info, &$LOG ) {
						$a   = func_get_args();
						$t0  = microtime( true );
						$ret = call_user_func_array( $fn, $a );
						$ms  = ( microtime( true ) - $t0 ) * 1000;

						if ( ! isset( $LOG[ $key ] ) ) {
							$LOG[ $key ] = array(
								'hook'   => $hook,
								'cb'     => $info['cb'],
								'at'     => $info['at'],
								'origin' => $info['origin'],
								'calls'  => 0,
								'ms'     => 0.0,
							);
						}
						$LOG[ $key ]['calls']++;
						$LOG[ $key ]['ms'] += $ms;
						return $ret;
					},
					$priority,
					$args
				);
			}
		}
	};

	foreach ( $WRITE_HOOKS as $hook ) {
		$instrument( $hook );
	}

	/** Slowest first, and anything under a millisecond is noise. */
	$rank = function ( $log ) {
		$rows = array_values( $log );
		usort(
			$rows,
			function ( $a, $b ) {
				return $b['ms'] <=> $a['ms'];
			}
		);
		$out = array();
		foreach ( $rows as $r ) {
			if ( $r['ms'] < 1.0 ) {
				continue;
			}
			$r['ms'] = round( $r['ms'], 1 );
			$out[]   = $r;
		}
		return $out;
	};

	// REST needs a user with the caps, and rest_do_request skips cookie/nonce
	// auth entirely — so setting the current user is the whole of it.
	$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
	$as_user = $admins ? (int) $admins[0] : 0;
	wp_set_current_user( $as_user );

	$report['as'] = array( 'userId' => $as_user, 'canPublish' => current_user_can( 'publish_posts' ) );

	/* 1. CREATE, through the REST stack the admin tool actually uses. */
	$req = new WP_REST_Request( 'POST', '/wp/v2/posts' );
	$req->set_header( 'content-type', 'application/json' );
	$req->set_body(
		wp_json_encode(
			array(
				'title'   => '[AMS WRITE PROBE] rest-create ' . gmdate( 'Y-m-d H:i:s' ),
				'content' => 'Temporary probe post. Safe to delete.',
				'status'  => 'draft',
				'meta'    => array(),
			)
		)
	);

	$t0       = microtime( true );
	$res      = rest_do_request( $req );
	$createMs = round( ( microtime( true ) - $t0 ) * 1000, 1 );
	$data     = $res->get_data();
	$newId    = is_array( $data ) && isset( $data['id'] ) ? (int) $data['id'] : 0;

	$report['restCreate'] = array(
		'totalMs'     => $createMs,
		'status'      => $res->get_status(),
		'id'          => $newId,
		'error'       => $res->is_error() ? $data : null,
		'perCallback' => $rank( $LOG ),
	);

	// Mark it so a crashed run is still findable, without going through REST.
	if ( $newId ) {
		update_post_meta( $newId, '_ams_write_probe', '1' );
	}

	$LOG = array();

	/* 2. TERMS, separately — v1 measured 2.46s here and it wants attribution. */
	if ( $newId ) {
		$t0      = microtime( true );
		wp_set_object_terms( $newId, array( 'uncategorized' ), 'category', false );
		$termsMs = round( ( microtime( true ) - $t0 ) * 1000, 1 );

		$report['setTerms'] = array(
			'totalMs'     => $termsMs,
			'perCallback' => $rank( $LOG ),
		);
		$LOG = array();
	}

	/* 3. DELETE — the 98 seconds v1 found and could not explain. */
	if ( $newId ) {
		$t0       = microtime( true );
		$ok       = wp_delete_post( $newId, true );
		$deleteMs = round( ( microtime( true ) - $t0 ) * 1000, 1 );

		$report['forceDelete'] = array(
			'totalMs'     => $deleteMs,
			'deleted'     => (bool) $ok,
			'perCallback' => $rank( $LOG ),
		);
		$LOG = array();
	}

	/* Anything a crashed run left behind. Drafts only ever, so nothing public. */
	$leftover = get_posts(
		array(
			'post_type'   => 'any',
			'post_status' => array( 'draft', 'trash', 'publish' ),
			'meta_key'    => '_ams_write_probe',
			'fields'      => 'ids',
			'numberposts' => 20,
		)
	);
	$report['leftover'] = array_map( 'intval', (array) $leftover );
}

$report['timing']['totalMs'] = round( ( microtime( true ) - $boot_started ) * 1000, 1 );

echo json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
