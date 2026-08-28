<?php
/**
 * Plugin Name: AMS Boot Timer (TEMPORARY DIAGNOSTIC)
 * Description: Reports OPcache health and measures where WordPress spends its
 *              ~4s-per-REST-call boot time. Install, read the report, then
 *              DEACTIVATE AND DELETE. Not for permanent use.
 * Version:     1.2
 * Author:      Soth Kimleng
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Every WordPress REST call this site serves costs ~4s, whether it returns
 * 1.5MB or a single id, while the page-cached homepage answers in 90ms. A
 * fixed, payload-independent cost means the time goes into BOOTING PHP +
 * WordPress, not into the query. This tells you which of two things it is:
 *
 *   A. PHP is recompiling WordPress on every request  -> an OPcache problem.
 *   B. OPcache is fine and a plugin/theme hook is slow -> a WordPress problem.
 *
 * The single most important line in the report is whether OPcache is ENABLED.
 * That one reads correctly no matter how you install this.
 *
 * -- INSTALL, option 1: as a normal plugin (NO server/panel access needed) -----
 *   1. wp-admin -> Plugins -> Add New -> Upload Plugin -> ams-boot-timer.zip
 *   2. Install Now -> Activate
 *   3. Visit  https://<site>/wp-json/?ams_diag=3beec66aa4ce417392
 *      (use the /wp-json/ form: a page cache drop-in can answer the HOMEPAGE
 *      before plugins load, in which case this never runs and you just get HTML)
 *   4. Make some REST calls, then RELOAD the diag URL to fill in the samples.
 *   5. Plugins -> Deactivate -> Delete when finished.
 *
 * -- INSTALL, option 2: as an mu-plugin (needs file access; more precise) ------
 *   Put this file at wp-content/mu-plugins/ams-boot-timer.php (create the
 *   folder if needed, no activation required), then steps 3-4 above, and
 *   delete the file when finished.
 *
 * Option 2 loads before every other plugin, so it can attribute the
 * pre-WordPress compile phase exactly AND measure every plugin. Option 1 loads
 * partway through the plugin list, so its first mark also contains whatever
 * loaded before it. The report says which. OPcache figures are exact either way.
 *
 * Everything here is read-only apart from appending to its own log file.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Gates the diagnostic page. Change it if you like; it is not a credential to
// anything, it just keeps the report off the open internet.
define( 'AMS_TIMER_TOKEN', '3beec66aa4ce417392' );

// Are we an mu-plugin (loads before all regular plugins) or an ordinary one?
// Only the mu position can isolate the core-compile phase precisely.
define( 'AMS_TIMER_MU', 0 === did_action( 'muplugins_loaded' ) );

// Timings for THIS request, relative to when PHP started. REQUEST_TIME_FLOAT is
// set by the SAPI before any of our code runs, so it captures the core-file
// compile phase, exactly the part OPcache is supposed to eliminate.
global $ams_timer_marks;
$ams_timer_marks = array();

function ams_timer_start() {
	return isset( $_SERVER['REQUEST_TIME_FLOAT'] ) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : microtime( true );
}

function ams_timer_mark( $label ) {
	global $ams_timer_marks;
	$ams_timer_marks[ $label ] = microtime( true ) - ams_timer_start();
}

/** ms, 1 decimal. */
function ams_timer_ms( $seconds ) {
	return number_format( $seconds * 1000, 1 ) . ' ms';
}

function ams_timer_log_file() {
	return WP_CONTENT_DIR . '/ams-timing-' . AMS_TIMER_TOKEN . '.log';
}

/* -- phase marks ---------------------------------------------------------- */

// The first point our code can run. Everything before it is PHP startup,
// wp-config, wp-settings and ~1000 core includes (plus earlier plugins, when
// installed as a normal plugin).
ams_timer_mark( 'our file loaded' );

foreach ( array( 'muplugins_loaded', 'plugins_loaded', 'setup_theme', 'after_setup_theme', 'init', 'wp_loaded', 'rest_api_init' ) as $ams_hook ) {
	add_action(
		$ams_hook,
		function () use ( $ams_hook ) {
			ams_timer_mark( $ams_hook );
		},
		-PHP_INT_MAX
	);
}

/* -- per-plugin file load cost ------------------------------------------------
 * WordPress fires `plugin_loaded` after including EACH active plugin's main
 * file, so the gap between consecutive firings is that plugin's parse+compile+
 * execute cost. Without OPcache this is paid on every single request, which
 * makes it the ranked hit-list for "what do I deactivate first".
 *
 * We can only see plugins loaded AFTER us (we are a plugin ourselves) - the
 * report says how many were missed.
 */
global $ams_timer_plugins;
$ams_timer_plugins         = array();
$GLOBALS['ams_timer_prev'] = microtime( true );

add_action(
	'plugin_loaded',
	function ( $plugin ) {
		$now = microtime( true );

		$GLOBALS['ams_timer_plugins'][ (string) $plugin ] = $now - $GLOBALS['ams_timer_prev'];
		$GLOBALS['ams_timer_prev']                        = $now;
	},
	-PHP_INT_MAX
);

// REST dispatch: the boundary between "booting" and "actually answering".
add_filter(
	'rest_pre_dispatch',
	function ( $result ) {
		ams_timer_mark( 'rest_pre_dispatch' );
		return $result;
	},
	-PHP_INT_MAX
);
add_filter(
	'rest_post_dispatch',
	function ( $result ) {
		ams_timer_mark( 'rest_post_dispatch' );
		return $result;
	},
	PHP_INT_MAX
);

/* -- sample REST requests to a log ---------------------------------------- */

add_action(
	'shutdown',
	function () {
		if ( empty( $_SERVER['REQUEST_URI'] ) || false === strpos( $_SERVER['REQUEST_URI'], '/wp-json/' ) ) {
			return; // only REST calls - that's the cost we're chasing
		}
		$file = ams_timer_log_file();
		if ( file_exists( $file ) && filesize( $file ) > 512000 ) {
			return; // don't grow without bound
		}
		global $ams_timer_marks;
		$row = array(
			'at'      => gmdate( 'H:i:s' ),
			'total'   => round( microtime( true ) - ams_timer_start(), 3 ),
			'path'    => substr( (string) $_SERVER['REQUEST_URI'], 0, 90 ),
			'queries' => function_exists( 'get_num_queries' ) ? get_num_queries() : -1,
			'peak_mb' => round( memory_get_peak_usage( true ) / 1048576, 1 ),
			'marks'   => array_map(
				function ( $v ) {
					return round( $v, 3 );
				},
				$ams_timer_marks
			),
		);
		@file_put_contents( $file, wp_json_encode( $row ) . "\n", FILE_APPEND | LOCK_EX );
	},
	PHP_INT_MAX
);

/* -- the diagnostic page -------------------------------------------------- */

add_action(
	'wp_loaded',
	function () {
		if ( ! isset( $_GET['ams_diag'] ) || ! hash_equals( AMS_TIMER_TOKEN, (string) $_GET['ams_diag'] ) ) {
			return;
		}
		global $ams_timer_marks;
		$marks          = $ams_timer_marks;
		$marks['(now)'] = microtime( true ) - ams_timer_start();

		if ( isset( $_GET['clear'] ) ) {
			@unlink( ams_timer_log_file() );
		}

		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'X-Robots-Tag: noindex, nofollow' );

		$out   = array();
		$out[] = '==== AMS BOOT TIMER ============================================';
		$out[] = 'PHP ' . PHP_VERSION . '   SAPI: ' . PHP_SAPI . '   WP ' . get_bloginfo( 'version' );
		$out[] = 'Installed as: ' . ( AMS_TIMER_MU ? 'MU-PLUGIN (precise, sees all plugins)' : 'normal plugin (first mark approximate)' );
		$out[] = 'Peak memory: ' . round( memory_get_peak_usage( true ) / 1048576, 1 ) . ' MB'
			. '   DB queries: ' . ( function_exists( 'get_num_queries' ) ? get_num_queries() : '?' );
		$out[] = 'Persistent object cache: ' . ( wp_using_ext_object_cache() ? 'YES' : 'NO  <- every request re-queries everything' );
		$out[] = '';

		/* -- OPcache: the primary signal -- */
		$verdict = array();
		$out[]   = '---- OPCACHE  (the primary signal - exact in both install modes) ';
		if ( ! function_exists( 'opcache_get_status' ) ) {
			$out[]     = 'opcache_get_status() MISSING -> the OPcache extension is NOT INSTALLED';
			$out[]     = 'for this SAPI (' . PHP_SAPI . ').';
			$verdict[] = 'OPcache is NOT INSTALLED, so every PHP file - core, all plugins, the';
			$verdict[] = 'theme - is parsed and compiled from source on EVERY request.';
			$verdict[] = 'Installing it needs server access: it is a missing EXTENSION, so no';
			$verdict[] = 'php.ini or .user.ini setting can switch it on.';
			$verdict[] = '';
			$verdict[] = 'Until then, the lever you DO control is how much PHP gets compiled,';
			$verdict[] = 'i.e. how many plugins load. See the per-plugin table below.';
		} else {
			$status = @opcache_get_status( false );
			$conf   = @opcache_get_configuration();
			if ( ! $status || empty( $status['opcache_enabled'] ) ) {
				$out[]     = 'OPcache is INSTALLED but DISABLED for this SAPI (' . PHP_SAPI . ').';
				$verdict[] = 'OPcache is installed but TURNED OFF. PHP recompiles all of WordPress';
				$verdict[] = 'on every request. Turn it on - see the footer.';
			} else {
				$st  = isset( $status['opcache_statistics'] ) ? $status['opcache_statistics'] : array();
				$mem = isset( $status['memory_usage'] ) ? $status['memory_usage'] : array();
				$d   = isset( $conf['directives'] ) ? $conf['directives'] : array();

				$hit_rate = isset( $st['opcache_hit_rate'] ) ? round( $st['opcache_hit_rate'], 2 ) : 0;
				$cached   = isset( $st['num_cached_scripts'] ) ? (int) $st['num_cached_scripts'] : 0;
				$max_keys = isset( $d['opcache.max_accelerated_files'] ) ? (int) $d['opcache.max_accelerated_files'] : 0;
				$used_mb  = isset( $mem['used_memory'] ) ? round( $mem['used_memory'] / 1048576, 1 ) : 0;
				$free_mb  = isset( $mem['free_memory'] ) ? round( $mem['free_memory'] / 1048576, 1 ) : 0;
				$waste_pc = isset( $mem['current_wasted_percentage'] ) ? round( $mem['current_wasted_percentage'], 1 ) : 0;
				$mem_mb   = isset( $d['opcache.memory_consumption'] ) ? round( $d['opcache.memory_consumption'] / 1048576, 0 ) : 0;
				$oom      = (int) ( isset( $st['oom_restarts'] ) ? $st['oom_restarts'] : 0 );

				$out[] = 'ENABLED.  hit rate ' . $hit_rate . '%   hits ' . (int) ( isset( $st['hits'] ) ? $st['hits'] : 0 )
					. '   misses ' . (int) ( isset( $st['misses'] ) ? $st['misses'] : 0 );
				$out[] = 'Cached scripts: ' . $cached . ' / ' . $max_keys . ' max_accelerated_files';
				$out[] = 'Memory: ' . $used_mb . ' MB used, ' . $free_mb . ' MB free, ' . $waste_pc . '% wasted'
					. '  (memory_consumption = ' . $mem_mb . ' MB)';
				$out[] = 'Restarts - oom: ' . $oom
					. '   hash: ' . (int) ( isset( $st['hash_restarts'] ) ? $st['hash_restarts'] : 0 )
					. '   manual: ' . (int) ( isset( $st['manual_restarts'] ) ? $st['manual_restarts'] : 0 );
				$out[] = 'cache_full: ' . ( ! empty( $status['cache_full'] ) ? 'YES <- too small' : 'no' )
					. '   restart_pending: ' . ( ! empty( $status['restart_pending'] ) ? 'YES' : 'no' );
				$out[] = 'validate_timestamps: ' . ( ! empty( $d['opcache.validate_timestamps'] ) ? 'on' : 'OFF' )
					. '   revalidate_freq: ' . ( isset( $d['opcache.revalidate_freq'] ) ? (int) $d['opcache.revalidate_freq'] . 's' : '?' );

				$sized_wrong = false;
				if ( $max_keys && $cached >= $max_keys * 0.9 ) {
					$verdict[]   = 'OPcache is on but at ' . round( $cached / $max_keys * 100 ) . '% of its FILE LIMIT'
						. ' (' . $cached . '/' . $max_keys . ') - it evicts and';
					$verdict[]   = 'recompiles constantly. Raise max_accelerated_files.';
					$sized_wrong = true;
				}
				if ( ! empty( $status['cache_full'] ) || $waste_pc > 20 || $oom > 0 ) {
					$verdict[]   = 'OPcache is on but its MEMORY is exhausted (full/wasted/OOM restarts).';
					$verdict[]   = 'Raise memory_consumption.';
					$sized_wrong = true;
				}
				if ( ! $sized_wrong && $hit_rate > 0 && $hit_rate < 95 ) {
					$verdict[]   = 'OPcache is on but the hit rate is only ' . $hit_rate . '% - files are being';
					$verdict[]   = 'recompiled on live requests. Check the sizing directives below.';
					$sized_wrong = true;
				}
				if ( ! $sized_wrong ) {
					$verdict[] = 'OPcache is ENABLED and HEALTHY. The time is NOT compile cost -';
					$verdict[] = 'it is in the phase with the biggest delta in the table below,';
					$verdict[] = 'i.e. a plugin or theme hook. Chase that, not the server config.';
				}
			}
		}
		$out[] = '';
		$out[] = '---- VERDICT ---------------------------------------------------';
		foreach ( $verdict as $line ) {
			$out[] = '  ' . $line;
		}
		if ( ! wp_using_ext_object_cache() ) {
			$out[] = '';
			$out[] = '  Also: there is NO persistent object cache. Every request re-runs';
			$out[] = '  every option/meta/term query from scratch. That is a separate and';
			$out[] = '  additive cost to whatever the verdict above says.';
		}
		$out[] = '';

		/* -- this request's phases -- */
		$out[] = '---- THIS REQUEST, PHASE BY PHASE ------------------------------';
		$out[] = 'Cumulative from PHP start; DELTA is what each phase cost.';
		if ( ! AMS_TIMER_MU ) {
			$out[] = 'NOTE: running as a normal plugin, so "our file loaded" also includes the';
			$out[] = 'plugins that loaded before this one - treat it as an upper bound.';
		}
		$out[] = '';
		$out[] = str_pad( 'phase', 26 ) . str_pad( 'at', 14 ) . 'delta';
		$prev  = 0.0;
		foreach ( $marks as $label => $t ) {
			$out[] = str_pad( $label, 26 ) . str_pad( ams_timer_ms( $t ), 14 ) . ams_timer_ms( $t - $prev );
			$prev  = $t;
		}
		$out[] = '';
		$out[] = 'File LOADING is everything up to plugins_loaded; everything after it is';
		$out[] = 'hook EXECUTION. OPcache removes most of the first and some of the second.';
		$out[] = '';

		/* -- per-plugin file load cost -- */
		global $ams_timer_plugins;
		$plugin_costs = is_array( $ams_timer_plugins ) ? $ams_timer_plugins : array();
		$active       = (array) get_option( 'active_plugins', array() );

		$out[] = '---- SLOWEST PLUGIN FILE LOADS ---------------------------------';
		if ( ! $plugin_costs ) {
			$out[] = 'No per-plugin data (this WordPress does not fire `plugin_loaded`).';
		} else {
			$measured = count( $plugin_costs );
			$missed   = max( 0, count( $active ) - $measured );
			$total    = array_sum( $plugin_costs );
			arsort( $plugin_costs );
			$out[] = 'Cost of INCLUDING each plugin file - paid on every request while';
			$out[] = 'OPcache is missing. ' . $measured . ' of ' . count( $active ) . ' measured'
				. ( $missed ? ' (' . $missed . ' load before this plugin and cannot be seen)' : '' ) . '.';
			$out[] = 'Measured total: ' . ams_timer_ms( $total );
			$out[] = '';
			$rank = 0;
			foreach ( $plugin_costs as $file => $cost ) {
				$rank++;
				if ( $rank > 25 ) {
					break;
				}
				$out[] = '  ' . str_pad( ams_timer_ms( $cost ), 12 ) . str_replace( WP_PLUGIN_DIR . '/', '', (string) $file );
			}

			// Group sibling families: 27 addons at 5ms each is a bigger number
			// than any single line above, and deactivating a family is one call.
			$groups = array();
			foreach ( $plugin_costs as $file => $cost ) {
				// `plugin_loaded` passes an ABSOLUTE path, so the slug is the
				// containing folder - not the first path segment (that's "www").
				$slug = basename( dirname( (string) $file ) );
				if ( 'plugins' === $slug ) {
					$slug = basename( (string) $file, '.php' ); // single-file plugin
				}
				if ( 0 === strpos( $slug, 'revslider' ) ) {
					$key = 'revslider* (Slider Revolution + addons)';
				} elseif ( 0 === strpos( $slug, 'wpseo' ) || 0 === strpos( $slug, 'wordpress-seo' ) ) {
					$key = 'Yoast SEO (wordpress-seo* / wpseo*)';
				} else {
					$key = $slug;
				}
				if ( ! isset( $groups[ $key ] ) ) {
					$groups[ $key ] = array( 0, 0.0 );
				}
				$groups[ $key ][0]++;
				$groups[ $key ][1] += $cost;
			}
			$multi = array();
			foreach ( $groups as $key => $g ) {
				if ( $g[0] > 1 ) {
					$multi[ $key ] = $g;
				}
			}
			if ( $multi ) {
				uasort(
					$multi,
					function ( $a, $b ) {
						return $b[1] < $a[1] ? -1 : 1;
					}
				);
				$out[] = '';
				$out[] = '  -- as GROUPS (deactivating a whole family is one decision) --';
				foreach ( $multi as $key => $g ) {
					$out[] = '  ' . str_pad( ams_timer_ms( $g[1] ), 12 ) . $key . '  (' . $g[0] . ' plugins)';
				}
			}
		}
		$out[] = '';

		/* -- all active plugins -- */
		$out[] = '---- ALL ACTIVE PLUGINS (' . count( $active ) . ') ------------------------------';
		foreach ( $active as $p ) {
			$out[] = '  ' . $p;
		}
		$mu = function_exists( 'get_mu_plugins' ) ? array_keys( get_mu_plugins() ) : array();
		if ( $mu ) {
			$out[] = '  -- must-use --';
			foreach ( $mu as $p ) {
				$out[] = '  ' . $p;
			}
		}
		$theme = wp_get_theme();
		$out[] = '  -- theme: ' . $theme->get( 'Name' ) . ' ' . $theme->get( 'Version' ) . ' --';
		$out[] = '';

		/* -- REST samples -- */
		$out[] = '---- REST SAMPLES ----------------------------------------------';
		$file  = ams_timer_log_file();
		$lines = file_exists( $file ) ? array_filter( explode( "\n", (string) file_get_contents( $file ) ) ) : array();
		if ( ! $lines ) {
			$out[] = 'None yet. Make some /wp-json/ requests, then reload this page.';
		} else {
			$out[] = str_pad( 'time', 10 ) . str_pad( 'total', 9 ) . str_pad( 'toFile', 9 )
				. str_pad( 'file>disp', 11 ) . str_pad( 'qry', 5 ) . 'path';
			foreach ( array_slice( $lines, -25 ) as $line ) {
				$row = json_decode( $line, true );
				if ( ! is_array( $row ) ) {
					continue;
				}
				$m     = isset( $row['marks'] ) ? $row['marks'] : array();
				$pre   = isset( $m['our file loaded'] ) ? $m['our file loaded'] : 0;
				$disp  = isset( $m['rest_pre_dispatch'] ) ? $m['rest_pre_dispatch'] : 0;
				$out[] = str_pad( $row['at'], 10 )
					. str_pad( $row['total'] . 's', 9 )
					. str_pad( $pre . 's', 9 )
					. str_pad( $disp ? round( $disp - $pre, 3 ) . 's' : '-', 11 )
					. str_pad( (string) $row['queries'], 5 )
					. $row['path'];
			}
			$out[] = '';
			$out[] = 'toFile    = PHP start -> this file (core compile' . ( AMS_TIMER_MU ? '' : ' + earlier plugins' ) . ')';
			$out[] = 'file>disp = this file -> REST dispatch (plugins, theme, init hooks)';
			$out[] = '';
			$out[] = 'Add &clear=1 to this URL to wipe the samples.';
		}

		$out[] = '';
		$out[] = '---- IF OPCACHE NEEDS FIXING -----------------------------------';
		$out[] = 'aaPanel: App Store -> PHP ' . substr( PHP_VERSION, 0, 3 ) . ' -> Settings -> Install extensions';
		$out[] = '-> opcache, then PHP -> Settings -> Configuration (php.ini):';
		$out[] = '  opcache.enable=1';
		$out[] = '  opcache.enable_cli=0';
		$out[] = '  opcache.memory_consumption=512';
		$out[] = '  opcache.interned_strings_buffer=32';
		$out[] = '  opcache.max_accelerated_files=100000';
		$out[] = '  opcache.validate_timestamps=1';
		$out[] = '  opcache.revalidate_freq=60';
		$out[] = 'Save, then RELOAD PHP-FPM. Reload this page and confirm ENABLED.';
		$out[] = '';
		if ( function_exists( 'opcache_get_status' ) ) {
			$out[] = 'NO PANEL ACCESS? The extension IS loaded here, so opcache.enable';
			$out[] = '(PHP_INI_ALL) may be settable from a .user.ini in the site root';
			$out[] = '(up to 5 min to take - user_ini.cache_ttl):';
			$out[] = '  opcache.enable=1';
			$out[] = 'The sizing directives are PHP_INI_SYSTEM and will NOT take that way.';
			$out[] = 'Reload this page to see whether it worked - this report is the test.';
		} else {
			$out[] = 'NO PANEL ACCESS? Then OPcache cannot be turned on at all here: the';
			$out[] = 'extension is not loaded, and no .user.ini or ini_set() can load a PHP';
			$out[] = 'extension. It needs a server-side install + FPM restart. Until then,';
			$out[] = 'reduce the amount of PHP compiled per request - see the plugin table.';
		}
		$out[] = '';
		$out[] = 'WHEN DONE: deactivate + delete this plugin, and delete';
		$out[] = ams_timer_log_file();

		echo implode( "\n", $out ) . "\n";
		exit;
	},
	PHP_INT_MAX
);
