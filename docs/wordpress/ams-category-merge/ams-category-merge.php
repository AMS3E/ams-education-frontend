<?php
/**
 * Plugin Name: AMS Category Merge
 * Description: Add or remove a category across many posts WITHOUT saving the post. Logs every post it touches so any run can be reverted with one click. Includes a read-only permalink diagnostic.
 * Version:     1.1.0
 * Author:      Soth Kimleng
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * WHAT WE LEARNED THE HARD WAY (measured on this install, 2026-08-21)
 *
 * 1. Saving a post regenerates its permalink. So Bulk Edit / Quick Edit /
 *    POST wp/v2/posts are all unsafe for a category merge.
 *
 * 2. wp_set_object_terms() avoids the save — post_modified stays untouched,
 *    confirmed on 5 posts. But that was NOT enough, because:
 *
 * 3. Some posts have NO stored permalink at all. Their URL is COMPUTED at read
 *    time from whichever category wins. For those, changing the category set
 *    moves the URL no matter which tool you use. Posts WITH a stored
 *    `custom_permalink` meta are genuinely frozen (e.g. 208433, still serving
 *    a category deleted years ago).
 *
 * So the real question is: how many posts are stored vs computed? The
 * Diagnose tab answers that and writes nothing.
 *
 * Everything here works at the taxonomy layer only. Nothing calls
 * wp_update_post().
 */

const AMS_CM_SLUG = 'ams-category-merge';
const AMS_CM_CAP  = 'manage_options';
const AMS_CM_LOG  = 'ams_cm_touched';   // post IDs this plugin has added the target term to
const AMS_CM_META = 'custom_permalink'; // Custom Permalinks' per-post key

/** Posts touched by v1.0.0 before the log existed. Seeded once so they are revertable. */
const AMS_CM_SEED = [ 223015, 222833, 221538, 221264, 221205 ];

add_action( 'admin_menu', function () {
	add_management_page( 'Category Merge', 'Category Merge', AMS_CM_CAP, AMS_CM_SLUG, 'ams_cm_render' );
} );

/* ------------------------------------------------------------------ log --- */

function ams_cm_log_get() {
	$log = get_option( AMS_CM_LOG, null );
	if ( null === $log ) {                       // first load: seed the v1.0.0 run
		$log = AMS_CM_SEED;
		update_option( AMS_CM_LOG, $log, false );
	}
	return array_values( array_unique( array_map( 'absint', (array) $log ) ) );
}

function ams_cm_log_add( array $ids ) {
	update_option( AMS_CM_LOG, array_values( array_unique( array_merge( ams_cm_log_get(), $ids ) ) ), false );
}

function ams_cm_log_drop( array $ids ) {
	update_option( AMS_CM_LOG, array_values( array_diff( ams_cm_log_get(), $ids ) ), false );
}

/* --------------------------------------------------------------- queries --- */

/** Posts in $source that do NOT yet have $target. Naturally resumable. */
function ams_cm_pending( $source, $target, $batch ) {
	$q = new WP_Query( [
		'post_type'              => 'post',
		'post_status'            => [ 'publish', 'draft', 'pending', 'private', 'future' ],
		'posts_per_page'         => $batch,
		'fields'                 => 'ids',
		'ignore_sticky_posts'    => true,
		'update_post_meta_cache' => false,
		'update_post_term_cache' => false,
		'tax_query'              => [
			'relation' => 'AND',
			[ 'taxonomy' => 'category', 'field' => 'term_id', 'terms' => $source ],
			[ 'taxonomy' => 'category', 'field' => 'term_id', 'terms' => $target, 'operator' => 'NOT IN' ],
		],
	] );
	return [ 'ids' => $q->posts, 'remaining' => (int) $q->found_posts ];
}

/** How many posts in $source carry a STORED permalink (frozen) vs none (computed). */
function ams_cm_diagnose( $source ) {
	$base = [
		'post_type'              => 'post',
		'post_status'            => [ 'publish', 'draft', 'pending', 'private', 'future' ],
		'posts_per_page'         => 1,
		'fields'                 => 'ids',
		'ignore_sticky_posts'    => true,
		'update_post_meta_cache' => false,
		'update_post_term_cache' => false,
		'tax_query'              => [ [ 'taxonomy' => 'category', 'field' => 'term_id', 'terms' => $source ] ],
	];

	$total = new WP_Query( $base );

	$stored = new WP_Query( array_merge( $base, [
		'meta_query' => [ [ 'key' => AMS_CM_META, 'compare' => 'EXISTS' ] ],
	] ) );

	$t = (int) $total->found_posts;
	$s = (int) $stored->found_posts;
	return [ 'total' => $t, 'stored' => $s, 'computed' => max( 0, $t - $s ) ];
}

/* ------------------------------------------------------------------- ui --- */

function ams_cm_row( $id, $before, $after ) {
	$same = ( $before === $after );
	printf(
		'<tr><td><a href="%s">%d</a></td><td>%s</td><td><code style="font-size:11px">%s</code></td>'
		. '<td><code style="font-size:11px">%s</code></td><td style="font-weight:600;color:%s">%s</td></tr>',
		esc_url( get_edit_post_link( $id ) ), $id,
		esc_html( wp_trim_words( get_the_title( $id ), 8 ) ),
		esc_html( urldecode( str_replace( home_url(), '', $before ) ) ),
		esc_html( urldecode( str_replace( home_url(), '', $after ) ) ),
		$same ? '#15803d' : '#b32d2e',
		$same ? 'unchanged' : 'CHANGED'
	);
}

function ams_cm_render() {
	if ( ! current_user_can( AMS_CM_CAP ) ) {
		wp_die( 'Not allowed.' );
	}

	$source = isset( $_POST['source'] ) ? absint( $_POST['source'] ) : 960;
	$target = isset( $_POST['target'] ) ? absint( $_POST['target'] ) : 959;
	$batch  = isset( $_POST['batch'] )  ? max( 1, min( 200, absint( $_POST['batch'] ) ) ) : 5;

	$action = '';
	if ( isset( $_POST['ams_cm_action'] ) && check_admin_referer( 'ams_cm' ) ) {
		$action = sanitize_key( wp_unslash( $_POST['ams_cm_action'] ) );
	}

	$s_term = get_term( $source, 'category' );
	$t_term = get_term( $target, 'category' );
	$log    = ams_cm_log_get();

	echo '<div class="wrap"><h1>Category Merge</h1>';

	if ( is_wp_error( $s_term ) || ! $s_term || is_wp_error( $t_term ) || ! $t_term ) {
		echo '<div class="notice notice-error"><p>One of those term IDs does not exist.</p></div></div>';
		return;
	}

	printf(
		'<p><strong>%s</strong> <code>#%d</code> (%d posts) &nbsp;&rarr;&nbsp; <strong>%s</strong> <code>#%d</code> (%d posts)</p>',
		esc_html( $s_term->name ), $source, $s_term->count,
		esc_html( $t_term->name ), $target, $t_term->count
	);

	/* ---- REVERT panel, first because it is the emergency exit ---- */
	echo '<div style="margin:18px 0;padding:16px;background:#fcf0f1;border:1px solid #d63638;max-width:760px">';
	echo '<h2 style="margin-top:0">Undo</h2>';
	printf(
		'<p>This plugin has added <strong>%s</strong> to <strong>%d post(s)</strong>. Reverting removes it again &mdash; also without saving the post.</p>',
		esc_html( $t_term->name ), count( $log )
	);
	if ( $log ) {
		printf( '<p><code style="font-size:11px">%s</code></p>', esc_html( implode( ', ', array_slice( $log, 0, 60 ) ) ) . ( count( $log ) > 60 ? ' &hellip;' : '' ) );
		echo '<form method="post" style="display:inline">';
		wp_nonce_field( 'ams_cm' );
		printf( '<input type="hidden" name="source" value="%d"><input type="hidden" name="target" value="%d">', $source, $target );
		printf( '<input type="number" name="batch" value="%d" class="small-text" min="1" max="200"> ', $batch );
		submit_button( 'Revert that many now', 'delete', 'ams_cm_action_revert', false );
		echo '<input type="hidden" name="ams_cm_action" value="revert">';
		echo '</form>';
	} else {
		echo '<p><em>Nothing to undo.</em></p>';
	}
	echo '</div>';

	/* ---- DIAGNOSE ---- */
	echo '<div style="margin:18px 0;padding:16px;background:#fff;border:1px solid #c3c4c7;max-width:760px">';
	echo '<h2 style="margin-top:0">Diagnose (read-only)</h2>';
	echo '<p>Counts how many posts in the source category have a <strong>stored</strong> permalink (safe &mdash; the URL cannot move) versus a <strong>computed</strong> one (the URL follows the category). Writes nothing.</p>';
	echo '<form method="post">';
	wp_nonce_field( 'ams_cm' );
	printf( '<input type="hidden" name="source" value="%d"><input type="hidden" name="target" value="%d">', $source, $target );
	submit_button( 'Run diagnostic', 'secondary', 'ams_cm_action_diag', false );
	echo '<input type="hidden" name="ams_cm_action" value="diagnose">';
	echo '</form>';

	if ( 'diagnose' === $action ) {
		$d = ams_cm_diagnose( $source );
		printf(
			'<table class="widefat" style="margin-top:14px;max-width:520px"><tbody>'
			. '<tr><td>Posts in %s</td><td style="text-align:right"><strong>%d</strong></td></tr>'
			. '<tr><td style="color:#15803d">Stored permalink &mdash; URL frozen, safe</td><td style="text-align:right;color:#15803d"><strong>%d</strong></td></tr>'
			. '<tr><td style="color:#b32d2e">Computed permalink &mdash; URL will move</td><td style="text-align:right;color:#b32d2e"><strong>%d</strong></td></tr>'
			. '</tbody></table>',
			esc_html( $s_term->name ), $d['total'], $d['stored'], $d['computed']
		);
	}
	echo '</div>';

	/* ---- MERGE ---- */
	echo '<div style="margin:18px 0;padding:16px;background:#fff;border:1px solid #c3c4c7;max-width:760px">';
	echo '<h2 style="margin-top:0">Merge</h2>';
	echo '<form method="post">';
	wp_nonce_field( 'ams_cm' );
	echo '<table class="form-table"><tbody>';
	printf( '<tr><th>Source term ID</th><td><input type="number" name="source" value="%d" class="small-text"></td></tr>', $source );
	printf( '<tr><th>Target term ID</th><td><input type="number" name="target" value="%d" class="small-text"></td></tr>', $target );
	printf( '<tr><th>Batch size</th><td><input type="number" name="batch" value="%d" class="small-text" min="1" max="200"></td></tr>', $batch );
	echo '<tr><th>Mode</th><td><label><input type="checkbox" name="live" value="1"> <strong>Write for real</strong></label>'
		. '<br><span class="description">Unticked = dry run.</span></td></tr>';
	echo '</tbody></table>';
	submit_button( 'Run batch', 'primary', 'ams_cm_action_merge', false );
	echo '<input type="hidden" name="ams_cm_action" value="merge">';
	echo '</form></div>';

	/* ---- execute ---- */
	if ( 'merge' === $action || 'revert' === $action ) {
		$live = ( 'revert' === $action ) || ! empty( $_POST['live'] );

		if ( 'revert' === $action ) {
			$ids = array_slice( $log, 0, $batch );
			printf( '<div class="notice notice-warning"><p><strong>REVERT</strong> &mdash; removing %s from %d post(s).</p></div>',
				esc_html( $t_term->name ), count( $ids ) );
		} else {
			$p   = ams_cm_pending( $source, $target, $batch );
			$ids = $p['ids'];
			if ( ! $ids ) {
				echo '<div class="notice notice-success"><p><strong>Nothing left to do.</strong></p></div></div>';
				return;
			}
			printf( '<div class="notice notice-%s"><p>%s &mdash; processing <strong>%d</strong> of <strong>%d</strong> remaining.</p></div>',
				$live ? 'warning' : 'info',
				$live ? '<strong>LIVE RUN</strong>' : 'Dry run (nothing written)',
				count( $ids ), $p['remaining'] );
		}

		echo '<table class="widefat striped"><thead><tr><th style="width:80px">Post</th><th>Title</th>'
			. '<th>Permalink before</th><th>Permalink after</th><th style="width:90px">URL</th></tr></thead><tbody>';

		$done = 0; $drift = 0; $ok = [];

		foreach ( $ids as $id ) {
			$before = get_permalink( $id );

			if ( $live ) {
				$res = ( 'revert' === $action )
					? wp_remove_object_terms( $id, [ $target ], 'category' )
					: wp_set_object_terms( $id, [ $target ], 'category', true );

				if ( is_wp_error( $res ) ) {
					printf( '<tr><td>%d</td><td colspan="4" style="color:#b32d2e">FAILED: %s</td></tr>', $id, esc_html( $res->get_error_message() ) );
					continue;
				}
				$done++; $ok[] = $id;
				clean_post_cache( $id );
			}

			$after = get_permalink( $id );
			if ( $before !== $after ) { $drift++; }
			ams_cm_row( $id, $before, $after );
		}

		echo '</tbody></table>';

		if ( $live && $ok ) {
			if ( 'revert' === $action ) {
				ams_cm_log_drop( $ok );
			} else {
				ams_cm_log_add( $ok );
			}
			wp_update_term_count_now( [ $s_term->term_taxonomy_id, $t_term->term_taxonomy_id ], 'category' );

			$left = ( 'revert' === $action )
				? count( ams_cm_log_get() )
				: ams_cm_pending( $source, $target, 1 )['remaining'];

			printf( '<div class="notice notice-%s" style="margin-top:16px"><p><strong>%d post(s) processed. %d permalink(s) changed.</strong><br>%d left &mdash; run again to continue.</p></div>',
				$drift ? 'error' : 'success', $done, $drift, $left );

			if ( $drift && 'merge' === $action ) {
				echo '<div class="notice notice-error"><p><strong>STOP.</strong> Permalinks moved. Use <strong>Undo</strong> above to put them back, then re-run the diagnostic.</p></div>';
			}
		}
	}

	echo '</div>';
}
