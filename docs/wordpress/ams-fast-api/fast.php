<?php
/**
 * AMS FAST READ PATH — direct-SQL endpoint for the admin dashboard.
 * =============================================================================
 *
 * WHY THIS EXISTS
 * A WP REST call on this server costs ~3,900 ms before it does any work: 63
 * plugins load (~1,200 ms) and their hooks run (~2,000 ms). None of that is the
 * data layer. Booting with SHORTINIT loads WordPress's database layer and stops
 * — measured at 145 ms — after which the same rows come back in tens of
 * milliseconds. Measured end to end: 295.7 ms vs ~3,900 ms.
 *
 * This file is hit DIRECTLY by URL. It is never registered as a REST route,
 * because registering it would pay the 3,900 ms again:
 *
 *   GET /wp-content/plugins/ams-fast-api/fast.php?r=posts&page=1
 *   Header: X-AMS-Token: <the same token ams-frontend-api mints at web/login>
 *
 * READ-ONLY: every statement in this file is a SELECT.
 *
 * RESOURCES (?r=): posts, dashboard, categories, tags, authors, users, media,
 * programs, roles (1.1.0 — every admin LIST screen), plus settings, profile,
 * featured, program, episode, episodes (1.2.0 — the single-item editor reads),
 * plus whoami and diag. PUBLIC (no token — see the pub- section): pub-articles
 * (1.3.0), pub-categories + pub-programs (1.4.0), pub-menu (1.5.0; its icon
 * resolution fixed in 1.5.1 — see the pub-menu header), pub-comment-counts
 * (1.5.2), pub-authors (1.5.3 — the only pub- resource serving USER rows;
 * read its boundary note before touching it).
 * The `dashboard` payload was rebuilt in 1.6.0 (daily series, review-queue age,
 * draft pipeline, author leaderboard, programs in the activity feed) and its
 * counts are now capability-scoped rather than author-scoped — see that
 * resource's header for what the old shape got wrong and how it was measured.
 * 1.7.0 adds `trending` to the same payload: the top-5 ranking again, over a
 * FIXED 24-hour window that ignores the range control. 1.8.0 adds `today`
 * (views since midnight vs yesterday-to-the-same-clock-time, stories filed
 * today, most-read of the last hour; 120s memo), `queue.comments` (moderation
 * queue, moderate_comments-gated), and CUSTOM windows: ?from/?to (Y-m-d,
 * inclusive, span clamped to 90 days) override ?days for the series, top list
 * and leaderboard, while the KPI cards stay pinned to 7-vs-prior-7 ending
 * today via their own mini-series. 1.8.1: program posters resolve large-first
 * (large -> medium -> full) so the admin grid stops upscaling the 300px medium.
 * Gates: users + roles require list_users; media requires edit_posts;
 * settings requires manage_options; programs/program/episode require the
 * (derived) program caps; profile is always the token's own user.
 * See each ams_fast_res_*().
 *
 * NOT HERE, deliberately: the ARTICLE editor's body. It loads
 * content.rendered, which REST produces via the `the_content` filter chain
 * (do_blocks included) — and no filters run under SHORTINIT. `?r=diag`
 * reports contentShape so that claim stays measured rather than assumed.
 *
 * -----------------------------------------------------------------------------
 * THE FOUR LAYERS, in the order a request passes through them
 * -----------------------------------------------------------------------------
 *   1. TOKEN AUTH      — verify the X-AMS-Token HMAC without wp_salt(), which
 *                        SHORTINIT does not load. See ams_fast_salt_auth().
 *   2. USER CAPS       — read the user's roles + caps straight out of usermeta
 *                        and the {prefix}user_roles option, because
 *                        wp_get_current_user() does not exist here.
 *   3. VISIBILITY      — scope every query to what WordPress itself would let
 *                        this user read. THIS IS THE PART THAT MATTERS. On the
 *                        REST path WordPress enforces it for us; here we do it
 *                        ourselves, so a mistake is a data leak, not a bug.
 *   4. CACHE           — Object Cache Pro's Redis drop-in DOES load under
 *                        SHORTINIT, so reference lookups can be memoised.
 *
 * -----------------------------------------------------------------------------
 * WHAT DOES NOT EXIST HERE (SHORTINIT), and what we do instead
 * -----------------------------------------------------------------------------
 *   get_post() / get_post_meta() / WP_Query  -> hand-written SQL via $wpdb
 *   wp_get_current_user()                    -> ams_fast_load_user()
 *   wp_salt() / wp_hash()                    -> ams_fast_salt_auth()
 *   the_title / wp_get_attachment_url filters-> not run at all; see IMAGES below
 *
 * AVAILABLE: $wpdb, get_option(), apply_filters(), sanitize_text_field(),
 * wp_cache_*() incl. the external object cache, and the AUTH_* salt constants.
 *
 * -----------------------------------------------------------------------------
 * IMAGES — the one genuinely awkward part
 * -----------------------------------------------------------------------------
 * Media on this site is offloaded to S3 (KH Offloader -> https://s3.ams.com.kh,
 * bucket "infotainment", path-style, no path prefix, no file versioning). WP
 * REST returns S3 URLs only because the offloader FILTERS them at runtime —
 * and filters do not run here.
 *
 * We cannot simply prefix everything with the CDN base: as of 2026-08-04,
 * 114,763 of 115,405 attachments are offloaded and 642 are NOT. Those 642 live
 * only on local disk, so a CDN URL for them 404s. Conversely 113,403 records
 * were migrated in from the older WP Offload Media plugin, whose local copies
 * may already have been deleted, so a local URL for those can 404 too.
 *
 * So the offloaded/not decision is per attachment and must come from the
 * database. Rather than hard-code a meta key guessed from a plugin we cannot
 * read, ams_fast_attachment_base() DISCOVERS it: it looks, in order, for (a) a
 * stored absolute URL on the CDN host, (b) an offload marker key, then falls
 * back to the local uploads URL. Every row reports which branch fired, so
 * `?r=diag` can show what actually happened on real data and this can be
 * tightened to the real key once observed instead of left generic.
 *
 * -----------------------------------------------------------------------------
 * DELIBERATE DIFFERENCES FROM THE WP REST PATH (verify these, do not assume)
 * -----------------------------------------------------------------------------
 *  - TITLES are raw post_title. REST returns them through the `the_title`
 *    filter chain (wptexturize -> convert_chars -> trim, plus anything the 63
 *    plugins add), so curly quotes and similar cosmetics can differ.
 *  - PER-ROW VISIBILITY is enforced in SQL. WP REST runs the query unscoped and
 *    then drops unreadable rows from the page in PHP, which means its pages can
 *    come back short and its X-WP-Total counts rows the user cannot see. Ours
 *    filters in the WHERE clause, so counts and page sizes are correct. This is
 *    a divergence in the SAFE direction, but it IS a divergence.
 *  - SEARCH works here. Native REST search is blocked site-wide on this install
 *    (403 "Native WordPress search is disabled"), so there is nothing to
 *    compare it against.
 *  - CATEGORY filtering matches the term only, not its children.
 *  - `after` is exclusive (post_date > x), matching WP_Date_Query's default.
 *
 * -----------------------------------------------------------------------------
 * MAINTENANCE
 * -----------------------------------------------------------------------------
 * This is a SECOND data path. The SQL here must track the same meta keys
 * ams-frontend-api's writes produce. When it is proven, fold this file into the
 * ams-frontend-api plugin folder so the two deploy as one artifact.
 *
 * The pure functions below are unit-tested WITHOUT a server or a database:
 * see tests.php in this folder, which loads this file with AMS_FAST_LIB_ONLY
 * defined and checks the auth math against ams-frontend-api's own signer.
 */

/* ===========================================================================
 * CONFIGURATION
 * ======================================================================== */

/** Gate for ?r=diag. Server internals only, never user data — but rotate it if
 *  it leaks, and delete this plugin when the fast path is proven. */
if ( ! defined( 'AMS_FAST_DIAG_TOKEN' ) ) {
	define( 'AMS_FAST_DIAG_TOKEN', 'e17e37f1c180b631050c637c3a7e0713' );
}

/** KH Offloader -> Custom Domain (CDN URL), verbatim, no trailing slash.
 *  Override in wp-config.php if the bucket or domain ever changes. */
if ( ! defined( 'AMS_FAST_CDN_BASE' ) ) {
	define( 'AMS_FAST_CDN_BASE', 'https://s3.ams.com.kh/infotainment' );
}

/** Object-cache group + a version prefix. Bump the version to invalidate every
 *  entry this file wrote, without touching anything else in Redis. */
define( 'AMS_FAST_CACHE_GROUP', 'ams_fast' );
define( 'AMS_FAST_CACHE_VER', 'v1' );

/** Reference data only (author names, term names): slow-moving and identical
 *  for every viewer. Post ROWS are deliberately NOT cached — see the note above
 *  ams_fast_res_posts(). */
define( 'AMS_FAST_TTL_REFERENCE', 300 );

/** Hard ceiling on rows per request, mirroring REST's per_page cap. */
define( 'AMS_FAST_MAX_PER_PAGE', 100 );

// A stray warning printed before the headers would corrupt the JSON body.
@ini_set( 'display_errors', '0' );

$AMS_FAST_T0        = microtime( true );
$AMS_FAST_BOOT_MS   = 0.0;

/* ===========================================================================
 * OUTPUT / SMALL HELPERS
 * ======================================================================== */

function ams_fast_ms( $seconds ) {
	return round( $seconds * 1000, 1 );
}

/** Emit JSON and stop. Every exit from this file goes through here. */
function ams_fast_out( $status, array $payload ) {
	global $AMS_FAST_T0;

	$started = isset( $_SERVER['REQUEST_TIME_FLOAT'] ) ? (float) $_SERVER['REQUEST_TIME_FLOAT'] : $AMS_FAST_T0;

	if ( ! isset( $payload['ms'] ) ) {
		$payload['ms'] = array();
	}
	$payload['ms']['total'] = ams_fast_ms( microtime( true ) - $started );

	http_response_code( $status );
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Cache-Control: no-store, private' );
	header( 'X-Robots-Tag: noindex, nofollow' );

	echo json_encode(
		$payload,
		JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
	);
	exit;
}

/** One shape for every failure. `reason` is a stable machine-readable string —
 *  the frontend logs it, and it is what makes a 401 diagnosable in one round
 *  trip instead of three. It never contains a secret.
 *
 *  The real code rides in the BODY (`status`), and the HTTP status is 200 for
 *  everything except auth: this host swaps the body of 4xx responses for its
 *  own HTML error page (observed live, 2026-08-04: our JSON 404 for an unknown
 *  resource arrived as text/html), which downgraded every reason to
 *  "unparseable" on the frontend. Auth failures stay a real 401 — the
 *  frontend's session contract keys on that status alone and needs no body. */
function ams_fast_fail( $status, $reason, $detail = '' ) {
	$out = array( 'ok' => false, 'reason' => $reason, 'status' => (int) $status );
	if ( '' !== $detail ) {
		$out['detail'] = $detail;
	}
	ams_fast_out( 401 === (int) $status ? 401 : 200, $out );
}

function ams_fast_param( $key, $default = '' ) {
	return isset( $_GET[ $key ] ) ? (string) $_GET[ $key ] : $default;
}

function ams_fast_int_param( $key, $default = 0 ) {
	return isset( $_GET[ $key ] ) ? (int) $_GET[ $key ] : $default;
}

/** unserialize() with object instantiation disabled. Everything we read is our
 *  own database, but a read path should never be the thing that turns a
 *  compromised row into code execution. */
function ams_fast_unserialize( $raw ) {
	if ( ! is_string( $raw ) || '' === $raw ) {
		return array();
	}
	$value = @unserialize( $raw, array( 'allowed_classes' => false ) );
	return is_array( $value ) ? $value : array();
}

/** De-duplicated positive ints, for an IN () clause. */
function ams_fast_id_list( array $ids ) {
	$clean = array();
	foreach ( $ids as $id ) {
		$id = (int) $id;
		if ( $id > 0 ) {
			$clean[ $id ] = $id;
		}
	}
	return array_values( $clean );
}

function ams_fast_placeholders( array $values, $type = '%d' ) {
	return implode( ',', array_fill( 0, count( $values ), $type ) );
}

/* ===========================================================================
 * 1. TOKEN AUTH
 * ---------------------------------------------------------------------------
 * Reproduces ams-frontend-api's scheme exactly:
 *
 *   token = base64url({"uid":<id>,"exp":<unix>,"v":1}) "." base64url(sig)
 *   sig   = HMAC-SHA256(body, key)
 *   key   = HMAC-SHA256("<id>|<4 chars of user_pass from offset 8>",
 *                       wp_salt('auth'))
 *
 * wp_salt() itself is absent here, so ams_fast_salt_auth() reimplements the
 * 'auth' scheme from the constants. The fold-in of four characters of the
 * password hash is what makes a password change invalidate live tokens, so it
 * must be read fresh from the database on every request — which is also why
 * none of this is cached. Two primary-key lookups are worth far less than the
 * "log out everywhere" guarantee they preserve.
 * ======================================================================== */

function ams_fast_b64url_decode( $str ) {
	$b64 = strtr( (string) $str, '-_', '+/' );
	$pad = strlen( $b64 ) % 4;
	if ( $pad ) {
		$b64 .= str_repeat( '=', 4 - $pad );
	}
	return base64_decode( $b64, true );
}

/**
 * Split the token and read its claims WITHOUT verifying the signature — that
 * needs the database. Returns array(body, sig, uid, exp) or null.
 */
function ams_fast_token_claims( $token ) {
	if ( ! is_string( $token ) || substr_count( $token, '.' ) !== 1 ) {
		return null;
	}
	list( $body, $sig_b64 ) = explode( '.', $token, 2 );

	$json = ams_fast_b64url_decode( $body );
	$sig  = ams_fast_b64url_decode( $sig_b64 );
	if ( false === $json || false === $sig || '' === $sig ) {
		return null;
	}
	$payload = json_decode( $json, true );
	if ( ! is_array( $payload ) || empty( $payload['uid'] ) || empty( $payload['exp'] ) ) {
		return null;
	}
	return array(
		'body' => $body,
		'sig'  => $sig,
		'uid'  => (int) $payload['uid'],
		'exp'  => (int) $payload['exp'],
	);
}

/**
 * wp_salt('auth') without wp_salt(). Mirrors core including the duplicated-key
 * guard: if wp-config was generated badly and two constants share a value, core
 * ignores them and falls back to the stored site options, so we must too or
 * every signature would mismatch.
 *
 * NOT reproducible here: the `salt` filter. If a plugin filters salts, tokens
 * minted by ams-frontend-api will not verify — which shows up as reason
 * "bad_signature" for every user, not as a subtle bug.
 */
function ams_fast_salt_constant_names() {
	return array(
		'AUTH_KEY',
		'AUTH_SALT',
		'SECURE_AUTH_KEY',
		'SECURE_AUTH_SALT',
		'LOGGED_IN_KEY',
		'LOGGED_IN_SALT',
		'NONCE_KEY',
		'NONCE_SALT',
		'SECRET_KEY',
		'SECRET_SALT',
	);
}

/**
 * The pure half, so the branches can be unit-tested: given the defined salt
 * constants as name => value, return array($key, $salt). An empty string means
 * "not resolvable from constants" — core falls back to the stored site option
 * there, and so does the wrapper below.
 */
function ams_fast_salt_parts( array $constants ) {
	$duplicated = array( 'put your unique phrase here' => true );
	foreach ( array( 'AUTH', 'SECURE_AUTH', 'LOGGED_IN', 'NONCE' ) as $first ) {
		foreach ( array( 'KEY', 'SALT' ) as $second ) {
			$name = $first . '_' . $second;
			if ( ! isset( $constants[ $name ] ) ) {
				continue;
			}
			$value                = (string) $constants[ $name ];
			$duplicated[ $value ] = isset( $duplicated[ $value ] );
		}
	}

	$usable = function ( $name ) use ( $constants, $duplicated ) {
		if ( empty( $constants[ $name ] ) ) {
			return '';
		}
		$value = (string) $constants[ $name ];
		return empty( $duplicated[ $value ] ) ? $value : '';
	};

	// Legacy SECRET_* first, then AUTH_* wins where it is usable — core's order.
	$key  = $usable( 'SECRET_KEY' );
	$salt = $usable( 'SECRET_SALT' );

	$auth_key  = $usable( 'AUTH_KEY' );
	$auth_salt = $usable( 'AUTH_SALT' );
	if ( '' !== $auth_key ) {
		$key = $auth_key;
	}
	if ( '' !== $auth_salt ) {
		$salt = $auth_salt;
	}

	return array( $key, $salt );
}

function ams_fast_salt_auth() {
	static $cached = null;
	if ( null !== $cached ) {
		return $cached;
	}

	$constants = array();
	foreach ( ams_fast_salt_constant_names() as $name ) {
		if ( defined( $name ) ) {
			$constants[ $name ] = (string) constant( $name );
		}
	}

	list( $key, $salt ) = ams_fast_salt_parts( $constants );

	if ( '' === $key && function_exists( 'get_site_option' ) ) {
		$key = (string) get_site_option( 'auth_key' );
	}
	if ( '' === $salt && function_exists( 'get_site_option' ) ) {
		$salt = (string) get_site_option( 'auth_salt' );
	}

	$cached = $key . $salt;
	return $cached;
}

/** The per-user signing key. Mirrors ams_afa_login_key(). */
function ams_fast_login_key( $user_id, $user_pass ) {
	$pass_frag = substr( (string) $user_pass, 8, 4 );
	return hash_hmac( 'sha256', $user_id . '|' . $pass_frag, ams_fast_salt_auth() );
}

/** The user row the token names, or null. Deliberately uncached — see above. */
function ams_fast_load_user( $uid ) {
	global $wpdb, $T_USERS;
	return $wpdb->get_row(
		$wpdb->prepare( "SELECT ID, user_login, user_pass, display_name FROM $T_USERS WHERE ID = %d LIMIT 1", $uid )
	);
}

/** Constant-time signature check. */
function ams_fast_verify( $user, array $claims ) {
	$key      = ams_fast_login_key( $user->ID, $user->user_pass );
	$expected = hash_hmac( 'sha256', $claims['body'], $key, true );
	return hash_equals( $expected, $claims['sig'] );
}

/* ===========================================================================
 * 2. USER CAPS
 * ---------------------------------------------------------------------------
 * WP_User is absent, so flatten roles + per-user caps by hand, the way
 * WP_User::get_role_caps() does: role capabilities first, then the user's own
 * capabilities array on top (which can also REVOKE, by holding false).
 *
 * NOT reproduced: map_meta_cap, and ams-frontend-api's own `user_has_cap`
 * filter (the one that derives edit_others_movies from edit_movies). That
 * filter is irrelevant to posts but WILL matter when the programs screens move
 * to this path — do not assume the caps below are the whole story for movies,
 * tv_shows or episodes.
 * ======================================================================== */

/** Pure half of the caps logic, so it can be tested without a database.
 *  $assigned is the unserialized {prefix}capabilities usermeta value;
 *  $all_roles is the {prefix}user_roles option. */
function ams_fast_flatten_caps( array $assigned, array $all_roles ) {
	$caps  = array();
	$roles = array();

	// Role capabilities first.
	foreach ( $assigned as $name => $granted ) {
		if ( ! $granted || ! isset( $all_roles[ $name ]['capabilities'] ) ) {
			continue;
		}
		$roles[] = (string) $name;
		foreach ( (array) $all_roles[ $name ]['capabilities'] as $cap => $has ) {
			if ( $has ) {
				$caps[ $cap ] = true;
			}
		}
	}

	// Then the user's own entries, which override — including removals.
	foreach ( $assigned as $name => $granted ) {
		if ( isset( $all_roles[ $name ] ) ) {
			continue; // a role, already expanded
		}
		if ( $granted ) {
			$caps[ $name ] = true;
		} else {
			unset( $caps[ $name ] );
		}
	}

	return array( 'roles' => $roles, 'caps' => $caps );
}

function ams_fast_load_caps( $uid ) {
	global $wpdb, $T_USERMETA;

	$raw = $wpdb->get_var(
		$wpdb->prepare(
			"SELECT meta_value FROM $T_USERMETA WHERE user_id = %d AND meta_key = %s LIMIT 1",
			$uid,
			$wpdb->prefix . 'capabilities'
		)
	);

	$all_roles = get_option( $wpdb->prefix . 'user_roles' );

	return ams_fast_flatten_caps(
		ams_fast_unserialize( $raw ),
		is_array( $all_roles ) ? $all_roles : array()
	);
}

function ams_fast_can( array $caps, $cap ) {
	return ! empty( $caps[ $cap ] );
}

/* ===========================================================================
 * 3. VISIBILITY
 * ---------------------------------------------------------------------------
 * The security boundary. WordPress's REST controller does this in two places:
 * handle_status_param() rejects a status the user may not read at all, and
 * check_read_permission() drops individual rows afterwards. We fold both into
 * the WHERE clause.
 *
 * The rule for a user WITHOUT edit_others_posts (every Author on this site —
 * 12 of them) is simply: published posts, plus their own. Anything else is a
 * leak. It is written as one clause on purpose; a rule you can read in a single
 * line is a rule you can be sure about.
 * ======================================================================== */

/** Statuses this endpoint will serve at all. Anything else is a 400 rather than
 *  a silently empty list. */
function ams_fast_known_statuses() {
	return array( 'publish', 'draft', 'pending', 'future', 'private' );
}

/**
 * Mirror of handle_status_param(): may this user ask for this status?
 * Returns '' when allowed, or the reason it is not.
 */
function ams_fast_status_denied( $status, array $caps ) {
	if ( 'publish' === $status ) {
		return '';
	}
	if ( 'private' === $status ) {
		return ams_fast_can( $caps, 'read_private_posts' ) ? '' : 'cannot_read_status';
	}
	// draft / pending / future
	return ams_fast_can( $caps, 'edit_posts' ) ? '' : 'cannot_read_status';
}

/* ===========================================================================
 * 4. CACHE
 * ---------------------------------------------------------------------------
 * Object Cache Pro's drop-in loads under SHORTINIT, so this is the same Redis
 * WordPress itself uses. Used ONLY for reference data. Writes still go through
 * WP REST, which knows nothing about these keys, so anything cached here goes
 * stale with no way to bust it — fine for author and term names, emphatically
 * not fine for post rows.
 * ======================================================================== */

function ams_fast_cache_get( $key, &$hit ) {
	$hit = false;
	if ( ! function_exists( 'wp_cache_get' ) ) {
		return false;
	}
	$found = null;
	$value = wp_cache_get( AMS_FAST_CACHE_VER . ':' . $key, AMS_FAST_CACHE_GROUP, false, $found );
	$hit   = ( false !== $value && null !== $value );
	return $value;
}

function ams_fast_cache_set( $key, $value, $ttl ) {
	if ( function_exists( 'wp_cache_set' ) ) {
		wp_cache_set( AMS_FAST_CACHE_VER . ':' . $key, $value, AMS_FAST_CACHE_GROUP, (int) $ttl );
	}
	return $value;
}

/* ===========================================================================
 * IMAGES — resolve an attachment's thumbnail URL from database rows alone
 * ======================================================================== */

/** Uploads base for files that were never offloaded. */
function ams_fast_local_uploads_base() {
	static $base = null;
	if ( null !== $base ) {
		return $base;
	}
	$custom = function_exists( 'get_option' ) ? (string) get_option( 'upload_url_path' ) : '';
	if ( '' !== $custom ) {
		$base = rtrim( $custom, '/' );
		return $base;
	}
	$siteurl = function_exists( 'get_option' ) ? (string) get_option( 'siteurl' ) : '';
	$base    = rtrim( $siteurl, '/' ) . '/wp-content/uploads';
	return $base;
}

/** Meta values are strings out of the database; "0" is not truthy. */
function ams_fast_truthy( $value ) {
	if ( is_string( $value ) ) {
		return '' !== $value && '0' !== $value;
	}
	return (bool) $value;
}

/**
 * Decide, from an attachment's meta rows, whether it lives on the CDN.
 *
 * The keys below were read off the live database rather than guessed — the
 * install carries, per offloaded attachment: khs3data_offloaded ("1"),
 * khs3data_path ("2026/07/"), khs3data_bucket, khs3data_provider ("CephAMS").
 *
 * Note what is NOT consulted: `_khs3data_webp_size_files`. That records webp
 * variants the offloader generated, which is a different question from whether
 * the file was uploaded to S3 — an earlier version of this function keyed off
 * any khs3-ish meta key and got the right answer on offloaded files purely by
 * accident, while it would have sent a webp-converted but NOT offloaded file to
 * a CDN URL that 404s. That is exactly the ~642-file case this must protect.
 *
 * $meta is meta_key => meta_value for ONE attachment; $local_base is passed in
 * rather than looked up so this stays testable without WordPress. Returns
 * array(base, how, dir_override) — dir_override is null to mean "derive the
 * directory from _wp_attached_file".
 */
function ams_fast_attachment_base( array $meta, $local_base ) {
	// 1. KH Offloader — the definitive signal on this install.
	if ( isset( $meta['khs3data_offloaded'] ) && ams_fast_truthy( $meta['khs3data_offloaded'] ) ) {
		$dir = isset( $meta['khs3data_path'] ) ? trim( (string) $meta['khs3data_path'], '/' ) : '';
		return array( AMS_FAST_CDN_BASE, 'khs3data', '' === $dir ? null : $dir . '/' );
	}

	// 2. WP Offload Media, for any row that predates the 113,403-record
	//    migration into KH Offloader's own metadata.
	if ( isset( $meta['amazonS3_info'] ) ) {
		$info = ams_fast_unserialize( $meta['amazonS3_info'] );
		if ( ! empty( $info['key'] ) ) {
			$dir = dirname( (string) $info['key'] );
			return array( AMS_FAST_CDN_BASE, 'amazonS3_info', ( '.' === $dir || '' === $dir ) ? null : $dir . '/' );
		}
	}

	// 3. Anything else that stored an absolute URL on the CDN host.
	$cdn_host = parse_url( AMS_FAST_CDN_BASE, PHP_URL_HOST );
	if ( $cdn_host ) {
		foreach ( $meta as $key => $value ) {
			if ( '_wp_attached_file' === $key || '_wp_attachment_metadata' === $key || ! is_string( $value ) ) {
				continue;
			}
			if ( 0 === strpos( ltrim( $value ), 'http' ) && false !== strpos( $value, $cdn_host ) ) {
				return array( AMS_FAST_CDN_BASE, 'url:' . $key, null );
			}
		}
	}

	// 4. Never offloaded — one of the ~642 that exist only on local disk.
	return array( $local_base, 'local', null );
}

/**
 * URL for one attachment at a preferred size, matching what REST's
 * media_details.sizes.<size>.source_url would say: the first size in $sizes
 * that exists in the attachment metadata, otherwise the full-size file.
 * The default single-entry chain is the thumbnail crop, verified byte-for-byte
 * against REST on live attachments 221987 / 221990 / 221991. Pass array() to
 * always get the full-size file (REST's source_url).
 */
function ams_fast_attachment_url( array $meta, $local_base, &$how, array $sizes = array( 'thumbnail' ) ) {
	$how  = 'none';
	$file = isset( $meta['_wp_attached_file'] ) ? (string) $meta['_wp_attached_file'] : '';
	if ( '' === $file ) {
		return '';
	}

	list( $base, $how, $dir ) = ams_fast_attachment_base( $meta, $local_base );

	if ( null === $dir ) {
		$dir = dirname( $file );
		$dir = ( '.' === $dir || '' === $dir ) ? '' : $dir . '/';
	}

	$data = ams_fast_unserialize( isset( $meta['_wp_attachment_metadata'] ) ? $meta['_wp_attachment_metadata'] : '' );
	$name = basename( $file );
	foreach ( $sizes as $size ) {
		if ( ! empty( $data['sizes'][ $size ]['file'] ) ) {
			$name = (string) $data['sizes'][ $size ]['file'];
			break;
		}
	}

	return $base . '/' . $dir . $name;
}

/** REST's media_type for an attachment row: 'image' or 'file' — the only two
 *  values WP_REST_Attachments_Controller ever emits (video/audio are 'file'). */
function ams_fast_media_type( $mime ) {
	return 0 === strpos( (string) $mime, 'image/' ) ? 'image' : 'file';
}

/* ===========================================================================
 * PROGRAM CAPS — ams-frontend-api's runtime user_has_cap grant, reproduced
 * ---------------------------------------------------------------------------
 * MasVideos' movie / tv_show / episode capability checks are answered at
 * runtime by ams_afa_program_caps_filter() (plugin ≥1.7.2) — a filter, so it
 * DOES NOT RUN under SHORTINIT. The stored caps ams_fast_load_caps() returns
 * are therefore not the whole story for program types, and this function is
 * the port of that filter: same regexes, same derivation, so the two paths
 * answer capability questions identically.
 *
 *   - administrators pass ANY cap ending in _movie(s)/_tv_show(s)/_episode(s)
 *   - (edit|delete)_(others|published|private)_X derives from stored edit_X /
 *     delete_X;  read_private_X derives from stored edit_X
 *   - roles with no program caps gain nothing
 * ======================================================================== */

function ams_fast_can_program( array $caps, array $roles, $cap ) {
	if ( ! empty( $caps[ $cap ] ) ) {
		return true; // stored on the role/user — no derivation needed
	}
	if ( ! preg_match( '/_(movies?|tv_shows?|episodes?)$/', $cap ) ) {
		return false; // not a program cap; stored caps already answered above
	}
	if ( in_array( 'administrator', $roles, true ) ) {
		return true;
	}
	if ( preg_match( '/^(edit|delete)_(?:others|published|private)_(movies?|tv_shows?|episodes?)$/', $cap, $m ) ) {
		$base = $m[1] . '_' . $m[2];
	} elseif ( preg_match( '/^read_private_(movies?|tv_shows?|episodes?)$/', $cap, $m ) ) {
		$base = 'edit_' . $m[1];
	} else {
		return false;
	}
	return ! empty( $caps[ $base ] );
}

/* ===========================================================================
 * USER/ROLE HELPERS — pure halves, unit-tested in tests.php
 * ======================================================================== */

/** The role slugs a {prefix}capabilities usermeta value assigns, in stored
 *  order — WP_User->roles. Entries that are not registered roles are per-user
 *  caps, not roles. */
function ams_fast_assigned_roles( array $assigned, array $all_roles ) {
	$roles = array();
	foreach ( $assigned as $name => $granted ) {
		if ( $granted && isset( $all_roles[ $name ] ) ) {
			$roles[] = (string) $name;
		}
	}
	return $roles;
}

/** count_users()'s avail_roles, from every user's raw capabilities meta value:
 *  role slug => how many users hold it (a user with two roles counts in both). */
function ams_fast_count_roles( array $raw_meta_values, array $all_roles ) {
	$counts = array();
	foreach ( array_keys( $all_roles ) as $slug ) {
		$counts[ $slug ] = 0;
	}
	foreach ( $raw_meta_values as $raw ) {
		foreach ( ams_fast_assigned_roles( ams_fast_unserialize( $raw ), $all_roles ) as $slug ) {
			$counts[ $slug ]++;
		}
	}
	return $counts;
}

/* ===========================================================================
 * RESOURCE: posts — the admin Articles list
 * ---------------------------------------------------------------------------
 * Five queries, none of them N+1: the total, the page of posts, its authors,
 * its category names, and its featured images. Deliberately NOT cached: a
 * shared cache under Next's own bustable cache would be a staleness we cannot
 * invalidate, since writes go through WP REST and never touch this file. The
 * queries are tens of milliseconds; the boot is the cost, and caching cannot
 * remove it.
 * ======================================================================== */

function ams_fast_res_posts( array $user, array $caps ) {
	global $wpdb, $T_POSTS, $T_POSTMETA, $T_USERS, $T_TERMS, $T_TERMTAX, $T_TERMREL, $AMS_FAST_BOOT_MS;

	/* ---- parameters ---- */

	$page     = max( 1, ams_fast_int_param( 'page', 1 ) );
	$per_page = max( 1, min( AMS_FAST_MAX_PER_PAGE, ams_fast_int_param( 'per_page', 10 ) ) );

	$statuses = array_values( array_filter( array_map( 'trim', explode( ',', ams_fast_param( 'status', 'publish,draft,pending' ) ) ) ) );
	if ( ! $statuses ) {
		ams_fast_fail( 400, 'no_status' );
	}
	foreach ( $statuses as $status ) {
		if ( ! in_array( $status, ams_fast_known_statuses(), true ) ) {
			ams_fast_fail( 400, 'unknown_status', $status );
		}
		$denied = ams_fast_status_denied( $status, $caps );
		if ( '' !== $denied ) {
			ams_fast_fail( 403, $denied, $status );
		}
	}

	$category = ams_fast_int_param( 'category', 0 );
	$author   = ams_fast_int_param( 'author', 0 );
	$after    = ams_fast_param( 'after' );
	$search   = trim( ams_fast_param( 'q' ) );
	$orderby  = ( 'modified' === ams_fast_param( 'orderby', 'date' ) ) ? 'post_modified' : 'post_date';

	/* ---- WHERE, shared by the page query and the count ---- */

	$where  = array( "p.post_type = 'post'" );
	$params = array();

	$where[] = 'p.post_status IN (' . ams_fast_placeholders( $statuses, '%s' ) . ')';
	$params  = array_merge( $params, $statuses );

	// THE VISIBILITY CLAUSE. Everything else here is a filter; this is the gate.
	$scope = 'all';
	if ( ! ams_fast_can( $caps, 'edit_others_posts' ) ) {
		$scope    = 'own';
		$where[]  = "(p.post_status = 'publish' OR p.post_author = %d)";
		$params[] = (int) $user['id'];
	}

	if ( $author > 0 ) {
		$where[]  = 'p.post_author = %d';
		$params[] = $author;
	}

	if ( '' !== $after ) {
		// Exclusive, matching WP_Date_Query's default when `inclusive` is unset.
		$where[]  = 'p.post_date > %s';
		$params[] = str_replace( 'T', ' ', $after );
	}

	if ( $category > 0 ) {
		$where[]  = "p.ID IN (
			SELECT tr.object_id FROM $T_TERMREL tr
			INNER JOIN $T_TERMTAX tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
			WHERE tt.taxonomy = 'category' AND tt.term_id = %d
		)";
		$params[] = $category;
	}

	if ( '' !== $search ) {
		// WP's own shape: every term must appear in the title, excerpt or body.
		foreach ( preg_split( '/\s+/', $search ) as $term ) {
			if ( '' === $term ) {
				continue;
			}
			$like     = '%' . $wpdb->esc_like( $term ) . '%';
			$where[]  = '(p.post_title LIKE %s OR p.post_excerpt LIKE %s OR p.post_content LIKE %s)';
			$params[] = $like;
			$params[] = $like;
			$params[] = $like;
		}
	}

	$where_sql = implode( ' AND ', $where );

	/* ---- the total, and the page ---- */

	$t0    = microtime( true );
	$total = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $T_POSTS p WHERE $where_sql", $params ) );

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT p.ID, p.post_title, p.post_status, p.post_date, p.post_author, p.post_name
			 FROM $T_POSTS p
			 WHERE $where_sql
			 ORDER BY p.$orderby DESC
			 LIMIT %d OFFSET %d",
			array_merge( $params, array( $per_page, ( $page - 1 ) * $per_page ) )
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	$t0 = microtime( true );
	list( $items, $thumb_how ) = ams_fast_hydrate_posts( (array) $rows );
	$ms_extras = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'posts',
			'user'     => array( 'id' => $user['id'], 'scope' => $scope ),
			'data'     => array(
				'items'      => $items,
				'total'      => $total,
				'totalPages' => (int) ceil( $total / $per_page ),
				'page'       => $page,
			),
			'debug'    => array( 'thumbSource' => $thumb_how ),
			'ms'       => array(
				'boot'   => $AMS_FAST_BOOT_MS,
				'rows'   => $ms_rows,
				'extras' => $ms_extras,
			),
		)
	);
}

/**
 * Display names for a set of user ids, memoised briefly — slow-moving
 * reference data, identical for every viewer.
 */
function ams_fast_author_names( array $author_ids ) {
	global $wpdb, $T_USERS;

	$author_names = array();
	if ( $author_ids ) {
		$cache_key = 'authors:' . md5( implode( ',', $author_ids ) );
		$cached    = ams_fast_cache_get( $cache_key, $hit );
		if ( $hit && is_array( $cached ) ) {
			$author_names = $cached;
		} else {
			$found = $wpdb->get_results(
				$wpdb->prepare(
					'SELECT ID, display_name FROM ' . $T_USERS . ' WHERE ID IN (' . ams_fast_placeholders( $author_ids ) . ')',
					$author_ids
				)
			);
			foreach ( (array) $found as $u ) {
				$author_names[ (int) $u->ID ] = (string) $u->display_name;
			}
			ams_fast_cache_set( $cache_key, $author_names, AMS_FAST_TTL_REFERENCE );
		}
	}
	return $author_names;
}

/**
 * Turn bare post rows (ID, post_title, post_status, post_date, post_author,
 * post_name) into the frontend's item shape — author names, category names and
 * thumbnail URLs resolved in one query each, never N+1. Shared by ?r=posts and
 * the dashboard's recent-activity list so the two cannot drift.
 * Returns array( $items, $thumb_how ).
 */
function ams_fast_hydrate_posts( array $rows ) {
	global $wpdb, $T_POSTMETA, $T_TERMS, $T_TERMTAX, $T_TERMREL;

	$ids        = array();
	$author_ids = array();
	foreach ( $rows as $row ) {
		$ids[]        = (int) $row->ID;
		$author_ids[] = (int) $row->post_author;
	}
	$ids        = ams_fast_id_list( $ids );
	$author_ids = ams_fast_id_list( $author_ids );

	$author_names = ams_fast_author_names( $author_ids );

	$category_names = array();
	if ( $ids ) {
		$terms = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT tr.object_id, t.name
				 FROM $T_TERMREL tr
				 INNER JOIN $T_TERMTAX tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
				 INNER JOIN $T_TERMS t ON t.term_id = tt.term_id
				 WHERE tr.object_id IN (" . ams_fast_placeholders( $ids ) . ") AND tt.taxonomy = 'category'
				 ORDER BY t.name ASC",
				$ids
			)
		);
		foreach ( (array) $terms as $term ) {
			$category_names[ (int) $term->object_id ][] = (string) $term->name;
		}
	}

	// Featured images: post -> _thumbnail_id, then every meta row for those
	// attachments (all of them, because which key marks "offloaded" is
	// discovered rather than assumed — see ams_fast_attachment_base()).
	$thumbs    = array();
	$thumb_how = array();
	if ( $ids ) {
		$thumb_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_value FROM $T_POSTMETA
				 WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ") AND meta_key = '_thumbnail_id'",
				$ids
			)
		);
		$by_post = array();
		foreach ( (array) $thumb_rows as $row ) {
			$att = (int) $row->meta_value;
			if ( $att > 0 ) {
				$by_post[ (int) $row->post_id ] = $att;
			}
		}

		$att_ids = ams_fast_id_list( array_values( $by_post ) );
		if ( $att_ids ) {
			$meta_rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $att_ids ) . ')',
					$att_ids
				)
			);
			$att_meta = array();
			foreach ( (array) $meta_rows as $row ) {
				$att_meta[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
			}
			$local_base = ams_fast_local_uploads_base();
			foreach ( $by_post as $post_id => $att_id ) {
				if ( isset( $att_meta[ $att_id ] ) ) {
					$thumbs[ $post_id ]    = ams_fast_attachment_url( $att_meta[ $att_id ], $local_base, $how );
					$thumb_how[ $post_id ] = $how;
				}
			}
		}
	}

	/* ---- shape it the way the frontend's mapper already expects ---- */

	$items = array();
	foreach ( $rows as $row ) {
		$id      = (int) $row->ID;
		$author  = (int) $row->post_author;
		$items[] = array(
			'id'            => $id,
			// Raw post_title: REST would run the `the_title` filters. See the
			// header note — differences here are cosmetic, not structural.
			'title'         => (string) $row->post_title,
			'date'          => str_replace( ' ', 'T', (string) $row->post_date ),
			'slug'          => (string) $row->post_name,
			'status'        => (string) $row->post_status,
			// 1.6.0: the dashboard's recent-activity list unions programs and
			// episodes into the same feed, so a row has to say what it is. The
			// ?r=posts SELECT does not fetch post_type (it is always 'post'
			// there), hence the default rather than a required column.
			'type'          => isset( $row->post_type ) ? (string) $row->post_type : 'post',
			// Likewise optional: the activity feed is ORDERED by post_modified,
			// so labelling its rows with post_date would date a story to when it
			// was published rather than when it was touched. Callers that do not
			// select the column get '' and can fall back to `date`.
			'modified'      => isset( $row->post_modified ) ? str_replace( ' ', 'T', (string) $row->post_modified ) : '',
			'author'        => $author,
			'authorName'    => isset( $author_names[ $author ] ) ? $author_names[ $author ] : '',
			'categoryNames' => isset( $category_names[ $id ] ) ? $category_names[ $id ] : array(),
			'thumb'         => isset( $thumbs[ $id ] ) ? $thumbs[ $id ] : '',
		);
	}

	return array( $items, $thumb_how );
}

/* ===========================================================================
 * RESOURCE: dashboard — the newsroom's morning screen (1.6.0)
 * ---------------------------------------------------------------------------
 * WHAT CHANGED IN 1.6.0, AND WHY
 * Until 1.5.3 this returned four counts scoped to the LOGGED-IN USER's own
 * authorship. Measured against live data on 2026-08-05, that made three of the
 * four dashboard tiles read 0 for the administrator account — because the
 * people who run this newsroom do not write the articles. Meanwhile the same
 * account's real numbers were 117 published in 30 days, 68 drafts site-wide,
 * and one review that had been waiting seven days. The tiles were not wrong,
 * they were answering a question nobody had asked.
 *
 * So the payload now answers an editor's three morning questions:
 *   1. what is blocked on me   -> `queue`   (review age, draft pipeline, stuck)
 *   2. what happened since     -> `series` + `kpi`  (daily traffic + output)
 *   3. what is working         -> `top` + `trending` + `authors`
 *
 * `trending` (1.7.0) is `top`'s query over a FIXED 24-hour window: momentum,
 * not standing — so it deliberately does NOT follow the range control, and the
 * two lists may overlap. Same null contract as `top` when the summary table is
 * missing (the frontend then pays WPP's REST call with range=last24hours).
 *
 * SCOPE. `edit_others_posts` decides. Holders get the newsroom (site-wide post
 * counts, the whole review queue, the author leaderboard); everyone else gets
 * their own work, and `authors` comes back null — a reporter should not open
 * their home screen to a ranking they are in. Pageviews are site-wide for
 * both: they describe published content, which is already public.
 *
 * THE TWO EXPENSIVE QUERIES, and why they are shaped differently.
 * `top` INNER JOINs wp_posts because it lists articles and must exclude
 * anything unpublished. The daily `series` deliberately does NOT join: it is
 * the site's pageviews, every tracked post type included, which is both what a
 * traffic chart should show and what keeps it a single-table range scan rather
 * than a 30-day join. Do not "fix" that asymmetry — the two answer different
 * questions. Both are memoised for 5 minutes (drift-only analytics, identical
 * for every viewer, no read-your-writes contract), under SEPARATE keys so
 * flipping the chart range never re-costs the top-5.
 *
 * Measured before building: WPP retains over a year (365-day top story = 15,900
 * views), so retention is not the constraint — cost is. The same probe took 57
 * SECONDS at 365 days, which is why `days` is clamped to 7/30/90.
 *
 * DATE BOUNDS ARE COMPUTED IN PHP, not by MySQL's NOW(). post_date and WPP's
 * view_datetime are both written on the SITE's clock; NOW() is the database
 * server's. Over a 30-day total that is noise, but these are DAILY buckets and
 * an offset would shift rows across midnight at both edges.
 *
 * If the WPP summary table is missing, `top` is null (the frontend then pays
 * the WPP REST call) and `hasViews` is false (the chart says so rather than
 * drawing a flat line that looks like real zero traffic).
 * ======================================================================== */

function ams_fast_res_dashboard( array $user, array $caps ) {
	global $wpdb, $T_POSTS, $T_COMMENTS, $T_TERMS, $T_TERMTAX, $T_TERMREL, $AMS_FAST_BOOT_MS;

	$uid   = (int) $user['id'];
	$scope = ams_fast_can( $caps, 'edit_others_posts' ) ? 'all' : 'own';

	/* Scope clause for POST COUNTS. Note this is narrower than the visibility
	 * clause used for row lists: a count of "the newsroom's drafts" is only
	 * meaningful to someone who can act on them, so an own-scope user counts
	 * their own rows rather than seeing a site-wide total they cannot open. */
	$own_sql    = ( 'own' === $scope ) ? ' AND post_author = %d' : '';
	$own_params = ( 'own' === $scope ) ? array( $uid ) : array();

	/* ---- the window, on the SITE's clock (see the header note) ---- */

	$days  = ams_fast_clamp_days( ams_fast_int_param( 'days', 30 ) );
	$tz    = ams_fast_site_tz();
	$today = new DateTimeImmutable( 'now', $tz );

	/* CUSTOM window (1.8.0): ?from=Y-m-d&to=Y-m-d (site-local, inclusive)
	 * overrides ?days for every range-scoped view — the series, the top list,
	 * the leaderboard. Validated and clamped by ams_fast_custom_range(): `to`
	 * capped at today, the span at 90 days (the 57-second 365-day probe is why
	 * the ceiling exists at all), and an unusable pair falls back to ?days. */
	list( $c_from, $c_to ) = ams_fast_custom_range( ams_fast_param( 'from' ), ams_fast_param( 'to' ), $today );
	$custom = null !== $c_from;

	/* TWO bounds, and they are not interchangeable.
	 *   $start       — the SERIES window. On presets, always at least 14 days,
	 *                  because the KPI cards compare the last 7 days with the 7
	 *                  before and a 7-day request must still carry both. On a
	 *                  custom window it is simply the window (KPIs get their own
	 *                  mini-series below — a historical window cannot feed a
	 *                  card pinned to "the last 7 days ending today").
	 *   $start_range — the window the user actually SELECTED. What the top list
	 *                  and the leaderboard cover, so every dated view on the
	 *                  screen agrees with the range control. Using $start for
	 *                  those would silently widen a 7-day request to 14.
	 *   $end_excl    — exclusive upper bound, custom windows only: presets end
	 *                  "now" and need none. */
	$fetch       = max( $days, 14 );
	$start       = $custom ? $c_from . ' 00:00:00' : $today->modify( '-' . ( $fetch - 1 ) . ' days' )->format( 'Y-m-d' ) . ' 00:00:00';
	$start_d     = substr( $start, 0, 10 );
	$series_days = $custom ? ams_fast_span_days( $c_from, $c_to ) : $fetch;
	$end_excl    = $custom
		? DateTimeImmutable::createFromFormat( '!Y-m-d', $c_to, $tz )->modify( '+1 day' )->format( 'Y-m-d' ) . ' 00:00:00'
		: null;
	$start_range = $custom ? $c_from . ' 00:00:00' : $today->modify( '-' . ( $days - 1 ) . ' days' )->format( 'Y-m-d' ) . ' 00:00:00';
	$stale_at    = $today->modify( '-30 days' )->format( 'Y-m-d H:i:s' );

	/* ---- queue: what is blocked on this user ---- */

	$t0    = microtime( true );
	$queue = array( 'pending' => 0, 'drafts' => 0, 'draftsStale' => 0, 'scheduled' => 0, 'comments' => 0, 'oldest' => null );

	/* Comments awaiting moderation (1.8.0) — the fourth thing blocked on an
	 * editor. Gated by moderate_comments, the same cap wp-admin's own queue
	 * checks; everyone else keeps 0 rather than a site-wide count they cannot
	 * act on. All comment types, matching wp_count_comments(). */
	if ( ams_fast_can( $caps, 'moderate_comments' ) ) {
		$queue['comments'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $T_COMMENTS WHERE comment_approved = '0'" );
	}

	$sql       = "SELECT post_status, COUNT(*) n FROM $T_POSTS
		 WHERE post_type = 'post' AND post_status IN ('draft','pending','future')$own_sql
		 GROUP BY post_status";
	$by_status = $own_params ? $wpdb->get_results( $wpdb->prepare( $sql, $own_params ) ) : $wpdb->get_results( $sql );
	foreach ( (array) $by_status as $row ) {
		$n = (int) $row->n;
		if ( 'draft' === $row->post_status ) {
			$queue['drafts'] = $n;
		} elseif ( 'pending' === $row->post_status ) {
			$queue['pending'] = $n;
		} elseif ( 'future' === $row->post_status ) {
			// This server's loopback is broken, so WP-Cron never fires and a
			// scheduled post simply never publishes. Silent today (0 rows),
			// which is exactly why it is worth counting.
			$queue['scheduled'] = $n;
		}
	}

	if ( $queue['drafts'] > 0 ) {
		$queue['draftsStale'] = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM $T_POSTS
				 WHERE post_type = 'post' AND post_status = 'draft' AND post_modified < %s$own_sql",
				array_merge( array( $stale_at ), $own_params )
			)
		);
	}

	if ( $queue['pending'] > 0 ) {
		// prepare() errors when the SQL carries no placeholder, and $own_sql is
		// empty for the newsroom scope — so the bare query is a separate call,
		// the same shape ams_fast_res_posts() uses for its optional params.
		$sql    = "SELECT ID, post_title, post_author, post_date FROM $T_POSTS
			 WHERE post_type = 'post' AND post_status = 'pending'$own_sql
			 ORDER BY post_date ASC LIMIT 1";
		$oldest = $own_params ? $wpdb->get_row( $wpdb->prepare( $sql, $own_params ) ) : $wpdb->get_row( $sql );
		if ( $oldest ) {
			$names            = ams_fast_author_names( array( (int) $oldest->post_author ) );
			$queue['oldest'] = array(
				'id'         => (int) $oldest->ID,
				'title'      => (string) $oldest->post_title,
				'authorName' => isset( $names[ (int) $oldest->post_author ] ) ? $names[ (int) $oldest->post_author ] : '',
				'date'       => str_replace( ' ', 'T', (string) $oldest->post_date ),
			);
		}
	}
	$ms_queue = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- series: stories published per day (cheap, scope-aware) ---- */

	$t0        = microtime( true );
	$until_sql = null !== $end_excl ? ' AND post_date < %s' : '';
	$sql       = "SELECT DATE(post_date) d, COUNT(*) n FROM $T_POSTS
		 WHERE post_type = 'post' AND post_status = 'publish' AND post_date >= %s$until_sql$own_sql
		 GROUP BY DATE(post_date)";
	$bounds    = null !== $end_excl ? array( $start, $end_excl ) : array( $start );
	$post_rows = $wpdb->get_results( $wpdb->prepare( $sql, array_merge( $bounds, $own_params ) ) );

	$posts_by_day = array();
	foreach ( (array) $post_rows as $row ) {
		$posts_by_day[ (string) $row->d ] = (int) $row->n;
	}

	/* ---- series: site pageviews per day (expensive, memoised, site-wide) ---- */

	$summary_table = $wpdb->prefix . 'popularpostssummary';
	$has_summary   = ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $summary_table ) ) === $summary_table );

	$views_by_day = array();
	$has_views    = false;
	if ( $has_summary ) {
		$has_views  = true;
		$series_key = $custom ? 'wpp:series:c:' . $c_from . ':' . $c_to : 'wpp:series:' . $fetch;
		$cached     = ams_fast_cache_get( $series_key, $hit );
		if ( $hit && is_array( $cached ) ) {
			$views_by_day = $cached;
		} else {
			$until_v   = null !== $end_excl ? ' AND view_datetime < %s' : '';
			$view_rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT DATE(view_datetime) d, SUM(pageviews) v
					 FROM $summary_table
					 WHERE view_datetime >= %s$until_v
					 GROUP BY DATE(view_datetime)",
					$bounds
				)
			);
			foreach ( (array) $view_rows as $row ) {
				$views_by_day[ (string) $row->d ] = (int) $row->v;
			}
			ams_fast_cache_set( $series_key, $views_by_day, AMS_FAST_TTL_REFERENCE );
		}
	}

	$series    = ams_fast_fill_days( $start_d, $series_days, $views_by_day, $posts_by_day );

	/* ---- KPI: this 7 days vs the 7 before, PINNED to today ----
	 *
	 * On presets the display series ends today and carries >= 14 days, so the
	 * cards read straight off its tail. A custom window is a slice of the past
	 * — its tail says nothing about "the last 7 days" — so the cards get their
	 * own 14-day mini-series ending today, same queries, same memo key the
	 * 7-day preset uses. */

	if ( $custom ) {
		$k_start = $today->modify( '-13 days' )->format( 'Y-m-d' ) . ' 00:00:00';

		$sql        = "SELECT DATE(post_date) d, COUNT(*) n FROM $T_POSTS
			 WHERE post_type = 'post' AND post_status = 'publish' AND post_date >= %s$own_sql
			 GROUP BY DATE(post_date)";
		$k_rows     = $wpdb->get_results( $wpdb->prepare( $sql, array_merge( array( $k_start ), $own_params ) ) );
		$k_posts    = array();
		foreach ( (array) $k_rows as $row ) {
			$k_posts[ (string) $row->d ] = (int) $row->n;
		}

		$k_views = array();
		if ( $has_summary ) {
			$cached = ams_fast_cache_get( 'wpp:series:14', $hit );
			if ( $hit && is_array( $cached ) ) {
				$k_views = $cached;
			} else {
				$k_view_rows = $wpdb->get_results(
					$wpdb->prepare(
						"SELECT DATE(view_datetime) d, SUM(pageviews) v
						 FROM $summary_table WHERE view_datetime >= %s
						 GROUP BY DATE(view_datetime)",
						$k_start
					)
				);
				foreach ( (array) $k_view_rows as $row ) {
					$k_views[ (string) $row->d ] = (int) $row->v;
				}
				ams_fast_cache_set( 'wpp:series:14', $k_views, AMS_FAST_TTL_REFERENCE );
			}
		}
		$series_kpi = ams_fast_fill_days( substr( $k_start, 0, 10 ), 14, $k_views, $k_posts );
	} else {
		$series_kpi = $series;
	}
	$ms_series = ams_fast_ms( microtime( true ) - $t0 );

	list( $views7, $views_prev7 )       = ams_fast_tail_sums( $series_kpi, 7, 'views' );
	list( $published7, $published_prev ) = ams_fast_tail_sums( $series_kpi, 7, 'posts' );

	$kpi = array(
		'views7'         => $views7,
		'viewsPrev7'     => $views_prev7,
		'published7'     => $published7,
		'publishedPrev7' => $published_prev,
	);

	/* ---- who is publishing (newsroom scope only) ---- */

	$t0      = microtime( true );
	$authors = null;
	if ( 'all' === $scope ) {
		$until_a     = null !== $end_excl ? ' AND post_date < %s' : '';
		$author_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_author, COUNT(*) n FROM $T_POSTS
				 WHERE post_type = 'post' AND post_status = 'publish' AND post_date >= %s$until_a
				 GROUP BY post_author ORDER BY n DESC, post_author ASC LIMIT 6",
				null !== $end_excl ? array( $start_range, $end_excl ) : array( $start_range )
			)
		);
		$ids  = array();
		foreach ( (array) $author_rows as $row ) {
			$ids[] = (int) $row->post_author;
		}
		$names   = ams_fast_author_names( ams_fast_id_list( $ids ) );
		$authors = array();
		foreach ( (array) $author_rows as $row ) {
			$aid       = (int) $row->post_author;
			$authors[] = array(
				'id'    => $aid,
				'name'  => isset( $names[ $aid ] ) ? $names[ $aid ] : '',
				'count' => (int) $row->n,
			);
		}
	}
	$ms_authors = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- top performing: pageviews over the SELECTED range, published posts ----
	 *
	 * Follows the range control like the chart and the leaderboard, so every
	 * dated view on the screen describes the same slice. Memoised per range —
	 * three keys at most, since `days` is clamped to 7/30/90. */

	$t0      = microtime( true );
	$top     = null;
	$top_key = $custom ? 'wpp:top5:c:' . $c_from . ':' . $c_to : 'wpp:top5:v2:' . $days;
	$cached  = ams_fast_cache_get( $top_key, $hit );
	if ( $hit && is_array( $cached ) ) {
		$top = $cached;
	} elseif ( $has_summary ) {
		$top = ams_fast_wpp_ranked( $summary_table, $start_range, 5, $end_excl );
		ams_fast_cache_set( $top_key, $top, AMS_FAST_TTL_REFERENCE );
	}

	/* ---- trending now: the same ranking, over the last 24 HOURS (1.7.0) ----
	 *
	 * Momentum rather than standing, so the window is FIXED — flipping the range
	 * control must not change what "now" means. One cache key for the same
	 * reason. The bound is computed off $today (site clock), like every other
	 * bound here. */

	$trending = null;
	$cached   = ams_fast_cache_get( 'wpp:trending24:v1', $hit );
	if ( $hit && is_array( $cached ) ) {
		$trending = $cached;
	} elseif ( $has_summary ) {
		$trending = ams_fast_wpp_ranked( $summary_table, $today->modify( '-24 hours' )->format( 'Y-m-d H:i:s' ), 5 );
		ams_fast_cache_set( 'wpp:trending24:v1', $trending, AMS_FAST_TTL_REFERENCE );
	}

	// Author and desk names are resolved OUTSIDE the memo, so a renamed author
	// or re-filed story is current even while the view counts are up to 5
	// minutes old.
	$top      = ams_fast_wpp_attach_names( $top );
	$trending = ams_fast_wpp_attach_names( $trending );
	$ms_top   = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- today so far (1.8.0): the current day, compared honestly ----
	 *
	 * The one thing the rest of the payload cannot say: how TODAY is going.
	 * The comparison is today-since-midnight vs YESTERDAY UP TO THE SAME
	 * CLOCK TIME — a partial day against a full one reads as a crash at 9am,
	 * which is exactly the trap this shape avoids. Bounds are site-clock
	 * datetimes computed in PHP like every other bound here. Memoised for
	 * 120 SECONDS, not the 5-minute reference TTL: this is the only cell on
	 * the screen that claims to be live. `postsToday` stays outside the memo —
	 * it is scope-aware and read-your-writes matters right after publishing. */

	$t0          = microtime( true );
	$today_start = $today->format( 'Y-m-d 00:00:00' );
	$yesterday   = $today->modify( '-1 day' );

	$today_views = null;
	$y_views     = null;
	$top_hour    = null;
	if ( $has_summary ) {
		$cached = ams_fast_cache_get( 'wpp:today:v1', $hit );
		if ( $hit && is_array( $cached ) && 3 === count( $cached ) ) {
			list( $today_views, $y_views, $top_hour ) = $cached;
		} else {
			$today_views = (int) $wpdb->get_var(
				$wpdb->prepare( "SELECT COALESCE(SUM(pageviews),0) FROM $summary_table WHERE view_datetime >= %s", $today_start )
			);
			$y_views = (int) $wpdb->get_var(
				$wpdb->prepare(
					"SELECT COALESCE(SUM(pageviews),0) FROM $summary_table WHERE view_datetime >= %s AND view_datetime < %s",
					$yesterday->format( 'Y-m-d 00:00:00' ),
					$yesterday->format( 'Y-m-d H:i:s' )
				)
			);
			$hour_rows = ams_fast_wpp_ranked( $summary_table, $today->modify( '-1 hour' )->format( 'Y-m-d H:i:s' ), 1 );
			$top_hour  = $hour_rows ? $hour_rows[0] : null;
			ams_fast_cache_set( 'wpp:today:v1', array( $today_views, $y_views, $top_hour ), 120 );
		}
	}
	if ( $top_hour ) {
		$named    = ams_fast_wpp_attach_names( array( $top_hour ) );
		$top_hour = $named[0];
	}

	$sql         = "SELECT COUNT(*) FROM $T_POSTS
		 WHERE post_type = 'post' AND post_status = 'publish' AND post_date >= %s$own_sql";
	$posts_today = (int) $wpdb->get_var( $wpdb->prepare( $sql, array_merge( array( $today_start ), $own_params ) ) );
	$ms_today    = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- recent activity: the whole edit stream, posts AND programs ----
	 *
	 * The visibility clause is the POST rule (published, plus your own) applied
	 * to the program types too. For programs that is stricter than their own
	 * capability model, which is the safe direction for a read path. */

	$t0     = microtime( true );
	$where  = array(
		"p.post_type IN ('post','movie','tv_show','episode')",
		"p.post_status IN ('publish','draft','pending')",
	);
	$params = array();
	if ( 'own' === $scope ) {
		$where[]  = "(p.post_status = 'publish' OR p.post_author = %d)";
		$params[] = $uid;
	}
	$where_sql = implode( ' AND ', $where );
	$sql       = "SELECT p.ID, p.post_title, p.post_status, p.post_date, p.post_author, p.post_name, p.post_type, p.post_modified
		 FROM $T_POSTS p WHERE $where_sql ORDER BY p.post_modified DESC LIMIT 8";
	$rows      = $params ? $wpdb->get_results( $wpdb->prepare( $sql, $params ) ) : $wpdb->get_results( $sql );

	list( $recent, ) = ams_fast_hydrate_posts( (array) $rows );
	$ms_recent       = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'dashboard',
			'user'     => array( 'id' => $uid, 'scope' => $scope ),
			'data'     => array(
				'scope'     => $scope,
				'range'     => $days,
				'custom'    => $custom ? array( 'from' => $c_from, 'to' => $c_to ) : null,
				'hasViews'  => $has_views,
				'kpi'       => $kpi,
				'series'    => $series,
				'queue'     => $queue,
				'authors'   => $authors,
				'top'       => $top,
				'trending'  => $trending,
				'today'     => array(
					'views'             => $today_views,
					'viewsPrevSameTime' => $y_views,
					'posts'             => $posts_today,
					'topHour'           => $top_hour,
				),
				'recent'    => $recent,
			),
			'ms'       => array(
				'boot'   => $AMS_FAST_BOOT_MS,
				'rows'   => $ms_queue + $ms_recent,
				'extras' => $ms_series + $ms_authors + $ms_top + $ms_today,
			),
		)
	);
}

/**
 * The WPP ranking `top` and `trending` share (1.7.0): pageviews summed over
 * the window, PUBLISHED posts only — the INNER JOIN is what excludes
 * unpublished rows, and it is why this is shaped differently from the daily
 * `series` scan (see the resource header before "fixing" that asymmetry).
 * Rows come back bare (id/title/views/author/date); names are attached after
 * the memo by ams_fast_wpp_attach_names(). `$until` (exclusive) bounds a
 * custom window; null means "up to now", the preset shape.
 */
function ams_fast_wpp_ranked( $summary_table, $since, $limit, $until = null ) {
	global $wpdb, $T_POSTS;

	$until_sql = null !== $until ? ' AND s.view_datetime < %s' : '';
	$params    = null !== $until ? array( $since, $until, (int) $limit ) : array( $since, (int) $limit );

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT s.postid, SUM(s.pageviews) views, p.post_title, p.post_author, p.post_date
			 FROM $summary_table s
			 INNER JOIN $T_POSTS p ON p.ID = s.postid
			 WHERE p.post_type = 'post' AND p.post_status = 'publish'
			   AND s.view_datetime >= %s$until_sql
			 GROUP BY s.postid, p.post_title, p.post_author, p.post_date
			 ORDER BY views DESC
			 LIMIT %d",
			$params
		)
	);

	$ranked = array();
	foreach ( (array) $rows as $row ) {
		$ranked[] = array(
			'id'     => (int) $row->postid,
			'title'  => (string) $row->post_title,
			'views'  => (int) $row->views,
			'author' => (int) $row->post_author,
			'date'   => str_replace( ' ', 'T', (string) $row->post_date ),
		);
	}
	return $ranked;
}

/**
 * Resolve author display names and desk (category) names onto ranking rows.
 * Null and empty pass through untouched: null means "no summary table", and
 * the frontend keys its WPP-REST fallback on exactly that — turning it into
 * an empty array here would silently disable the fallback.
 */
function ams_fast_wpp_attach_names( $ranked ) {
	global $wpdb, $T_TERMS, $T_TERMTAX, $T_TERMREL;

	if ( ! is_array( $ranked ) || ! $ranked ) {
		return $ranked;
	}

	$post_ids   = array();
	$author_ids = array();
	foreach ( $ranked as $row ) {
		$post_ids[]   = (int) $row['id'];
		$author_ids[] = (int) $row['author'];
	}
	$names     = ams_fast_author_names( ams_fast_id_list( $author_ids ) );
	$desks     = array();
	$post_ids  = ams_fast_id_list( $post_ids );
	$term_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT tr.object_id, t.name
			 FROM $T_TERMREL tr
			 INNER JOIN $T_TERMTAX tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
			 INNER JOIN $T_TERMS t ON t.term_id = tt.term_id
			 WHERE tr.object_id IN (" . ams_fast_placeholders( $post_ids ) . ") AND tt.taxonomy = 'category'
			 ORDER BY t.name ASC",
			$post_ids
		)
	);
	foreach ( (array) $term_rows as $row ) {
		$desks[ (int) $row->object_id ][] = (string) $row->name;
	}
	foreach ( $ranked as $i => $row ) {
		$ranked[ $i ]['authorName']    = isset( $names[ $row['author'] ] ) ? $names[ $row['author'] ] : '';
		$ranked[ $i ]['categoryNames'] = isset( $desks[ $row['id'] ] ) ? $desks[ $row['id'] ] : array();
	}
	return $ranked;
}

/* ---------------------------------------------------------------------------
 * Dashboard pure helpers — no database, no globals, unit-tested in tests.php.
 * ------------------------------------------------------------------------- */

/** The chart's range control offers exactly these. A 365-day aggregate over
 *  WPP's summary table measured 57 SECONDS live, so this is a ceiling, not a
 *  preference. */
function ams_fast_clamp_days( $raw ) {
	$raw = (int) $raw;
	return in_array( $raw, array( 7, 30, 90 ), true ) ? $raw : 30;
}

/** Parse and clamp a custom ?from/?to pair (site-local Y-m-d, INCLUSIVE).
 *  Rules: both must be real dates; `to` is capped at today; the span is capped
 *  at 90 days by moving `from` forward (the same 57-second measurement that
 *  clamps the presets); from > to is unusable. Returns array(from, to) as
 *  Y-m-d strings, or array(null, null) when the pair is absent or unusable —
 *  the caller then falls back to the ?days preset. */
function ams_fast_custom_range( $from, $to, DateTimeImmutable $today ) {
	foreach ( array( $from, $to ) as $d ) {
		if ( ! is_string( $d ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ) ) {
			return array( null, null );
		}
	}
	$tz = $today->getTimezone();
	$f  = DateTimeImmutable::createFromFormat( '!Y-m-d', $from, $tz );
	$t  = DateTimeImmutable::createFromFormat( '!Y-m-d', $to, $tz );
	// createFromFormat "repairs" impossible dates (Feb 31 -> Mar 3); the
	// round-trip check refuses them instead of silently querying a window the
	// user never asked for.
	if ( ! $f || ! $t || $f->format( 'Y-m-d' ) !== $from || $t->format( 'Y-m-d' ) !== $to ) {
		return array( null, null );
	}
	$today_midnight = DateTimeImmutable::createFromFormat( '!Y-m-d', $today->format( 'Y-m-d' ), $tz );
	if ( $t > $today_midnight ) {
		$t = $today_midnight;
	}
	if ( $f > $t ) {
		return array( null, null );
	}
	$floor = $t->modify( '-89 days' );
	if ( $f < $floor ) {
		$f = $floor;
	}
	return array( $f->format( 'Y-m-d' ), $t->format( 'Y-m-d' ) );
}

/** Inclusive day count of a Y-m-d..Y-m-d window: 01..03 is 3 days. */
function ams_fast_span_days( $from, $to ) {
	$utc = new DateTimeZone( 'UTC' );
	$f   = new DateTimeImmutable( $from . ' 00:00:00', $utc );
	$t   = new DateTimeImmutable( $to . ' 00:00:00', $utc );
	return (int) $f->diff( $t )->days + 1;
}

/** "+07:00" for 7, "-03:30" for -3.5 — the DateTimeZone-parsable spelling of
 *  WordPress's `gmt_offset` option, which is a float number of hours. */
function ams_fast_tz_offset_name( $offset ) {
	$offset  = (float) $offset;
	$sign    = $offset < 0 ? '-' : '+';
	$abs     = abs( $offset );
	$hours   = (int) floor( $abs );
	$minutes = (int) round( ( $abs - $hours ) * 60 );
	if ( 60 === $minutes ) {
		$hours++;
		$minutes = 0;
	}
	return sprintf( '%s%02d:%02d', $sign, $hours, $minutes );
}

/** The clock post_date and WPP's view_datetime are written against. Prefers
 *  `timezone_string`; falls back to the numeric `gmt_offset`, then UTC. Both
 *  options are plain rows with no rewrite-dependent filter, so both are safe to
 *  read under SHORTINIT (unlike category_base — see the project notes). */
function ams_fast_site_tz() {
	$name = get_option( 'timezone_string' );
	if ( is_string( $name ) && '' !== $name ) {
		try {
			return new DateTimeZone( $name );
		} catch ( Exception $e ) {
			// A stored-but-invalid zone falls through to the offset.
		}
	}
	try {
		return new DateTimeZone( ams_fast_tz_offset_name( get_option( 'gmt_offset', 0 ) ) );
	} catch ( Exception $e ) {
		return new DateTimeZone( 'UTC' );
	}
}

/** A DENSE day-by-day series: every day in the window present exactly once, in
 *  ascending order, missing days zero-filled. A sparse GROUP BY result would
 *  draw a chart that silently closes the gaps — a day with no traffic has to
 *  look like a day with no traffic, not like it never happened. */
function ams_fast_fill_days( $start_ymd, $days, array $views_by_day, array $posts_by_day ) {
	$series = array();
	try {
		$cursor = new DateTimeImmutable( $start_ymd . ' 00:00:00', new DateTimeZone( 'UTC' ) );
	} catch ( Exception $e ) {
		return $series;
	}
	for ( $i = 0; $i < (int) $days; $i++ ) {
		$d        = $cursor->modify( '+' . $i . ' days' )->format( 'Y-m-d' );
		$series[] = array(
			'd'     => $d,
			'views' => isset( $views_by_day[ $d ] ) ? (int) $views_by_day[ $d ] : 0,
			'posts' => isset( $posts_by_day[ $d ] ) ? (int) $posts_by_day[ $d ] : 0,
		);
	}
	return $series;
}

/** Sum of the last $window entries, and of the $window before those — the two
 *  numbers a "vs previous period" delta needs. Returns array($current, $prev);
 *  $prev is null when the series is too short to cover it, so the frontend can
 *  omit the delta rather than compare against a partial window. */
function ams_fast_tail_sums( array $series, $window, $field ) {
	$window = (int) $window;
	$n      = count( $series );
	$sum    = function ( $from, $len ) use ( $series, $field ) {
		$total = 0;
		for ( $i = $from; $i < $from + $len; $i++ ) {
			$total += isset( $series[ $i ][ $field ] ) ? (int) $series[ $i ][ $field ] : 0;
		}
		return $total;
	};
	if ( $n < $window ) {
		return array( $sum( 0, $n ), null );
	}
	$current = $sum( $n - $window, $window );
	if ( $n < $window * 2 ) {
		return array( $current, null );
	}
	return array( $current, $sum( $n - ( $window * 2 ), $window ) );
}

/* ===========================================================================
 * RESOURCE: categories — the full category tree (26 terms, one query)
 * ---------------------------------------------------------------------------
 * Mirrors GET wp/v2/categories?per_page=100&orderby=name&hide_empty=false.
 * Reference data, but deliberately NOT cached here: the dashboard's category
 * manager writes through WP REST and busts only the Next-side tag — a Redis
 * entry written here would keep serving the pre-write list with no way to
 * bust it. The query is single-digit milliseconds; boot is the cost.
 * ======================================================================== */

function ams_fast_res_categories( array $user ) {
	global $wpdb, $T_TERMS, $T_TERMTAX, $AMS_FAST_BOOT_MS;

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		"SELECT t.term_id, t.name, t.slug, tt.parent, tt.count
		 FROM $T_TERMS t
		 INNER JOIN $T_TERMTAX tt ON tt.term_id = t.term_id
		 WHERE tt.taxonomy = 'category'
		 ORDER BY t.name ASC, t.term_id ASC
		 LIMIT 100"
	);

	$items = array();
	foreach ( (array) $rows as $row ) {
		$items[] = array(
			'id'     => (int) $row->term_id,
			'name'   => (string) $row->name,
			'slug'   => (string) $row->slug,
			'parent' => (int) $row->parent,
			'count'  => (int) $row->count,
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'categories',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array( 'items' => $items ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: tags — 5.5k terms, search-first, most-used first
 * ---------------------------------------------------------------------------
 * Mirrors GET wp/v2/tags?orderby=count&order=desc&search=. REST's term search
 * matches name OR slug (WP_Term_Query 'search'), so ours does too. Ties on
 * count get an explicit term_id tiebreak — MySQL's order within a tie is
 * otherwise unspecified, which would make the REST diff noisy for no reason.
 * ======================================================================== */

function ams_fast_res_tags( array $user ) {
	global $wpdb, $T_TERMS, $T_TERMTAX, $AMS_FAST_BOOT_MS;

	$page     = max( 1, ams_fast_int_param( 'page', 1 ) );
	$per_page = max( 1, min( AMS_FAST_MAX_PER_PAGE, ams_fast_int_param( 'per_page', 20 ) ) );
	$search   = trim( ams_fast_param( 'q' ) );

	$where  = array( "tt.taxonomy = 'post_tag'" );
	$params = array();
	if ( '' !== $search ) {
		$like     = '%' . $wpdb->esc_like( $search ) . '%';
		$where[]  = '(t.name LIKE %s OR t.slug LIKE %s)';
		$params[] = $like;
		$params[] = $like;
	}
	$where_sql = implode( ' AND ', $where );

	$t0        = microtime( true );
	$total_sql = "SELECT COUNT(*) FROM $T_TERMS t INNER JOIN $T_TERMTAX tt ON tt.term_id = t.term_id WHERE $where_sql";
	$total     = (int) ( $params ? $wpdb->get_var( $wpdb->prepare( $total_sql, $params ) ) : $wpdb->get_var( $total_sql ) );

	$rows_sql = "SELECT t.term_id, t.name, t.slug, tt.count
		 FROM $T_TERMS t
		 INNER JOIN $T_TERMTAX tt ON tt.term_id = t.term_id
		 WHERE $where_sql
		 ORDER BY tt.count DESC, t.term_id ASC
		 LIMIT %d OFFSET %d";
	$rows     = $wpdb->get_results(
		$wpdb->prepare( $rows_sql, array_merge( $params, array( $per_page, ( $page - 1 ) * $per_page ) ) )
	);

	$items = array();
	foreach ( (array) $rows as $row ) {
		$items[] = array(
			'id'    => (int) $row->term_id,
			'name'  => (string) $row->name,
			'slug'  => (string) $row->slug,
			'count' => (int) $row->count,
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'tags',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array(
				'items'      => $items,
				'total'      => $total,
				'totalPages' => (int) ceil( $total / $per_page ),
				'page'       => $page,
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: authors — the Articles list's author-filter options
 * ---------------------------------------------------------------------------
 * Mirrors GET wp/v2/users?per_page=100&orderby=name (view context) for a
 * caller WITHOUT list_users: users with at least one PUBLISHED post of a
 * REST-visible type. That is also the deterministic semantic the BFF's shared
 * cache entry documents ("everyone with published posts") — on the REST path
 * a list_users caller actually got ALL users, so whichever session warmed the
 * cache first decided what everyone saw. Now every caller gets the same list.
 *
 * The type list is hardcoded — get_post_types() needs the full boot. It must
 * track the types registered show_in_rest on this install.
 * ======================================================================== */

function ams_fast_res_authors( array $user ) {
	global $wpdb, $T_POSTS, $T_USERS, $AMS_FAST_BOOT_MS;

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		"SELECT DISTINCT u.ID, u.display_name
		 FROM $T_USERS u
		 INNER JOIN $T_POSTS p ON p.post_author = u.ID
		 WHERE p.post_status = 'publish'
		   AND p.post_type IN ('post','page','movie','tv_show','episode','video')
		 ORDER BY u.display_name ASC
		 LIMIT 100"
	);

	$items = array();
	foreach ( (array) $rows as $row ) {
		$items[] = array( 'id' => (int) $row->ID, 'name' => (string) $row->display_name );
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'authors',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array( 'items' => $items ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: users — the Users screen (emails!), list_users-gated
 * ---------------------------------------------------------------------------
 * Mirrors GET wp/v2/users?context=edit — which WordPress serves only to
 * callers with list_users, so the SAME GATE runs here BEFORE any query. This
 * payload contains email addresses; it is the highest-risk list in the sweep.
 *
 * Search mirrors the users controller: the term, wrapped in wildcards, against
 * user_login / user_url / user_email / user_nicename / display_name. The roles
 * filter mirrors role__in via the serialized-capabilities LIKE trick WordPress
 * itself uses ('"role"' — quote-delimited, so substrings cannot false-match).
 * ======================================================================== */

function ams_fast_res_users( array $user, array $caps ) {
	global $wpdb, $T_USERS, $T_USERMETA, $AMS_FAST_BOOT_MS;

	if ( ! ams_fast_can( $caps, 'list_users' ) ) {
		ams_fast_fail( 403, 'cannot_list_users' );
	}

	$page     = max( 1, ams_fast_int_param( 'page', 1 ) );
	$per_page = max( 1, min( AMS_FAST_MAX_PER_PAGE, ams_fast_int_param( 'per_page', 20 ) ) );
	$search   = trim( ams_fast_param( 'q' ) );
	$roles    = array_values( array_filter( array_map( 'trim', explode( ',', ams_fast_param( 'roles' ) ) ) ) );

	$cap_key = $wpdb->prefix . 'capabilities';
	$where   = array( '1=1' );
	$params  = array();

	if ( '' !== $search ) {
		$like     = '%' . $wpdb->esc_like( $search ) . '%';
		$where[]  = '(u.user_login LIKE %s OR u.user_url LIKE %s OR u.user_email LIKE %s OR u.user_nicename LIKE %s OR u.display_name LIKE %s)';
		$params   = array_merge( $params, array( $like, $like, $like, $like, $like ) );
	}

	if ( $roles ) {
		$role_like = array();
		foreach ( $roles as $role ) {
			$role_like[] = 'm.meta_value LIKE %s';
			$params[]    = '%' . $wpdb->esc_like( '"' . $role . '"' ) . '%';
		}
		$where[] = '(' . implode( ' OR ', $role_like ) . ')';
	}

	$where_sql = implode( ' AND ', $where );
	$from      = "$T_USERS u INNER JOIN $T_USERMETA m ON m.user_id = u.ID AND m.meta_key = '$cap_key'";

	$t0    = microtime( true );
	$total = (int) $wpdb->get_var(
		$params
			? $wpdb->prepare( "SELECT COUNT(DISTINCT u.ID) FROM $from WHERE $where_sql", $params )
			: "SELECT COUNT(DISTINCT u.ID) FROM $from WHERE $where_sql"
	);

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT u.ID, u.display_name, u.user_email, u.user_nicename, m.meta_value AS caps_raw
			 FROM $from
			 WHERE $where_sql
			 ORDER BY u.display_name ASC
			 LIMIT %d OFFSET %d",
			array_merge( $params, array( $per_page, ( $page - 1 ) * $per_page ) )
		)
	);

	$all_roles = get_option( $wpdb->prefix . 'user_roles' );
	$all_roles = is_array( $all_roles ) ? $all_roles : array();

	$items = array();
	foreach ( (array) $rows as $row ) {
		$items[] = array(
			'id'    => (int) $row->ID,
			'name'  => (string) $row->display_name,
			'email' => (string) $row->user_email,
			'slug'  => (string) $row->user_nicename,
			'roles' => ams_fast_assigned_roles( ams_fast_unserialize( $row->caps_raw ), $all_roles ),
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'users',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array(
				'items'      => $items,
				'total'      => $total,
				'totalPages' => (int) ceil( $total / $per_page ),
				'page'       => $page,
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: media — the Media grid (115k attachments, search-first)
 * ---------------------------------------------------------------------------
 * Serves the WHOLE library to any caller with edit_posts (owner decision,
 * 2026-08-04): post_type 'attachment', status 'inherit'. This deliberately
 * does NOT mirror REST's context=edit row set, which was measured to be
 * BROKEN for a user without edit_others_posts — WordPress pages first, then
 * drops every row that user cannot EDIT, so an Author gets 0 rows on every
 * page while X-WP-Total still claims the full 115k. wp-admin's own Media
 * Library shows Authors everything, the featured-image picker needs to, and
 * nothing here is a leak: anonymous view-context REST serves the identical
 * list publicly (verified live). Author-scoping, if ever wanted, is one
 * WHERE clause here — with correct totals, unlike REST's.
 *
 * URLs: `url` is the full-size file, `thumb` prefers the thumbnail crop then
 * medium then full — the REST mapper's exact fallback chain — each resolved
 * per attachment through ams_fast_attachment_base() (offloaded vs THE 642).
 * ======================================================================== */

function ams_fast_res_media( array $user, array $caps ) {
	global $wpdb, $T_POSTS, $T_POSTMETA, $AMS_FAST_BOOT_MS;

	if ( ! ams_fast_can( $caps, 'edit_posts' ) ) {
		ams_fast_fail( 403, 'cannot_edit_posts' );
	}

	$page       = max( 1, ams_fast_int_param( 'page', 1 ) );
	$per_page   = max( 1, min( AMS_FAST_MAX_PER_PAGE, ams_fast_int_param( 'per_page', 48 ) ) );
	$search     = trim( ams_fast_param( 'q' ) );
	$media_type = ams_fast_param( 'media_type' );

	$where  = array( "p.post_type = 'attachment'", "p.post_status = 'inherit'" );
	$params = array();

	if ( in_array( $media_type, array( 'image', 'video', 'audio', 'application' ), true ) ) {
		$where[]  = 'p.post_mime_type LIKE %s';
		$params[] = $wpdb->esc_like( $media_type ) . '/%';
	}

	if ( '' !== $search ) {
		foreach ( preg_split( '/\s+/', $search ) as $term ) {
			if ( '' === $term ) {
				continue;
			}
			$like     = '%' . $wpdb->esc_like( $term ) . '%';
			$where[]  = '(p.post_title LIKE %s OR p.post_excerpt LIKE %s OR p.post_content LIKE %s)';
			$params[] = $like;
			$params[] = $like;
			$params[] = $like;
		}
	}

	$where_sql = implode( ' AND ', $where );

	$t0    = microtime( true );
	$total = (int) $wpdb->get_var(
		$params
			? $wpdb->prepare( "SELECT COUNT(*) FROM $T_POSTS p WHERE $where_sql", $params )
			: "SELECT COUNT(*) FROM $T_POSTS p WHERE $where_sql"
	);

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT p.ID, p.post_title, p.post_date, p.post_author, p.post_mime_type
			 FROM $T_POSTS p
			 WHERE $where_sql
			 ORDER BY p.post_date DESC, p.ID DESC
			 LIMIT %d OFFSET %d",
			array_merge( $params, array( $per_page, ( $page - 1 ) * $per_page ) )
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- meta for the page's attachments: one query for everything ---- */

	$t0         = microtime( true );
	$ids        = array();
	$author_ids = array();
	foreach ( (array) $rows as $row ) {
		$ids[]        = (int) $row->ID;
		$author_ids[] = (int) $row->post_author;
	}
	$ids        = ams_fast_id_list( $ids );
	$author_ids = ams_fast_id_list( $author_ids );

	$att_meta = array();
	if ( $ids ) {
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ')',
				$ids
			)
		);
		foreach ( (array) $meta_rows as $row ) {
			$att_meta[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
		}
	}

	$author_names = ams_fast_author_names( $author_ids );
	$local_base   = ams_fast_local_uploads_base();

	$items = array();
	foreach ( (array) $rows as $row ) {
		$id   = (int) $row->ID;
		$meta = isset( $att_meta[ $id ] ) ? $att_meta[ $id ] : array();
		$data = ams_fast_unserialize( isset( $meta['_wp_attachment_metadata'] ) ? $meta['_wp_attachment_metadata'] : '' );

		$author  = (int) $row->post_author;
		$items[] = array(
			'id'         => $id,
			'title'      => (string) $row->post_title,
			'date'       => str_replace( ' ', 'T', (string) $row->post_date ),
			'url'        => ams_fast_attachment_url( $meta, $local_base, $how, array() ),
			'thumb'      => ams_fast_attachment_url( $meta, $local_base, $how, array( 'thumbnail', 'medium' ) ),
			'mime'       => (string) $row->post_mime_type,
			'type'       => ams_fast_media_type( $row->post_mime_type ),
			'width'      => isset( $data['width'] ) ? (int) $data['width'] : 0,
			'height'     => isset( $data['height'] ) ? (int) $data['height'] : 0,
			'filesize'   => isset( $data['filesize'] ) ? (int) $data['filesize'] : 0,
			'author'     => $author,
			'authorName' => isset( $author_names[ $author ] ) ? $author_names[ $author ] : '',
			'alt'        => isset( $meta['_wp_attachment_image_alt'] ) ? (string) $meta['_wp_attachment_image_alt'] : '',
		);
	}
	$ms_extras = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'media',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array(
				'items'      => $items,
				'total'      => $total,
				'totalPages' => (int) ceil( $total / $per_page ),
				'page'       => $page,
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => $ms_extras ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: programs — the Programs list (movies only, ~20 rows)
 * ---------------------------------------------------------------------------
 * Mirrors GET wp/v2/movie?status=publish,draft,pending&orderby=title. The
 * capability story is the trap Session 9 §7 flagged: REST's draft/pending
 * gate for the movie type is edit_movies, and its per-row visibility hinges
 * on edit_others_movies — which ams-frontend-api DERIVES at runtime from
 * stored edit_movies via a user_has_cap filter that does not run here. So
 * every check below goes through ams_fast_can_program(), the port of that
 * filter. Consequence on this site: anyone who may list drafts at all (stored
 * edit_movies, or an administrator) also derives edit_others_movies, so the
 * scope is effectively always 'all' — but the clause is still written via the
 * derivation, so the MECHANISM matches REST, not just today's answer.
 * ======================================================================== */

function ams_fast_res_programs( array $user, array $caps, array $roles ) {
	global $wpdb, $T_POSTS, $T_POSTMETA, $AMS_FAST_BOOT_MS;

	// REST's handle_status_param for draft/pending on the movie type.
	if ( ! ams_fast_can_program( $caps, $roles, 'edit_movies' ) ) {
		ams_fast_fail( 403, 'cannot_read_status', 'movie drafts need edit_movies' );
	}

	$where  = array( "p.post_type = 'movie'", "p.post_status IN ('publish','draft','pending')" );
	$params = array();
	$scope  = 'all';
	if ( ! ams_fast_can_program( $caps, $roles, 'edit_others_movies' ) ) {
		$scope    = 'own';
		$where[]  = "(p.post_status = 'publish' OR p.post_author = %d)";
		$params[] = (int) $user['id'];
	}
	$where_sql = implode( ' AND ', $where );

	$t0   = microtime( true );
	$sql  = "SELECT p.ID, p.post_title, p.post_status
		 FROM $T_POSTS p WHERE $where_sql ORDER BY p.post_title ASC LIMIT 100";
	$rows = $params ? $wpdb->get_results( $wpdb->prepare( $sql, $params ) ) : $wpdb->get_results( $sql );
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- posters: _thumbnail_id -> attachment meta -> medium-size URL ---- */

	$t0  = microtime( true );
	$ids = array();
	foreach ( (array) $rows as $row ) {
		$ids[] = (int) $row->ID;
	}
	$ids = ams_fast_id_list( $ids );

	$posters = array();
	if ( $ids ) {
		$thumb_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_value FROM $T_POSTMETA
				 WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ") AND meta_key = '_thumbnail_id'",
				$ids
			)
		);
		$by_post = array();
		foreach ( (array) $thumb_rows as $row ) {
			$att = (int) $row->meta_value;
			if ( $att > 0 ) {
				$by_post[ (int) $row->post_id ] = $att;
			}
		}
		$att_ids = ams_fast_id_list( array_values( $by_post ) );
		if ( $att_ids ) {
			$meta_rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $att_ids ) . ')',
					$att_ids
				)
			);
			$att_meta = array();
			foreach ( (array) $meta_rows as $row ) {
				$att_meta[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
			}
			$local_base = ams_fast_local_uploads_base();
			foreach ( $by_post as $post_id => $att_id ) {
				if ( isset( $att_meta[ $att_id ] ) ) {
					// The Programs grid renders LARGE-first (1.8.1): the card is
					// wider than medium's 300px on any hi-DPI screen, so medium
					// upscaled was visibly soft. Chain falls to medium, then to
					// the full-size file, as ams_fast_attachment_url always has.
					$posters[ $post_id ] = ams_fast_attachment_url( $att_meta[ $att_id ], $local_base, $how, array( 'large', 'medium' ) );
				}
			}
		}
	}

	$items = array();
	foreach ( (array) $rows as $row ) {
		$id      = (int) $row->ID;
		$items[] = array(
			'id'     => $id,
			'title'  => (string) $row->post_title,
			'status' => (string) $row->post_status,
			'poster' => isset( $posters[ $id ] ) ? $posters[ $id ] : '',
		);
	}
	$ms_extras = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'programs',
			'user'     => array( 'id' => $user['id'], 'scope' => $scope ),
			'data'     => array( 'items' => $items ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => $ms_extras ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: roles — Role Management viewer, list_users-gated
 * ---------------------------------------------------------------------------
 * Mirrors ams-frontend-api's GET wp/v2/web/roles: every role with its display
 * name, GRANTED caps (explicit-false dropped) and user count. Counting reads
 * every {prefix}capabilities meta value and parses, like count_users() — a
 * few hundred rows, not worth a LIKE-per-role. translate_user_role() needs
 * l10n (not loaded here); this site's role names are stored in English, so
 * the raw stored name is what REST returns anyway.
 * ======================================================================== */

function ams_fast_res_roles( array $user, array $caps ) {
	global $wpdb, $T_USERMETA, $AMS_FAST_BOOT_MS;

	if ( ! ams_fast_can( $caps, 'list_users' ) ) {
		ams_fast_fail( 403, 'cannot_list_users' );
	}

	$t0        = microtime( true );
	$all_roles = get_option( $wpdb->prefix . 'user_roles' );
	$all_roles = is_array( $all_roles ) ? $all_roles : array();

	$raw_caps = $wpdb->get_col(
		$wpdb->prepare( "SELECT meta_value FROM $T_USERMETA WHERE meta_key = %s", $wpdb->prefix . 'capabilities' )
	);
	$counts = ams_fast_count_roles( (array) $raw_caps, $all_roles );

	$items = array();
	foreach ( $all_roles as $slug => $role ) {
		$granted = array();
		foreach ( (array) ( isset( $role['capabilities'] ) ? $role['capabilities'] : array() ) as $cap => $has ) {
			if ( $has ) {
				$granted[] = (string) $cap;
			}
		}
		sort( $granted );
		$items[] = array(
			'slug'       => (string) $slug,
			'name'       => isset( $role['name'] ) ? (string) $role['name'] : (string) $slug,
			'user_count' => isset( $counts[ $slug ] ) ? (int) $counts[ $slug ] : 0,
			'caps'       => $granted,
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'roles',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array( 'items' => $items ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: settings — the Settings screen's site options
 * ---------------------------------------------------------------------------
 * Mirrors GET wp/v2/settings, which core serves ONLY to manage_options, so
 * the same gate runs here. Every field is a plain option; `timezone` is core's
 * REST alias for the `timezone_string` option.
 * ======================================================================== */

function ams_fast_res_settings( array $user, array $caps ) {
	global $AMS_FAST_BOOT_MS;

	if ( ! ams_fast_can( $caps, 'manage_options' ) ) {
		ams_fast_fail( 403, 'cannot_manage_options' );
	}

	$t0 = microtime( true );
	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'settings',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array(
				'title'            => (string) get_option( 'blogname' ),
				'description'      => (string) get_option( 'blogdescription' ),
				'timezone'         => (string) get_option( 'timezone_string' ),
				'date_format'      => (string) get_option( 'date_format' ),
				'default_category' => (int) get_option( 'default_category' ),
				'posts_per_page'   => (int) get_option( 'posts_per_page' ),
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: profile — the signed-in user's own account (wp/v2/users/me)
 * ---------------------------------------------------------------------------
 * Always the TOKEN's user, never a parameter: "me" is the whole contract, and
 * an id parameter here would be a way to read other people's email addresses
 * without list_users.
 * ======================================================================== */

function ams_fast_res_profile( array $user, array $roles ) {
	global $wpdb, $T_USERS, $T_USERMETA, $AMS_FAST_BOOT_MS;

	$uid = (int) $user['id'];
	$t0  = microtime( true );

	$row = $wpdb->get_row(
		$wpdb->prepare( "SELECT ID, display_name, user_email, user_url, user_nicename FROM $T_USERS WHERE ID = %d LIMIT 1", $uid )
	);
	if ( ! $row ) {
		ams_fast_fail( 401, 'unknown_user' );
	}

	// ams_avatar_* are written by ams-frontend-api's `ams_avatar` REST field
	// (1.20.0) — the URL is resolved and stored at write time precisely so this
	// SHORTINIT read needs no attachment/offload machinery.
	$meta_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT meta_key, meta_value FROM $T_USERMETA
			 WHERE user_id = %d AND meta_key IN ('first_name','last_name','description','ams_avatar_id','ams_avatar_url')",
			$uid
		)
	);
	$meta = array();
	foreach ( (array) $meta_rows as $m ) {
		$meta[ (string) $m->meta_key ] = (string) $m->meta_value;
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'profile',
			'user'     => array( 'id' => $uid ),
			'data'     => array(
				'id'          => (int) $row->ID,
				'name'        => (string) $row->display_name,
				'first_name'  => isset( $meta['first_name'] ) ? $meta['first_name'] : '',
				'last_name'   => isset( $meta['last_name'] ) ? $meta['last_name'] : '',
				'email'       => (string) $row->user_email,
				'description' => isset( $meta['description'] ) ? $meta['description'] : '',
				'url'         => (string) $row->user_url,
				'slug'        => (string) $row->user_nicename,
				'roles'       => $roles,
				// Same field name and shape as the REST read, so the frontend
				// maps both paths with one function.
				'ams_avatar'  => ( ! empty( $meta['ams_avatar_id'] ) && ! empty( $meta['ams_avatar_url'] ) )
					? array( 'id' => (int) $meta['ams_avatar_id'], 'url' => (string) $meta['ams_avatar_url'] )
					: null,
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: featured — the homepage banner slot (Settings screen)
 * ---------------------------------------------------------------------------
 * Mirrors ams-frontend-api's GET web/featured-program, but only the four
 * fields the DASHBOARD reads (the public payload's permalink/poster/excerpt
 * are not used there). Same rules as the plugin: a slot pointing at a movie
 * that has since been unpublished or deleted reports as "unset" rather than
 * erroring, and the cover falls back to the movie's own Vodi backdrop.
 * ======================================================================== */

function ams_fast_res_featured( array $user ) {
	global $wpdb, $T_POSTS, $T_POSTMETA, $AMS_FAST_BOOT_MS;

	$t0  = microtime( true );
	$opt = get_option( 'ams_afa_featured_program' );
	$opt = is_array( $opt ) ? $opt : array();

	$movie_id = isset( $opt['movie_id'] ) ? (int) $opt['movie_id'] : 0;
	$bg_image = isset( $opt['bg_image'] ) ? (int) $opt['bg_image'] : 0;

	$data = array( 'movieId' => 0, 'bgImageId' => $bg_image, 'title' => '', 'coverUrl' => '' );

	if ( $movie_id > 0 ) {
		$post = $wpdb->get_row(
			$wpdb->prepare( "SELECT ID, post_title FROM $T_POSTS WHERE ID = %d AND post_type = 'movie' AND post_status = 'publish' LIMIT 1", $movie_id )
		);
		if ( $post ) {
			$data['movieId'] = (int) $post->ID;
			$data['title']   = (string) $post->post_title;

			$cover_id = $bg_image;
			if ( ! $cover_id ) {
				$cover_id = (int) $wpdb->get_var(
					$wpdb->prepare(
						"SELECT meta_value FROM $T_POSTMETA WHERE post_id = %d AND meta_key = '_vodi_movie_bg_image' LIMIT 1",
						$movie_id
					)
				);
			}
			if ( $cover_id > 0 ) {
				// 'full' size, matching wp_get_attachment_image_url($id,'full').
				$data['coverUrl'] = ams_fast_attachment_url( ams_fast_attachment_meta( $cover_id ), ams_fast_local_uploads_base(), $how, array() );
			}
		}
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'featured',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => $data,
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * SINGLE-ITEM HELPERS
 * ======================================================================== */

/** Every meta row for one attachment, keyed by meta_key (the shape
 *  ams_fast_attachment_base() discovers the offload marker from). */
function ams_fast_attachment_meta( $attachment_id ) {
	global $wpdb, $T_POSTMETA;

	$attachment_id = (int) $attachment_id;
	if ( $attachment_id <= 0 ) {
		return array();
	}
	$rows = $wpdb->get_results(
		$wpdb->prepare( "SELECT meta_key, meta_value FROM $T_POSTMETA WHERE post_id = %d", $attachment_id )
	);
	$meta = array();
	foreach ( (array) $rows as $row ) {
		$meta[ (string) $row->meta_key ] = $row->meta_value;
	}
	return $meta;
}

/** All meta for one post, keyed by meta_key. */
function ams_fast_post_meta( $post_id ) {
	return ams_fast_attachment_meta( $post_id ); // same query shape
}

/**
 * Featured-image URLs for MANY posts at a preferred size chain, keyed by post
 * id. Two queries total regardless of how many posts — the _thumbnail_id
 * lookup, then every meta row for the attachments those point at (all of them,
 * because the offload marker is discovered rather than assumed; see
 * ams_fast_attachment_base). Posts with no featured image are simply absent.
 */
function ams_fast_thumbnail_urls( array $post_ids, array $sizes ) {
	global $wpdb, $T_POSTMETA;

	$post_ids = ams_fast_id_list( $post_ids );
	if ( ! $post_ids ) {
		return array();
	}

	$thumb_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT post_id, meta_value FROM $T_POSTMETA
			 WHERE post_id IN (" . ams_fast_placeholders( $post_ids ) . ") AND meta_key = '_thumbnail_id'",
			$post_ids
		)
	);
	$by_post = array();
	foreach ( (array) $thumb_rows as $row ) {
		$att = (int) $row->meta_value;
		if ( $att > 0 ) {
			$by_post[ (int) $row->post_id ] = $att;
		}
	}

	$att_ids = ams_fast_id_list( array_values( $by_post ) );
	if ( ! $att_ids ) {
		return array();
	}

	$meta_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $att_ids ) . ')',
			$att_ids
		)
	);
	$att_meta = array();
	foreach ( (array) $meta_rows as $row ) {
		$att_meta[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
	}

	$local_base = ams_fast_local_uploads_base();
	$out        = array();
	foreach ( $by_post as $post_id => $att_id ) {
		if ( isset( $att_meta[ $att_id ] ) ) {
			$out[ $post_id ] = ams_fast_attachment_url( $att_meta[ $att_id ], $local_base, $how, $sizes );
		}
	}
	return $out;
}

/** Featured-image URL for a post at a preferred size chain; '' when unset. */
function ams_fast_featured_url( array $meta, array $sizes ) {
	$att = isset( $meta['_thumbnail_id'] ) ? (int) $meta['_thumbnail_id'] : 0;
	if ( $att <= 0 ) {
		return '';
	}
	return ams_fast_attachment_url( ams_fast_attachment_meta( $att ), ams_fast_local_uploads_base(), $how, $sizes );
}

/**
 * A post's permalink WITHOUT the rewrite layer.
 *
 * get_permalink() needs rewrite rules, the post-type registry and (on this
 * install) Custom Permalinks' filters — none of which exist under SHORTINIT.
 * `?p=<id>` is the one form WordPress ALWAYS resolves: core canonicalises it
 * to the real permalink with a 301 before rendering. So the View links this
 * feeds land on exactly the same page; only the string differs from REST's.
 * Deliberate divergence — see the header notes.
 */
function ams_fast_permalink( $post_id ) {
	$home = function_exists( 'get_option' ) ? (string) get_option( 'home' ) : '';
	return rtrim( $home, '/' ) . '/?p=' . (int) $post_id;
}

/* ===========================================================================
 * RESOURCE: program — one movie/tv_show for the Programs editor
 * ---------------------------------------------------------------------------
 * Replaces the editor's TWO parallel context=edit REST probes (the admin
 * route's [id] does not say which post type it is). Here one indexed query
 * answers both, because the type comes back with the row.
 *
 * Capability: REST would run map_meta_cap's edit_post on the resolved type,
 * which lands on the edit_others_ and edit_published_ variants — derived
 * here, since the filter that supplies them does not run. See
 * ams_fast_can_program().
 *
 * The description is post_content RAW, which is what the editor writes back
 * (programs predate Gutenberg on this site — classic metabox markup, no block
 * delimiters), so unlike an article body this round-trips losslessly.
 * ======================================================================== */

function ams_fast_res_program( array $user, array $caps, array $roles ) {
	global $wpdb, $T_POSTS, $AMS_FAST_BOOT_MS;

	$id = ams_fast_int_param( 'id', 0 );
	if ( $id <= 0 ) {
		ams_fast_fail( 400, 'bad_id' );
	}

	$t0  = microtime( true );
	$row = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT ID, post_type, post_status, post_name, post_title, post_content, post_author
			 FROM $T_POSTS
			 WHERE ID = %d AND post_type IN ('movie','tv_show') LIMIT 1",
			$id
		)
	);
	if ( ! $row ) {
		ams_fast_fail( 404, 'not_found' );
	}

	$type  = (string) $row->post_type;
	$movie = ( 'movie' === $type );
	$plural = $movie ? 'movies' : 'tv_shows';

	// The gate REST would apply to ?context=edit on this row, following
	// map_meta_cap: the base cap always, plus the others_ variant for someone
	// else's post and the published_ variant for a published one.
	$needed = array( 'edit_' . $plural );
	if ( (int) $row->post_author !== (int) $user['id'] ) {
		$needed[] = 'edit_others_' . $plural;
	}
	if ( 'publish' === $row->post_status ) {
		$needed[] = 'edit_published_' . $plural;
	}
	foreach ( $needed as $cap ) {
		if ( ! ams_fast_can_program( $caps, $roles, $cap ) ) {
			ams_fast_fail( 403, 'cannot_edit', $cap );
		}
	}

	$meta    = ams_fast_post_meta( (int) $row->ID );
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	$mstr = function ( $key ) use ( $meta ) {
		return isset( $meta[ $key ] ) ? (string) $meta[ $key ] : '';
	};
	$mint = function ( $key ) use ( $meta ) {
		$v = isset( $meta[ $key ] ) ? (int) $meta[ $key ] : 0;
		return $v > 0 ? $v : 0;
	};

	$t0   = microtime( true );
	$data = array(
		'id'          => (int) $row->ID,
		'type'        => $type,
		'slug'        => (string) $row->post_name,
		'title'       => (string) $row->post_title,
		'description' => (string) $row->post_content,
		'status'      => (string) $row->post_status,
		'link'        => ams_fast_permalink( (int) $row->ID ),
		// The editor renders the MEDIUM poster, falling back to thumbnail.
		'posterThumb' => ams_fast_featured_url( $meta, array( 'medium', 'thumbnail' ) ),
		'posterId'    => $mint( '_thumbnail_id' ),
		'backdropId'  => $mint( $movie ? '_vodi_movie_bg_image' : '_vodi_tv_show_bg_image' ),
		'releaseTs'   => $mint( $movie ? '_movie_release_date' : '_tv_show_release_date' ),
		'schedule'    => $mstr( $movie ? '_movie_run_time' : '_tv_show_run_time' ),
		'video'       => $movie
			? array(
				'choice'       => $mstr( '_movie_choice' ),
				'url'          => $mstr( '_movie_url_link' ),
				'embed'        => $mstr( '_movie_embed_content' ),
				'attachmentId' => $mint( '_movie_attachment_id' ),
			)
			: null,
		'showId'      => $movie ? $mint( '_khi_tv_show_id' ) : (int) $row->ID,
	);

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'program',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => $data,
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: episode — one episode for the edit dialog
 * ======================================================================== */

function ams_fast_res_episode( array $user, array $caps, array $roles ) {
	global $wpdb, $T_POSTS, $AMS_FAST_BOOT_MS;

	$id = ams_fast_int_param( 'id', 0 );
	if ( $id <= 0 ) {
		ams_fast_fail( 400, 'bad_id' );
	}

	$t0  = microtime( true );
	$row = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT ID, post_status, post_name, post_title, post_author
			 FROM $T_POSTS WHERE ID = %d AND post_type = 'episode' LIMIT 1",
			$id
		)
	);
	if ( ! $row ) {
		ams_fast_fail( 404, 'not_found' );
	}

	// map_meta_cap's edit_post, same shape as the program resource above.
	// Episodes are created PUBLISHED, so the published_ variant is the norm.
	$needed = array( 'edit_episodes' );
	if ( (int) $row->post_author !== (int) $user['id'] ) {
		$needed[] = 'edit_others_episodes';
	}
	if ( 'publish' === $row->post_status ) {
		$needed[] = 'edit_published_episodes';
	}
	foreach ( $needed as $cap ) {
		if ( ! ams_fast_can_program( $caps, $roles, $cap ) ) {
			ams_fast_fail( 403, 'cannot_edit', $cap );
		}
	}

	$meta = ams_fast_post_meta( (int) $row->ID );
	$mstr = function ( $key ) use ( $meta ) {
		return isset( $meta[ $key ] ) ? (string) $meta[ $key ] : '';
	};
	$mint = function ( $key ) use ( $meta ) {
		$v = isset( $meta[ $key ] ) ? (int) $meta[ $key ] : 0;
		return $v > 0 ? $v : 0;
	};

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'episode',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array(
				'id'        => (int) $row->ID,
				'slug'      => (string) $row->post_name,
				'title'     => (string) $row->post_title,
				'showId'    => $mint( '_tv_show_id' ),
				'label'     => $mstr( '_episode_number' ),
				'videoUrl'  => $mstr( '_episode_url_link' ),
				'releaseTs' => $mint( '_episode_release_date' ),
				'runTime'   => $mstr( '_episode_run_time' ),
				'thumbId'   => $mint( '_thumbnail_id' ),
				'thumbUrl'  => ams_fast_featured_url( $meta, array( 'medium', 'thumbnail' ) ),
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: episodes — every episode of a show, in ONE request
 * ---------------------------------------------------------------------------
 * Replaces ams-frontend-api's paginated web/tv-show-episodes, which the admin
 * walks at 200 rows a page — up to TEN ~4s REST calls for the biggest show
 * (daily-feed, 617 episodes). Here it is one query plus one meta query, and
 * the ordering the admin actually wants (season desc, episode desc, id desc)
 * is applied client-side from the labels exactly as before.
 *
 * PUBLISHED only, matching the plugin endpoint — a draft episode is invisible
 * to every episode surface on the site, so listing one here would be a lie.
 * ======================================================================== */

function ams_fast_res_episodes( array $user ) {
	global $wpdb, $T_POSTS, $T_POSTMETA, $AMS_FAST_BOOT_MS;

	$show = ams_fast_int_param( 'show', 0 );
	if ( $show <= 0 ) {
		ams_fast_fail( 400, 'bad_show' );
	}

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT p.ID, p.post_title
			 FROM $T_POSTS p
			 INNER JOIN $T_POSTMETA m ON m.post_id = p.ID AND m.meta_key = '_tv_show_id'
			 WHERE p.post_type = 'episode' AND p.post_status = 'publish' AND m.meta_value = %s
			 ORDER BY p.ID DESC
			 LIMIT 2000",
			(string) $show
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	$t0  = microtime( true );
	$ids = array();
	foreach ( (array) $rows as $row ) {
		$ids[] = (int) $row->ID;
	}
	$ids = ams_fast_id_list( $ids );

	$by_post = array();
	if ( $ids ) {
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA
				 WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ")
				   AND meta_key IN ('_episode_number','_episode_run_time','_episode_release_date','_thumbnail_id')",
				$ids
			)
		);
		foreach ( (array) $meta_rows as $row ) {
			$by_post[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
		}
	}

	// Thumbnails: collect every attachment id first, then ONE meta query for
	// all of them — a 617-episode show must not become 617 queries.
	$att_ids = array();
	foreach ( $ids as $id ) {
		$att = isset( $by_post[ $id ]['_thumbnail_id'] ) ? (int) $by_post[ $id ]['_thumbnail_id'] : 0;
		if ( $att > 0 ) {
			$att_ids[] = $att;
		}
	}
	$att_ids  = ams_fast_id_list( $att_ids );
	$att_meta = array();
	if ( $att_ids ) {
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $att_ids ) . ')',
				$att_ids
			)
		);
		foreach ( (array) $meta_rows as $row ) {
			$att_meta[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
		}
	}

	$local_base = ams_fast_local_uploads_base();
	$items      = array();
	foreach ( (array) $rows as $row ) {
		$id   = (int) $row->ID;
		$meta = isset( $by_post[ $id ] ) ? $by_post[ $id ] : array();
		$att  = isset( $meta['_thumbnail_id'] ) ? (int) $meta['_thumbnail_id'] : 0;

		$items[] = array(
			'id'          => $id,
			'title'       => (string) $row->post_title,
			'label'       => isset( $meta['_episode_number'] ) ? (string) $meta['_episode_number'] : '',
			'runTime'     => isset( $meta['_episode_run_time'] ) ? (string) $meta['_episode_run_time'] : '',
			'releaseTs'   => isset( $meta['_episode_release_date'] ) ? (int) $meta['_episode_release_date'] : 0,
			// FULL size, not a crop: ams-frontend-api's episode rows come from
			// get_the_post_thumbnail_url($id, 'full'), and the admin list is
			// diffed against that endpoint. (Read off the plugin source, after
			// a medium-first chain diverged on all 80 rows of a real show.)
			'thumbnail'   => ( $att > 0 && isset( $att_meta[ $att ] ) )
				? ams_fast_attachment_url( $att_meta[ $att ], $local_base, $how, array() )
				: '',
			'permalink'   => ams_fast_permalink( $id ),
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'episodes',
			'user'     => array( 'id' => $user['id'] ),
			'data'     => array( 'items' => $items, 'total' => count( $items ) ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * PUBLIC RESOURCES (?r=pub-*) — the ISR read path, A8
 * ---------------------------------------------------------------------------
 * WHY THESE ARE UNAUTHENTICATED, deliberately:
 * they serve ONLY published content — byte for byte what wp-json already hands
 * any anonymous visitor. The `pub-` prefix is the security boundary and is
 * checked in one place (ams_fast_is_public_resource), so "did I remember to
 * scope this?" is never a per-query question: every pub- query hardcodes
 * post_status = 'publish' and has a per_page ceiling.
 *
 * Exposure is strictly LOWER than the endpoints they replace: an anonymous
 * request here costs ~145ms of boot and a couple of indexed queries, where the
 * same request to wp-json costs ~4s of full WordPress. If the owner ever wants
 * a gate anyway, define AMS_FAST_PUBLIC_KEY in wp-config and send it as
 * X-AMS-Public-Key — see the check below.
 *
 * WHAT THE PUBLIC SITE ACTUALLY NEEDS (measured 2026-08-04, not assumed):
 *   - 90%+ of its WordPress calls are LIST metadata, which is all reproducible.
 *   - The article BODY is not: 1,999 of 2,000 posts store Gutenberg block
 *     markup, so post_content -> rendered HTML needs do_blocks(). The article
 *     DETAIL endpoint therefore stays on WP REST. See ?r=diag contentShape.
 * ======================================================================== */

/** Resources served without a token. The whole anonymous surface, in one list. */
function ams_fast_is_public_resource( $resource ) {
	return 0 === strpos( (string) $resource, 'pub-' );
}

/**
 * UTF-8 safe truncation with ams3e-api's exact ellipsis rule.
 *
 * The rule has TWO numbers and they are not the same, which a sample of only
 * long excerpts cannot reveal:
 *   - text of $threshold (150) characters or fewer is returned UNTOUCHED, even
 *     though it is at the display limit — so a 150-char description can end
 *     mid-word with no ellipsis (live example: post 221602).
 *   - anything longer is cut to $keep (147) and gets '...', landing on 150.
 * Measured: my first pass used 147 for both and truncated 150-char excerpts
 * that the live endpoint returns whole.
 *
 * Always CHARACTERS, never bytes — Khmer is multibyte and a byte cut emits
 * mojibake.
 */
function ams_fast_truncate( $text, $keep = 147, $threshold = 150, $suffix = '...' ) {
	$text = (string) $text;
	if ( function_exists( 'mb_strlen' ) ) {
		if ( mb_strlen( $text, 'UTF-8' ) <= $threshold ) {
			return $text;
		}
		return mb_substr( $text, 0, $keep, 'UTF-8' ) . $suffix;
	}
	// mbstring absent: split on UTF-8 character boundaries instead of bytes.
	$chars = preg_split( '//u', $text, -1, PREG_SPLIT_NO_EMPTY );
	if ( ! is_array( $chars ) || count( $chars ) <= $threshold ) {
		return $text;
	}
	return implode( '', array_slice( $chars, 0, $keep ) ) . $suffix;
}

/**
 * The card description, reproducing ams3e-api's `description` exactly.
 *
 * Rule (both halves verified against live output):
 *   1. post_excerpt when it has content -> used VERBATIM, then truncated.
 *   2. otherwise WordPress generates one from the body. Measured on all 7
 *      empty-excerpt posts in a 400-post sample: stripping HTML comments (which
 *      is what block delimiters are), shortcodes and tags, decoding entities and
 *      collapsing whitespace reproduces it EXACTLY. That works precisely because
 *      static Gutenberg blocks store their rendered HTML inline — it is NOT a
 *      general substitute for do_blocks(), and must not be reused as one.
 *
 * ~1.8% of posts take branch 2, which is why it is implemented rather than
 * left to return an empty string.
 */
function ams_fast_card_description( $post_excerpt, $post_content ) {
	$source = trim( (string) $post_excerpt );

	if ( '' === $source ) {
		$source = (string) $post_content;
		$source = preg_replace( '/<!--.*?-->/s', ' ', $source );   // block delimiters
		$source = preg_replace( '/\[[^\]]*\]/', ' ', $source );    // shortcodes
		$source = preg_replace( '/<[^>]+>/', ' ', $source );       // tags
		$source = html_entity_decode( $source, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		// NB: \s does not match U+200B, so the zero-width spaces Khmer text is
		// full of survive — which is what the live output does too.
		$source = trim( preg_replace( '/\s+/u', ' ', $source ) );
	}

	return ams_fast_truncate( $source );
}

/**
 * Pure half of the descendant walk, so it can be unit-tested: given every
 * category as term_id => parent_id and a starting term, return that term plus
 * every term beneath it. Iterative rather than recursive, and guarded against
 * a parent cycle (a corrupt taxonomy must not hang the endpoint).
 */
function ams_fast_descendant_ids( array $parent_of, $root_id ) {
	$root_id = (int) $root_id;
	if ( $root_id <= 0 || ! isset( $parent_of[ $root_id ] ) ) {
		return array();
	}

	// Invert once: parent => children, so the walk is O(n) not O(n^2).
	$children = array();
	foreach ( $parent_of as $id => $parent ) {
		$children[ (int) $parent ][] = (int) $id;
	}

	$out   = array();
	$queue = array( $root_id );
	while ( $queue ) {
		$id = array_shift( $queue );
		if ( isset( $out[ $id ] ) ) {
			continue; // already seen — also what breaks a parent cycle
		}
		$out[ $id ] = $id;
		if ( isset( $children[ $id ] ) ) {
			foreach ( $children[ $id ] as $child ) {
				$queue[] = $child;
			}
		}
	}
	return array_values( $out );
}

/** A category slug -> its term id plus every descendant's. One small query:
 *  this install has 26 categories, so the whole tree is cheaper to walk in PHP
 *  than to express as a recursive CTE (which would also pin a MySQL version). */
function ams_fast_category_descendants( $slug ) {
	global $wpdb, $T_TERMS, $T_TERMTAX;

	$rows = $wpdb->get_results(
		"SELECT t.term_id, t.slug, tt.parent
		 FROM $T_TERMS t
		 INNER JOIN $T_TERMTAX tt ON tt.term_id = t.term_id
		 WHERE tt.taxonomy = 'category'
		 LIMIT 500"
	);

	$parent_of = array();
	$root      = 0;
	foreach ( (array) $rows as $row ) {
		$parent_of[ (int) $row->term_id ] = (int) $row->parent;
		if ( (string) $row->slug === (string) $slug ) {
			$root = (int) $row->term_id;
		}
	}

	return ams_fast_descendant_ids( $parent_of, $root );
}

/* ===========================================================================
 * RESOURCE: pub-articles — the article LIST, in ams3e-api's envelope
 * ---------------------------------------------------------------------------
 * One endpoint replacing three: web/get-articles, web/get-article-by-category-slug
 * and the core wp/v2/posts?author= call behind author archives. Between them
 * they are the large majority of the public site's WordPress traffic (homepage
 * 3 of 9 calls, article page 6 of 11, category page 4 of 5, landing ~17 of 24).
 *
 * Shape is WpListEnvelope<WpArticleListItem> (src/lib/api/wp-types.ts) so the
 * existing mappers consume it unchanged.
 *
 * ONE DELIBERATE DIVERGENCE: `post_date` is the raw timestamp, not the relative
 * Khmer phrase ("7ម៉ោងមុន") the plugin renders — that needs l10n, which
 * SHORTINIT does not load. It is safe because the mappers prefer
 * `publish_date` and treat `post_date` as a legacy fallback (see cardDate() in
 * api/mappers.ts), and a frozen relative phrase in an ISR cache was already a
 * known bug. Sending the timestamp makes the fallback truthful instead.
 * ======================================================================== */

function ams_fast_res_pub_articles() {
	global $wpdb, $T_POSTS, $T_POSTMETA, $T_TERMS, $T_TERMTAX, $T_TERMREL, $AMS_FAST_BOOT_MS;

	$page     = max( 1, ams_fast_int_param( 'page', 1 ) );
	$per_page = max( 1, min( AMS_FAST_MAX_PER_PAGE, ams_fast_int_param( 'per_page', 10 ) ) );

	/* ---- filters ---- */

	$where  = array( "p.post_type = 'post'", "p.post_status = 'publish'" );
	$params = array();

	// category_id: CSV of term ids, ANY of them (get-articles semantics).
	$cat_ids = ams_fast_id_list( explode( ',', ams_fast_param( 'category_id' ) ) );
	if ( $cat_ids ) {
		$where[] = 'p.ID IN (
			SELECT tr.object_id FROM ' . $T_TERMREL . ' tr
			INNER JOIN ' . $T_TERMTAX . ' tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
			WHERE tt.taxonomy = \'category\' AND tt.term_id IN (' . ams_fast_placeholders( $cat_ids ) . ')
		)';
		$params  = array_merge( $params, $cat_ids );
	}

	// category_slug: get-article-by-category-slug semantics — the term AND ALL
	// ITS DESCENDANTS, which is what makes this different from category_id
	// above (direct assignments only). Measured difference on the live site:
	// entertainment-news is 7,660 posts by id and 7,737 by slug. Matching only
	// the term itself would silently under-fill every parent category page.
	$cat_slug = trim( ams_fast_param( 'category_slug' ) );
	if ( '' !== $cat_slug ) {
		$slug_ids = ams_fast_category_descendants( $cat_slug );
		if ( ! $slug_ids ) {
			$where[] = '1 = 0'; // unknown slug: an empty page, not the whole feed
		} else {
			$where[] = 'p.ID IN (
				SELECT tr.object_id FROM ' . $T_TERMREL . ' tr
				INNER JOIN ' . $T_TERMTAX . ' tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
				WHERE tt.taxonomy = \'category\' AND tt.term_id IN (' . ams_fast_placeholders( $slug_ids ) . ')
			)';
			$params  = array_merge( $params, $slug_ids );
		}
	}

	$author = ams_fast_int_param( 'author', 0 );
	if ( $author > 0 ) {
		$where[]  = 'p.post_author = %d';
		$params[] = $author;
	}

	$after = ams_fast_param( 'after' );
	if ( '' !== $after ) {
		$where[]  = 'p.post_date >= %s';
		$params[] = str_replace( 'T', ' ', $after );
	}
	$before = ams_fast_param( 'before' );
	if ( '' !== $before ) {
		$where[]  = 'p.post_date <= %s';
		$params[] = str_replace( 'T', ' ', $before );
	}

	$where_sql = implode( ' AND ', $where );

	/* ---- count + page ---- */

	$t0        = microtime( true );
	$count_sql = "SELECT COUNT(*) FROM $T_POSTS p WHERE $where_sql";
	$total     = (int) ( $params ? $wpdb->get_var( $wpdb->prepare( $count_sql, $params ) ) : $wpdb->get_var( $count_sql ) );

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			// Ties break by ID ASCENDING — measured against the live endpoint on
			// three posts sharing 2025-08-19 15:00:00, which it returns as
			// 191216, 193673, 194542. ID DESC (the admin list's convention, and
			// my first guess here) reverses whole tie groups, which shuffles
			// cards between pages for no visible reason.
			"SELECT p.ID, p.post_title, p.post_name, p.post_date, p.post_excerpt, p.post_content
			 FROM $T_POSTS p
			 WHERE $where_sql
			 ORDER BY p.post_date DESC, p.ID ASC
			 LIMIT %d OFFSET %d",
			array_merge( $params, array( $per_page, ( $page - 1 ) * $per_page ) )
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- categories + thumbnails for the page ---- */

	$t0  = microtime( true );
	$ids = array();
	foreach ( (array) $rows as $row ) {
		$ids[] = (int) $row->ID;
	}
	$ids = ams_fast_id_list( $ids );

	// Ordered BY NAME, because that is the order wp_get_object_terms() uses by
	// default — so the first row for a post is the one WordPress reports as its
	// primary category. The `categories` array itself is then sorted by term id,
	// which is the order the live endpoint emits.
	$cats_by_post = array();
	$primary      = array();
	if ( $ids ) {
		$term_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT tr.object_id, t.term_id, t.name, t.slug
				 FROM $T_TERMREL tr
				 INNER JOIN $T_TERMTAX tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
				 INNER JOIN $T_TERMS t ON t.term_id = tt.term_id
				 WHERE tr.object_id IN (" . ams_fast_placeholders( $ids ) . ") AND tt.taxonomy = 'category'
				 ORDER BY t.name ASC",
				$ids
			)
		);
		foreach ( (array) $term_rows as $row ) {
			$pid = (int) $row->object_id;
			if ( ! isset( $primary[ $pid ] ) ) {
				$primary[ $pid ] = (string) $row->slug;
			}
			$cats_by_post[ $pid ][] = array(
				'id'   => (int) $row->term_id,
				'name' => (string) $row->name,
				'slug' => (string) $row->slug,
			);
		}
		foreach ( $cats_by_post as $pid => $list ) {
			usort(
				$list,
				function ( $a, $b ) {
					return $a['id'] - $b['id'];
				}
			);
			$cats_by_post[ $pid ] = $list;
		}
	}

	$thumbs = ams_fast_thumbnail_urls( $ids, array() ); // FULL size, as the plugin sends
	$ms_extras = ams_fast_ms( microtime( true ) - $t0 );

	/* ---- the envelope ---- */

	$items = array();
	foreach ( (array) $rows as $row ) {
		$id      = (int) $row->ID;
		$items[] = array(
			'id'           => $id,
			'title'        => (string) $row->post_title,
			'categories'   => isset( $cats_by_post[ $id ] ) ? $cats_by_post[ $id ] : array(),
			'category'     => isset( $primary[ $id ] ) ? $primary[ $id ] : '',
			'slug'         => (string) $row->post_name,
			// See the header note: the timestamp, not the relative phrase.
			'post_date'    => (string) $row->post_date,
			'publish_date' => (string) $row->post_date,
			'thumbnail'    => isset( $thumbs[ $id ] ) ? $thumbs[ $id ] : '',
			'description'  => ams_fast_card_description( $row->post_excerpt, $row->post_content ),
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'         => true,
			'resource'   => 'pub-articles',
			// The list endpoints' own envelope, so the existing mappers work
			// unchanged. `status` is theirs; `ok`/`ms` are ours.
			'status'     => 'OK',
			'data'       => $items,
			'page'       => $page,
			'per_page'   => $per_page,
			'total'      => $total,
			'total_page' => (int) ceil( $total / $per_page ),
			'ms'         => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => $ms_extras ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: pub-categories — the category tree WITH links
 * ---------------------------------------------------------------------------
 * Mirrors GET /wp/v2/categories?per_page=100&_fields=id,parent,name,slug,count,link
 * — the one call on EVERY public page's critical path (nav + href/depth joins)
 * and the first SERIAL call on category/landing/static routes.
 *
 * THE LINK IS STORED DATA, NOT A RULE — measured 2026-08-05: 23 of this
 * site's 26 category links are hand-entered Custom Permalinks (e.g. the term
 * entertainment-celebrity-news links to /category/celebrity/news/, while
 * entertainment-news keeps its full slug — no derivation covers both). They
 * live in the `custom_permalink_table` option, keyed by permalink path with
 * array('id' => term_id) values; Custom Permalinks' own term filter iterates
 * that table and prepends home. get_term_link() itself needs the rewrite
 * layer plus that filter, neither of which exists under SHORTINIT — so this
 * reads the same stored table the filter reads. Terms absent from the table
 * (3 of 26 today) fall back to core's form: home/<base>/<parent chain>/.
 * ======================================================================== */

/**
 * Pure half, unit-tested offline: every category's link from the terms table
 * ($terms is term_id => array(slug, parent)), the custom_permalink_table
 * option's value, and the home/category_base options.
 *
 * First matching table row wins, because that is how Custom Permalinks' term
 * filter iterates. The fallback walks the parent chain with the same cycle
 * guard style as ams_fast_descendant_ids — a corrupt taxonomy must not hang.
 */
function ams_fast_term_links( array $terms, $permalink_table, $home, $category_base ) {
	$home = rtrim( (string) $home, '/' );
	$base = trim( (string) $category_base, '/' );
	if ( '' === $base ) {
		$base = 'category';
	}

	$custom = array();
	if ( is_array( $permalink_table ) ) {
		foreach ( $permalink_table as $path => $info ) {
			$id = is_array( $info ) && isset( $info['id'] ) ? (int) $info['id'] : 0;
			if ( $id > 0 && ! isset( $custom[ $id ] ) ) {
				$custom[ $id ] = (string) $path;
			}
		}
	}

	$links = array();
	foreach ( $terms as $id => $t ) {
		$id = (int) $id;
		if ( isset( $custom[ $id ] ) ) {
			// home_url('/') . <table key>, exactly as the plugin's filter builds it.
			$links[ $id ] = $home . '/' . ltrim( $custom[ $id ], '/' );
			continue;
		}
		$segs  = array( (string) $t['slug'] );
		$p     = (int) $t['parent'];
		$guard = 0;
		while ( $p > 0 && isset( $terms[ $p ] ) && $guard++ < 10 ) {
			array_unshift( $segs, (string) $terms[ $p ]['slug'] );
			$p = (int) $terms[ $p ]['parent'];
		}
		$links[ $id ] = $home . '/' . $base . '/' . implode( '/', $segs ) . '/';
	}
	return $links;
}

function ams_fast_res_pub_categories() {
	global $wpdb, $T_TERMS, $T_TERMTAX, $T_OPTIONS, $AMS_FAST_BOOT_MS;

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		"SELECT t.term_id, t.name, t.slug, tt.parent, tt.count
		 FROM $T_TERMS t
		 INNER JOIN $T_TERMTAX tt ON tt.term_id = t.term_id
		 WHERE tt.taxonomy = 'category'
		 ORDER BY t.name ASC, t.term_id ASC
		 LIMIT 100"
	);

	$terms = array();
	foreach ( (array) $rows as $row ) {
		$terms[ (int) $row->term_id ] = array(
			'slug'   => (string) $row->slug,
			'parent' => (int) $row->parent,
		);
	}

	// Isolate the one live-only dependency: if reading the permalink table
	// throws, answer with DERIVED links and say so, instead of a blind 500 —
	// 23 of 26 links would be wrong, which the verification harness reports
	// loudly, while the frontend's fallback keeps serving REST either way.
	$link_source = 'custom_permalink_table';
	$table       = null;
	try {
		$table = get_option( 'custom_permalink_table' );
	} catch ( Throwable $e ) {
		$link_source = 'derived_only:' . get_class( $e );
		$table       = array();
	}
	// NOT get_option('category_base'): that THROWS under SHORTINIT (measured
	// live, v1.4.1 debug catch) — default-filters.php, which IS loaded, hooks
	// _wp_filter_taxonomy_base onto option_category_base, but the function
	// lives in rewrite.php, which is NOT loaded, so the filter fires into a
	// TypeError. 'home' carries no such filter. Read the row raw instead;
	// ams_fast_term_links trims the slashes the filter would have stripped.
	$category_base = (string) $wpdb->get_var(
		"SELECT option_value FROM $T_OPTIONS WHERE option_name = 'category_base' LIMIT 1"
	);
	$links = ams_fast_term_links(
		$terms,
		$table,
		(string) get_option( 'home' ),
		$category_base
	);

	$items = array();
	foreach ( (array) $rows as $row ) {
		$id      = (int) $row->term_id;
		$items[] = array(
			'id'     => $id,
			'name'   => (string) $row->name,
			'slug'   => (string) $row->slug,
			'parent' => (int) $row->parent,
			'count'  => (int) $row->count,
			'link'   => isset( $links[ $id ] ) ? $links[ $id ] : '',
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'         => true,
			'resource'   => 'pub-categories',
			'linkSource' => $link_source,
			'data'       => $items,
			'ms'         => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => ams_fast_ms( microtime( true ) - $t0 ) ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: pub-programs — the program registry, both post types in one call
 * ---------------------------------------------------------------------------
 * Replaces the TWO core-REST calls behind getProgramRegistry() (wp/v2/movie +
 * wp/v2/tv_show with _embed=wp:featuredmedia), which sit on every program,
 * episode AND landing page. Published rows only, anonymous by definition.
 *
 * Emits what the registry's mappers actually read, flattened: id / slug /
 * title (raw post_title — the frontend runs decodeEntities on REST's rendered
 * title, and raw-vs-decoded is diffed by the verification harness), the three
 * meta ints, and the featured image as source_url/width/height/sizes — the
 * exact fields posterOf() consults for its portrait check and its preferred
 * 300x450 rendition.
 * ======================================================================== */

/**
 * REST media_details reduced to what posterOf() reads, offloader-aware.
 * $meta is meta_key => meta_value for ONE attachment. Pure given the rows —
 * unit-tested offline against both an offloaded and a local fixture.
 */
function ams_fast_media_details( array $meta, $local_base ) {
	$file = isset( $meta['_wp_attached_file'] ) ? (string) $meta['_wp_attached_file'] : '';
	if ( '' === $file ) {
		return null;
	}

	list( $base, $how, $dir ) = ams_fast_attachment_base( $meta, $local_base );
	if ( null === $dir ) {
		$dir = dirname( $file );
		$dir = ( '.' === $dir || '' === $dir ) ? '' : $dir . '/';
	}

	$data  = ams_fast_unserialize( isset( $meta['_wp_attachment_metadata'] ) ? $meta['_wp_attachment_metadata'] : '' );
	$sizes = array();
	if ( ! empty( $data['sizes'] ) && is_array( $data['sizes'] ) ) {
		foreach ( $data['sizes'] as $name => $s ) {
			if ( empty( $s['file'] ) ) {
				continue;
			}
			$sizes[ (string) $name ] = array(
				'source_url' => $base . '/' . $dir . (string) $s['file'],
				'width'      => isset( $s['width'] ) ? (int) $s['width'] : 0,
				'height'     => isset( $s['height'] ) ? (int) $s['height'] : 0,
			);
		}
	}

	return array(
		'source_url' => $base . '/' . $dir . basename( $file ),
		'width'      => isset( $data['width'] ) ? (int) $data['width'] : 0,
		'height'     => isset( $data['height'] ) ? (int) $data['height'] : 0,
		'sizes'      => $sizes,
	);
}

/**
 * Meta entries whose VALUE could name an attachment: any positive integer,
 * under any key. Returned as key => id so a resolved image can be reported
 * under the meta key it came from.
 *
 * There is deliberately NO key-name test. v1.5.0 required the `_menu_item_`
 * prefix and therefore missed `_thumbnail_id`, which is where the menu-image
 * plugin actually stores the icon — the resource answered ok:true with an
 * empty `images` map on every row, and the frontend's fallback hid it. The
 * caller's INNER JOIN on post_type='attachment' is the real filter: ids that
 * name a POST rather than an attachment (`_menu_item_object_id`) drop out
 * there, which is the only place that can know the difference.
 */
function ams_fast_meta_attachment_ids( array $meta ) {
	$out = array();
	foreach ( $meta as $key => $value ) {
		if ( ctype_digit( (string) $value ) && (int) $value > 0 ) {
			$out[ (string) $key ] = (int) $value;
		}
	}
	return $out;
}

function ams_fast_res_pub_programs() {
	global $wpdb, $T_POSTS, $T_POSTMETA, $AMS_FAST_BOOT_MS;

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		"SELECT p.ID, p.post_title, p.post_name, p.post_type
		 FROM $T_POSTS p
		 WHERE p.post_type IN ('movie','tv_show') AND p.post_status = 'publish'
		 ORDER BY p.post_date DESC, p.ID DESC
		 LIMIT 500"
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	$t0  = microtime( true );
	$ids = array();
	foreach ( (array) $rows as $row ) {
		$ids[] = (int) $row->ID;
	}
	$ids = ams_fast_id_list( $ids );

	// One postmeta sweep: the registry's three meta ints plus the poster id.
	$meta_by_post = array();
	if ( $ids ) {
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA
				 WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ")
				   AND meta_key IN ('_khi_tv_show_id','_movie_release_date','_tv_show_release_date','_thumbnail_id')",
				$ids
			)
		);
		foreach ( (array) $meta_rows as $row ) {
			$meta_by_post[ (int) $row->post_id ][ (string) $row->meta_key ] = (string) $row->meta_value;
		}
	}

	$att_of = array();
	foreach ( $meta_by_post as $pid => $m ) {
		if ( ! empty( $m['_thumbnail_id'] ) && (int) $m['_thumbnail_id'] > 0 ) {
			$att_of[ $pid ] = (int) $m['_thumbnail_id'];
		}
	}
	$media_by_post = array();
	$att_ids       = ams_fast_id_list( array_values( $att_of ) );
	if ( $att_ids ) {
		$att_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $att_ids ) . ')',
				$att_ids
			)
		);
		$att_meta = array();
		foreach ( (array) $att_rows as $row ) {
			$att_meta[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
		}
		$local_base = ams_fast_local_uploads_base();
		foreach ( $att_of as $pid => $att_id ) {
			if ( isset( $att_meta[ $att_id ] ) ) {
				$media_by_post[ $pid ] = ams_fast_media_details( $att_meta[ $att_id ], $local_base );
			}
		}
	}

	$movies   = array();
	$tv_shows = array();
	foreach ( (array) $rows as $row ) {
		$id   = (int) $row->ID;
		$m    = isset( $meta_by_post[ $id ] ) ? $meta_by_post[ $id ] : array();
		$item = array(
			'id'    => $id,
			'slug'  => (string) $row->post_name,
			'title' => (string) $row->post_title,
			'meta'  => array(
				'_khi_tv_show_id'       => isset( $m['_khi_tv_show_id'] ) ? (int) $m['_khi_tv_show_id'] : 0,
				'_movie_release_date'   => isset( $m['_movie_release_date'] ) ? (int) $m['_movie_release_date'] : 0,
				'_tv_show_release_date' => isset( $m['_tv_show_release_date'] ) ? (int) $m['_tv_show_release_date'] : 0,
			),
			'media' => isset( $media_by_post[ $id ] ) ? $media_by_post[ $id ] : null,
		);
		if ( 'movie' === (string) $row->post_type ) {
			$movies[] = $item;
		} else {
			$tv_shows[] = $item;
		}
	}
	$ms_extras = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'pub-programs',
			'data'     => array( 'movies' => $movies, 'tv_shows' => $tv_shows ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => $ms_extras ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: pub-menu — a nav menu's items, for the public site's own menus
 * ---------------------------------------------------------------------------
 * The public site renders WordPress's "AMS Infotainment Third Menu" as its
 * program-icon strip. Core REST CANNOT serve it: /wp/v2/menus and
 * /wp/v2/menu-items both answer 401 rest_cannot_view to anonymous callers
 * (measured 2026-08-05), because menus are an edit_theme_options surface in
 * core. The markup they produce is nonetheless on every page of the live site
 * — so this exposes the same visible navigation, and only that.
 *
 * SAFETY, same boundary as every other pub- resource: menu items are read by
 * MENU SLUG from an allow-list, only post_status=publish rows are returned,
 * there is a hard LIMIT, and nothing here consults a user.
 *
 * THE ICON PROBLEM, and why `meta` comes back whole: the icons are added by a
 * menu-image plugin that stores its attachment id in POSTMETA under a key
 * this file cannot know (the plugin's meta is not registered in REST, so its
 * key is not discoverable from outside the database). Rather than guess a key
 * and ship a strip of broken images, EVERY meta key on the item is returned
 * as-is, and every value that is a positive integer naming a real attachment
 * is resolved to its media details in `images`, keyed by the meta key it came
 * from. That makes the resource correct WHATEVER the plugin calls its field,
 * and the live response documents the real key for whoever reads it next.
 *
 * ANSWERED, on live, 2026-08-06 (v1.5.0 -> v1.5.1): the key is `_thumbnail_id`
 * — the plugin stores the icon as the menu item's FEATURED IMAGE, a core key
 * outside the `_menu_item_*` namespace entirely. v1.5.0 collected candidates
 * with `strpos($key,'_menu_item_') === 0`, so it skipped the one key that
 * mattered and returned an EMPTY `images` map on all 14 rows; the frontend
 * dropped every row and silently kept its hardcoded fallback. The prefix test
 * is gone: any integer-valued meta is a candidate, and the INNER JOIN on
 * post_type='attachment' below is what makes that safe — it is the real
 * filter, and it already excludes `_menu_item_object_id` (a POST id).
 *
 * Note `_menu_item_icon` DOES exist on every row and is EMPTY — the plugin's
 * icon-CLASS field. Guessing by name would have picked it and shipped a blank
 * strip that looked deliberate. Companion key: `_menu_item_image_size` names
 * the rendition the live theme renders (`menu-36x36`, `menu-48x48`, `full`),
 * which is why `sizes` is returned alongside `source_url`.
 * ======================================================================== */

/** Menus this resource will serve. An allow-list, not a free parameter: the
 *  public site has no business reading arbitrary menus by name. */
function ams_fast_public_menus() {
	return array(
		// The program-icon strip under the main nav (មាតិកាឌីជីថល).
		'ams-infotainment-third-menu',
		// Registered for the same strip on mobile + the secondary row.
		'ams-infotainment-mobile',
		'ams-infotainment-secondary-menu',
	);
}

function ams_fast_res_pub_menu() {
	global $wpdb, $T_POSTS, $T_POSTMETA, $T_TERMS, $T_TERMTAX, $T_TERMREL, $AMS_FAST_BOOT_MS;

	$slug    = isset( $_GET['menu'] ) ? (string) $_GET['menu'] : '';
	$allowed = ams_fast_public_menus();
	if ( ! in_array( $slug, $allowed, true ) ) {
		ams_fast_fail( 404, 'unknown_menu', $slug );
	}

	$t0  = microtime( true );
	$row = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT tt.term_taxonomy_id, t.term_id, t.name
			 FROM $T_TERMS t
			 INNER JOIN $T_TERMTAX tt ON tt.term_id = t.term_id
			 WHERE tt.taxonomy = 'nav_menu' AND t.slug = %s
			 LIMIT 1",
			$slug
		)
	);
	if ( ! $row ) {
		ams_fast_fail( 404, 'menu_not_found', $slug );
	}

	$items = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT p.ID, p.post_title, p.post_excerpt, p.menu_order
			 FROM $T_POSTS p
			 INNER JOIN $T_TERMREL tr ON tr.object_id = p.ID
			 WHERE tr.term_taxonomy_id = %d
			   AND p.post_type = 'nav_menu_item'
			   AND p.post_status = 'publish'
			 ORDER BY p.menu_order ASC, p.ID ASC
			 LIMIT 200",
			(int) $row->term_taxonomy_id
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	$t0  = microtime( true );
	$ids = array();
	foreach ( (array) $items as $it ) {
		$ids[] = (int) $it->ID;
	}
	$ids = ams_fast_id_list( $ids );

	// Every meta key on the items, not a fixed list — see the header note.
	$meta_by_item = array();
	if ( $ids ) {
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA
				 WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ')',
				$ids
			)
		);
		foreach ( (array) $meta_rows as $m ) {
			$meta_by_item[ (int) $m->post_id ][ (string) $m->meta_key ] = (string) $m->meta_value;
		}
	}

	// Any meta value that looks like an attachment id, resolved in ONE sweep.
	$candidate_ids = array();
	foreach ( $meta_by_item as $item_id => $meta ) {
		foreach ( ams_fast_meta_attachment_ids( $meta ) as $att_id ) {
			$candidate_ids[] = $att_id;
		}
	}
	$candidate_ids = ams_fast_id_list( array_unique( $candidate_ids ) );

	$att_meta = array();
	if ( $candidate_ids ) {
		// Only rows that really are attachments — _menu_item_object_id holds a
		// POST id, which would otherwise resolve to a nonsense image URL.
		$att_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT pm.post_id, pm.meta_key, pm.meta_value
				 FROM $T_POSTMETA pm
				 INNER JOIN $T_POSTS p ON p.ID = pm.post_id AND p.post_type = 'attachment'
				 WHERE pm.post_id IN (" . ams_fast_placeholders( $candidate_ids ) . ')',
				$candidate_ids
			)
		);
		foreach ( (array) $att_rows as $m ) {
			$att_meta[ (int) $m->post_id ][ (string) $m->meta_key ] = $m->meta_value;
		}
	}

	$local_base = ams_fast_local_uploads_base();
	$out        = array();
	foreach ( (array) $items as $it ) {
		$id   = (int) $it->ID;
		$meta = isset( $meta_by_item[ $id ] ) ? $meta_by_item[ $id ] : array();

		$images = array();
		foreach ( ams_fast_meta_attachment_ids( $meta ) as $key => $att ) {
			if ( isset( $att_meta[ $att ] ) ) {
				$details = ams_fast_media_details( $att_meta[ $att ], $local_base );
				if ( $details ) {
					$images[ $key ] = array( 'id' => $att ) + $details;
				}
			}
		}

		$out[] = array(
			'id'        => $id,
			'order'     => (int) $it->menu_order,
			// post_title is the LABEL. REST's title.rendered for these runs the
			// menu-image plugin's filter and comes back as a <span> + <img>
			// blob; the raw column is the text the editor typed.
			'title'     => (string) $it->post_title,
			'attr_title' => (string) $it->post_excerpt,
			'parent'    => isset( $meta['_menu_item_menu_item_parent'] ) ? (int) $meta['_menu_item_menu_item_parent'] : 0,
			'type'      => isset( $meta['_menu_item_type'] ) ? (string) $meta['_menu_item_type'] : '',
			'object'    => isset( $meta['_menu_item_object'] ) ? (string) $meta['_menu_item_object'] : '',
			'object_id' => isset( $meta['_menu_item_object_id'] ) ? (int) $meta['_menu_item_object_id'] : 0,
			'url'       => isset( $meta['_menu_item_url'] ) ? (string) $meta['_menu_item_url'] : '',
			'target'    => isset( $meta['_menu_item_target'] ) ? (string) $meta['_menu_item_target'] : '',
			'classes'   => ams_fast_unserialize( isset( $meta['_menu_item_classes'] ) ? $meta['_menu_item_classes'] : '' ),
			'meta'      => $meta,
			'images'    => $images,
		);
	}
	$ms_extras = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'pub-menu',
			'data'     => array(
				'menu'  => array( 'id' => (int) $row->term_id, 'slug' => $slug, 'name' => (string) $row->name ),
				'items' => $out,
			),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows, 'extras' => $ms_extras ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: pub-authors — the public author list
 * ---------------------------------------------------------------------------
 * Mirrors GET /wp/v2/users?per_page=100 as an ANONYMOUS caller sees it — the
 * last WP REST call on the public site's hot paths. It is read three times:
 * the ក្រុមការងារ block on ALL 11 landing pages, `getAuthorBySlug()` before an
 * author archive can start, and the /author index. ~4.2s each, measured.
 *
 * THIS IS THE ONE pub- RESOURCE THAT SERVES USER ROWS, so read the boundary
 * before changing it:
 *
 *  - It emits FOUR fields — id, slug (user_nicename), name (display_name) and
 *    description. Never user_login, user_email, user_registered, roles, caps
 *    or capabilities. Those are what a `context=edit` reader gets, and no
 *    anonymous caller has ever seen them on this site.
 *  - NO avatar. Core answers `avatar_urls`, which is an md5 of the user's
 *    email address; reproducing it would mean hashing every author's email
 *    into a public response. Nothing on this site renders it (the landing
 *    block pins its own portraits — see TEAM in src/lib/authors.ts), so the
 *    frontend's AuthorProfile dropped the field instead. If a surface ever
 *    needs a real avatar, take it from Simple Author Box's user meta, not
 *    from a mail hash.
 *  - WHO COUNTS AS AN AUTHOR is core's rule, translated: WP_User_Query's
 *    `has_published_posts`, which the REST users controller sets to
 *    get_post_types(show_in_rest => true) for any caller without list_users.
 *    It expands to `ID IN (SELECT DISTINCT post_author FROM posts WHERE
 *    post_status='publish' AND post_type IN (...))`. Note `attachment` is in
 *    that list but attachments are `inherit`, never `publish` — so uploading
 *    media does NOT make an account public, on either path.
 *
 * The type list is PINNED below because SHORTINIT has no post-type registry.
 * Verified 40/40 against anonymous REST on 2026-08-05. Drift direction if a
 * plugin later registers a REST-enabled type: an author whose ONLY published
 * content is of that type would be missing here, and their archive would 404 —
 * so re-run the verification harness after adding a post type, and prefer
 * failing that way over quietly widening the list.
 *
 * LIMIT 100 mirrors the frontend's `per_page=100`, so the two paths cannot
 * disagree at the boundary. The day this site has more than 100 authors, BOTH
 * paths need paging.
 * ======================================================================== */

/**
 * The post types that make a user publicly an author, pinned. Pure, so the
 * offline tests can assert the shape (this is the security-relevant half:
 * every entry widens who is public).
 */
function ams_fast_public_author_post_types() {
	return array(
		'post', 'page', 'attachment', 'nav_menu_item', 'wp_block', 'wp_template',
		'wp_template_part', 'wp_global_styles', 'wp_navigation', 'wp_font_family',
		'wp_font_face', 'mas_static_content', 'episode', 'tv_show',
		'tv_show_playlist', 'video', 'video_playlist', 'movie', 'movie_playlist',
		'person',
	);
}

function ams_fast_res_pub_authors() {
	global $wpdb, $T_POSTS, $T_USERS, $T_USERMETA, $AMS_FAST_BOOT_MS;

	$types = ams_fast_public_author_post_types();

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT u.ID, u.user_nicename, u.display_name, um.meta_value AS description
			 FROM $T_USERS u
			 LEFT JOIN $T_USERMETA um
			     ON um.user_id = u.ID AND um.meta_key = 'description'
			 WHERE u.ID IN (
			     SELECT DISTINCT p.post_author
			     FROM $T_POSTS p
			     WHERE p.post_status = 'publish'
			       AND p.post_type IN (" . ams_fast_placeholders( $types, '%s' ) . ")
			 )
			 ORDER BY u.display_name ASC
			 LIMIT 100",
			$types
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	$out = array();
	foreach ( (array) $rows as $row ) {
		$out[] = array(
			'id'          => (int) $row->ID,
			'slug'        => (string) $row->user_nicename,
			'name'        => (string) $row->display_name,
			'description' => (string) $row->description,
		);
	}

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'pub-authors',
			'data'     => $out,
			'total'    => count( $out ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: pub-comment-counts — how many approved comments a post has
 * ---------------------------------------------------------------------------
 * Mirrors the ONE number the article page reads out of
 * GET /wp/v2/comments?post=<id>&per_page=1 — its `X-WP-Total` header. That call
 * costs a full ~4s plugin boot to answer with an integer, and the article route
 * pays it on every ISR regeneration.
 *
 * THE COUNT IS NOT wp_posts.comment_count, and the difference is not academic
 * on this site: WordPress's stored column counts every APPROVED row of any
 * type, pingbacks and trackbacks included, while the REST comments controller
 * defaults to `type=comment`, which WP_Comment_Query expands to
 * comment_type IN ('', 'comment'). Every post here has ping_status=open
 * (measured 20/20 on the newest posts), so a single incoming pingback would
 * silently make the column disagree with the number the page has always shown.
 * This counts what REST counts.
 *
 * Anonymous callers also only ever see APPROVED comments, so comment_approved
 * is pinned to '1' — a pending or spam row must not be able to bump a public
 * counter.
 *
 * PUBLISHED POSTS ONLY, like every other pub- resource: the post id is joined
 * against wp_posts and must be a published, unprotected post. An unknown,
 * draft, trashed or password-protected id answers 0 rather than a count, so
 * this can never confirm the existence of something the site is not serving.
 * ======================================================================== */

/**
 * Pure half, unit-tested offline: the count rows (post_id => n, as strings
 * from the database) shaped into the response map.
 *
 * EVERY requested id appears in the output, whether or not it has comments —
 * the caller asked about it, and an absent key would be indistinguishable from
 * a dropped one. Order follows the request, not the database.
 */
function ams_fast_comment_count_map( array $rows, array $ids ) {
	$counts = array();
	foreach ( $rows as $row ) {
		$post_id = is_object( $row ) ? $row->comment_post_ID : $row['comment_post_ID'];
		$n       = is_object( $row ) ? $row->n : $row['n'];
		$counts[ (int) $post_id ] = (int) $n;
	}

	$out = array();
	foreach ( $ids as $id ) {
		$out[ (string) (int) $id ] = isset( $counts[ (int) $id ] ) ? $counts[ (int) $id ] : 0;
	}
	return $out;
}

function ams_fast_res_pub_comment_counts() {
	global $wpdb, $T_POSTS, $T_COMMENTS, $AMS_FAST_BOOT_MS;

	// Same ceiling as a page of rows: this is a batch lookup, not a crawl.
	$ids = ams_fast_id_list( explode( ',', ams_fast_param( 'post_id' ) ) );
	$ids = array_slice( $ids, 0, AMS_FAST_MAX_PER_PAGE );
	if ( ! $ids ) {
		ams_fast_fail( 400, 'missing_post_id' );
	}

	$t0   = microtime( true );
	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT c.comment_post_ID, COUNT(*) AS n
			 FROM $T_COMMENTS c
			 INNER JOIN $T_POSTS p
			     ON p.ID = c.comment_post_ID
			    AND p.post_status = 'publish'
			    AND p.post_password = ''
			 WHERE c.comment_post_ID IN (" . ams_fast_placeholders( $ids ) . ")
			   AND c.comment_approved = '1'
			   AND c.comment_type IN ('', 'comment')
			 GROUP BY c.comment_post_ID",
			$ids
		)
	);
	$ms_rows = ams_fast_ms( microtime( true ) - $t0 );

	ams_fast_out(
		200,
		array(
			'ok'       => true,
			'resource' => 'pub-comment-counts',
			'counts'   => ams_fast_comment_count_map( (array) $rows, $ids ),
			'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS, 'rows' => $ms_rows ),
		)
	);
}

/* ===========================================================================
 * RESOURCE: diag — everything the implementation had to assume, measured
 * ---------------------------------------------------------------------------
 * Temporary. Answers, in one round trip: is AUTH_KEY defined (only AUTH_SALT
 * was ever confirmed), does the object cache really work here, and — the open
 * question — which meta key marks an attachment as offloaded.
 *
 * Prints NO secrets: salt constants are reported as booleans plus a truncated
 * fingerprint, and the offloader's settings are reported with values redacted
 * unless the key is on a safe allow-list. Its S3 secret is in that option.
 * ======================================================================== */

function ams_fast_diag() {
	global $wpdb, $T_POSTS, $T_POSTMETA, $T_USERS, $T_OPTIONS, $AMS_FAST_BOOT_MS;

	$out = array( 'ok' => true, 'resource' => 'diag' );

	$out['php'] = array(
		'version' => PHP_VERSION,
		'sapi'    => PHP_SAPI,
		'opcache' => function_exists( 'opcache_get_status' ),
		'prefix'  => $wpdb->prefix,
		'tables'  => array( 'posts' => $T_POSTS, 'users' => $T_USERS, 'postmeta' => $T_POSTMETA ),
	);

	/* ---- the auth question ---- */

	$constants = array();
	foreach ( ams_fast_salt_constant_names() as $const ) {
		$constants[ $const ] = defined( $const ) && '' !== (string) constant( $const );
	}
	$seen       = array();
	$duplicated = false;
	foreach ( $constants as $const => $present ) {
		if ( ! $present ) {
			continue;
		}
		$value = (string) constant( $const );
		if ( isset( $seen[ $value ] ) ) {
			$duplicated = true;
		}
		$seen[ $value ] = true;
	}
	$salt        = ams_fast_salt_auth();
	$out['auth'] = array(
		'constants'          => $constants,
		'anyDuplicatedValue' => $duplicated,
		// Length and a fingerprint only — enough to confirm it resolved to
		// something real and to compare across deploys, useless as a secret.
		'saltLength'         => strlen( $salt ),
		'saltFingerprint'    => substr( hash( 'sha256', $salt ), 0, 12 ),
		'note'               => 'AUTH_KEY false or saltLength 0 means the key derivation cannot match ams-frontend-api.',
	);

	/* ---- the cache question ---- */

	$cache = array(
		'wp_cache_get'        => function_exists( 'wp_cache_get' ),
		'externalObjectCache' => function_exists( 'wp_using_ext_object_cache' ) && wp_using_ext_object_cache(),
		'dropin'              => defined( 'WP_CONTENT_DIR' ) && file_exists( WP_CONTENT_DIR . '/object-cache.php' ),
	);
	if ( $cache['wp_cache_get'] ) {
		$probe = 'diag:' . substr( hash( 'sha256', (string) getmypid() ), 0, 8 );
		ams_fast_cache_set( $probe, array( 'ok' => 1 ), 30 );
		$t0                   = microtime( true );
		$read                 = ams_fast_cache_get( $probe, $hit );
		$cache['roundTripMs'] = ams_fast_ms( microtime( true ) - $t0 );
		$cache['readBack']    = ( $hit && is_array( $read ) && ! empty( $read['ok'] ) );
	}
	$out['cache'] = $cache;

	/* ---- the image question ---- */

	$safe_option_keys = '/(domain|url|endpoint|bucket|region|provider|prefix|path_style|retention|version)/i';
	$secret_keys      = '/(secret|access|key|token|password|credential)/i';

	$option_names = $wpdb->get_col(
		"SELECT option_name FROM $T_OPTIONS
		 WHERE option_name LIKE '%offload%' OR option_name LIKE '%kho%'
		    OR option_name LIKE '%khs3%' OR option_name LIKE '%s3%'
		 LIMIT 40"
	);
	$options = array();
	foreach ( (array) $option_names as $name ) {
		$value = get_option( $name );
		if ( is_array( $value ) ) {
			// Secret first, allow-list second, type-only for everything else.
			// The S3 secret access key lives in one of these options; nothing
			// in here is worth risking it for.
			$shown = array();
			foreach ( $value as $k => $v ) {
				if ( preg_match( $secret_keys, (string) $k ) ) {
					$shown[ $k ] = '[redacted]';
				} elseif ( preg_match( $safe_option_keys, (string) $k ) && is_scalar( $v ) ) {
					$shown[ $k ] = (string) $v;
				} else {
					$shown[ $k ] = '[' . gettype( $v ) . ']';
				}
			}
			$options[ $name ] = $shown;
		} else {
			$options[ $name ] = preg_match( $secret_keys, (string) $name ) ? '[redacted]' : substr( (string) $value, 0, 120 );
		}
	}

	$core_options = array();
	foreach ( array( 'siteurl', 'home', 'upload_url_path', 'upload_path', 'uploads_use_yearmonth_folders', 'timezone_string', 'gmt_offset', 'thumbnail_size_w' ) as $name ) {
		$core_options[ $name ] = get_option( $name );
	}

	// Which meta keys do real attachments actually carry?
	$recent_atts = $wpdb->get_col( "SELECT ID FROM $T_POSTS WHERE post_type = 'attachment' ORDER BY ID DESC LIMIT 40" );
	$key_counts  = array();
	$samples     = array();
	if ( $recent_atts ) {
		$meta_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $recent_atts ) . ')',
				$recent_atts
			)
		);
		$by_att = array();
		foreach ( (array) $meta_rows as $row ) {
			$key                                   = (string) $row->meta_key;
			$key_counts[ $key ]                    = isset( $key_counts[ $key ] ) ? $key_counts[ $key ] + 1 : 1;
			$by_att[ (int) $row->post_id ][ $key ] = $row->meta_value;
		}
		$local_base = ams_fast_local_uploads_base();
		$shown      = 0;
		foreach ( $by_att as $att_id => $meta ) {
			if ( $shown++ >= 3 ) {
				break;
			}
			$flat = array();
			foreach ( $meta as $k => $v ) {
				$flat[ $k ] = is_string( $v ) ? substr( $v, 0, 200 ) : $v;
			}
			$samples[] = array(
				'attachmentId' => $att_id,
				'resolvedUrl'  => ams_fast_attachment_url( $meta, $local_base, $how ),
				'resolvedBy'   => $how,
				'compareWith'  => '/wp-json/wp/v2/media/' . $att_id,
				'meta'         => $flat,
			);
		}
	}

	// THE ~642. An attachment with no khs3data_offloaded row exists only on
	// local disk, and is the case a CDN-for-everything rule would silently
	// break. Bounded to the newest 3,000 attachments so the LEFT JOIN cannot
	// turn into a full scan of 115,405 rows.
	$never = array();
	$ids   = $wpdb->get_col(
		"SELECT p.ID FROM (
			SELECT ID FROM $T_POSTS WHERE post_type = 'attachment' ORDER BY ID DESC LIMIT 3000
		 ) p
		 LEFT JOIN $T_POSTMETA m ON m.post_id = p.ID AND m.meta_key = 'khs3data_offloaded'
		 WHERE m.post_id IS NULL
		 ORDER BY p.ID DESC LIMIT 2"
	);
	if ( $ids ) {
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM $T_POSTMETA WHERE post_id IN (" . ams_fast_placeholders( $ids ) . ')',
				$ids
			)
		);
		$grouped = array();
		foreach ( (array) $rows as $row ) {
			$grouped[ (int) $row->post_id ][ (string) $row->meta_key ] = $row->meta_value;
		}
		$local_base = ams_fast_local_uploads_base();
		foreach ( $grouped as $att_id => $meta ) {
			$never[] = array(
				'attachmentId' => $att_id,
				'resolvedUrl'  => ams_fast_attachment_url( $meta, $local_base, $how ),
				'resolvedBy'   => $how,
				'compareWith'  => '/wp-json/wp/v2/media/' . $att_id,
				'metaKeys'     => array_keys( $meta ),
			);
		}
	}

	$out['images'] = array(
		'cdnBase'            => AMS_FAST_CDN_BASE,
		'localBase'          => ams_fast_local_uploads_base(),
		'neverOffloaded'     => $never,
		'coreOptions'        => $core_options,
		'offloadOptions'     => $options,
		'attachmentMetaKeys' => $key_counts,
		'samples'            => $samples,
	);

	// The offloader's own source is the fastest way to learn its meta keys.
	$grep = array();
	if ( defined( 'WP_PLUGIN_DIR' ) ) {
		foreach ( array( '*offload*', '*kho*', '*khs3*', '*s3*' ) as $pattern ) {
			foreach ( (array) glob( WP_PLUGIN_DIR . '/' . $pattern, GLOB_ONLYDIR ) as $dir ) {
				$found = array();
				foreach ( (array) glob( $dir . '/*.php' ) as $file ) {
					$src = @file_get_contents( $file, false, null, 0, 400000 );
					if ( ! $src ) {
						continue;
					}
					if ( preg_match_all( "/['\"](_[a-z0-9_]*(?:offload|kho|khs3|s3|cloud)[a-z0-9_]*)['\"]/i", $src, $m ) ) {
						foreach ( array_unique( $m[1] ) as $key ) {
							$found[ $key ] = true;
						}
					}
				}
				$grep[ basename( $dir ) ] = array_keys( $found );
			}
		}
	}
	$out['images']['metaKeysInPluginSource'] = $grep;

	/* ---- data sanity ---- */

	$counts    = $wpdb->get_results( "SELECT post_status, COUNT(*) n FROM $T_POSTS WHERE post_type = 'post' GROUP BY post_status" );
	$by_status = array();
	foreach ( (array) $counts as $row ) {
		$by_status[ (string) $row->post_status ] = (int) $row->n;
	}
	$roles       = get_option( $wpdb->prefix . 'user_roles' );
	$out['data'] = array(
		'postsByStatus' => $by_status,
		'roles'         => is_array( $roles ) ? array_keys( $roles ) : array(),
		'authorCaps'    => ( is_array( $roles ) && isset( $roles['author']['capabilities'] ) )
			? array_keys( array_filter( $roles['author']['capabilities'] ) )
			: array(),
	);

	/* ---- the article-body question (A5b) ----
	 *
	 * The article EDITOR loads content.rendered, which REST produces by running
	 * the `the_content` filter chain — do_blocks() included, and NO filters run
	 * under SHORTINIT. So the editor can only move to the fast path if stored
	 * bodies are plain HTML rather than block markup.
	 *
	 * This counts rather than samples, because a sample of recent posts would
	 * only describe however the newsroom is writing THIS month. Bounded to the
	 * newest 2,000 posts so the LIKE scan cannot run away.
	 */
	$scan = "SELECT ID, post_content FROM $T_POSTS
			 WHERE post_type = 'post' AND post_status IN ('publish','draft','pending')
			 ORDER BY ID DESC LIMIT 2000";
	$shape = array( 'scanned' => 0, 'blockDelimiters' => 0, 'shortcodes' => 0, 'plainHtml' => 0, 'empty' => 0 );
	foreach ( (array) $wpdb->get_results( $scan ) as $row ) {
		$content = (string) $row->post_content;
		$shape['scanned']++;
		if ( '' === trim( $content ) ) {
			$shape['empty']++;
			continue;
		}
		$has_blocks     = ( false !== strpos( $content, '<!-- wp:' ) );
		$has_shortcodes = (bool) preg_match( '/\[[a-z][a-z0-9_-]*(\s[^\]]*)?\]/i', $content );
		if ( $has_blocks ) {
			$shape['blockDelimiters']++;
		}
		if ( $has_shortcodes ) {
			$shape['shortcodes']++;
		}
		if ( ! $has_blocks && ! $has_shortcodes ) {
			$shape['plainHtml']++;
		}
	}
	$shape['note'] = 'blockDelimiters or shortcodes > 0 means content.rendered CANNOT be reproduced under SHORTINIT; the article editor body must stay on WP REST.';
	$out['contentShape'] = $shape;

	$out['ms'] = array( 'boot' => $AMS_FAST_BOOT_MS );
	ams_fast_out( 200, $out );
}

/* ===========================================================================
 * TEST HOOK
 * ---------------------------------------------------------------------------
 * tests.php includes this file with AMS_FAST_LIB_ONLY defined to exercise the
 * pure functions above — the auth math especially — with no server, no
 * WordPress and no database. Everything below this line is request handling.
 * ======================================================================== */

if ( defined( 'AMS_FAST_LIB_ONLY' ) ) {
	return;
}

/* ===========================================================================
 * REQUEST: reject junk before paying the 145 ms
 * ---------------------------------------------------------------------------
 * The token's structure and expiry can be checked with no database at all, so
 * an unauthenticated flood costs ~1 ms of PHP rather than a full boot. Only a
 * structurally valid, unexpired token gets to load WordPress.
 * ======================================================================== */

if ( 'GET' !== ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : 'GET' ) ) {
	ams_fast_fail( 405, 'method_not_allowed' );
}

$ams_fast_resource  = ams_fast_param( 'r', 'posts' );
$ams_fast_is_diag   = ( 'diag' === $ams_fast_resource );
$ams_fast_is_public = ams_fast_is_public_resource( $ams_fast_resource );
$ams_fast_claims    = null;

if ( $ams_fast_is_diag ) {
	// Diag carries its own gate: it reports server configuration, not user
	// data, and has to be runnable before any user token exists.
	if ( ! hash_equals( AMS_FAST_DIAG_TOKEN, ams_fast_param( 'k' ) ) ) {
		ams_fast_fail( 403, 'diag_forbidden' );
	}
} elseif ( $ams_fast_is_public ) {
	// PUBLISHED CONTENT ONLY — the same rows wp-json serves anonymously, so no
	// token. Optional belt-and-braces: if AMS_FAST_PUBLIC_KEY is defined in
	// wp-config, it must be presented. Undefined (the default) = open, which is
	// the deliberate choice documented above the pub- resources.
	if ( defined( 'AMS_FAST_PUBLIC_KEY' ) && '' !== (string) AMS_FAST_PUBLIC_KEY ) {
		$ams_fast_pub_key = isset( $_SERVER['HTTP_X_AMS_PUBLIC_KEY'] ) ? (string) $_SERVER['HTTP_X_AMS_PUBLIC_KEY'] : '';
		if ( ! hash_equals( (string) AMS_FAST_PUBLIC_KEY, $ams_fast_pub_key ) ) {
			ams_fast_fail( 403, 'public_key_required' );
		}
	}
} else {
	// Header only, never a query parameter: query strings end up in access
	// logs, referrers and error reports. Tokens must not.
	$ams_fast_token = isset( $_SERVER['HTTP_X_AMS_TOKEN'] ) ? trim( (string) $_SERVER['HTTP_X_AMS_TOKEN'] ) : '';
	if ( '' === $ams_fast_token ) {
		ams_fast_fail( 401, 'no_token' );
	}
	$ams_fast_claims = ams_fast_token_claims( $ams_fast_token );
	if ( null === $ams_fast_claims ) {
		ams_fast_fail( 401, 'malformed_token' );
	}
	if ( $ams_fast_claims['exp'] < time() ) {
		ams_fast_fail( 401, 'expired_token' );
	}
}

/* ===========================================================================
 * BOOT — WordPress's database layer, and nothing else
 * ======================================================================== */

$ams_fast_wp_load = '';
$ams_fast_dir     = __DIR__;
for ( $i = 0; $i < 6; $i++ ) {
	$ams_fast_dir = dirname( $ams_fast_dir );
	if ( file_exists( $ams_fast_dir . '/wp-load.php' ) ) {
		$ams_fast_wp_load = $ams_fast_dir . '/wp-load.php';
		break;
	}
}
if ( '' === $ams_fast_wp_load ) {
	ams_fast_fail( 500, 'wp_load_not_found' );
}

define( 'SHORTINIT', true );
$ams_fast_boot_t0 = microtime( true );
require $ams_fast_wp_load;
$AMS_FAST_BOOT_MS = ams_fast_ms( microtime( true ) - $ams_fast_boot_t0 );

global $wpdb;
if ( ! isset( $wpdb ) || ! is_object( $wpdb ) ) {
	ams_fast_fail( 500, 'no_wpdb' );
}

// wp_set_wpdb_vars() fills these in before SHORTINIT returns; fall back to the
// prefix so a surprise degrades into a wrong-table error, not a fatal.
$T_POSTS    = $wpdb->posts ? $wpdb->posts : $wpdb->prefix . 'posts';
$T_POSTMETA = $wpdb->postmeta ? $wpdb->postmeta : $wpdb->prefix . 'postmeta';
$T_USERS    = $wpdb->users ? $wpdb->users : $wpdb->base_prefix . 'users';
$T_USERMETA = $wpdb->usermeta ? $wpdb->usermeta : $wpdb->base_prefix . 'usermeta';
$T_TERMS    = $wpdb->terms ? $wpdb->terms : $wpdb->prefix . 'terms';
$T_TERMTAX  = $wpdb->term_taxonomy ? $wpdb->term_taxonomy : $wpdb->prefix . 'term_taxonomy';
$T_TERMREL  = $wpdb->term_relationships ? $wpdb->term_relationships : $wpdb->prefix . 'term_relationships';
$T_OPTIONS  = $wpdb->options ? $wpdb->options : $wpdb->prefix . 'options';
$T_COMMENTS = $wpdb->comments ? $wpdb->comments : $wpdb->prefix . 'comments';

/* ===========================================================================
 * DISPATCH
 * ======================================================================== */

try {
	if ( $ams_fast_is_diag ) {
		ams_fast_diag();
	}

	// Public resources dispatch BEFORE any user is loaded — there is no user,
	// and nothing below this point may be reachable without a verified token.
	if ( $ams_fast_is_public ) {
		switch ( $ams_fast_resource ) {
			case 'pub-articles':
				ams_fast_res_pub_articles();
				break;

			case 'pub-categories':
				ams_fast_res_pub_categories();
				break;

			case 'pub-programs':
				ams_fast_res_pub_programs();
				break;

			case 'pub-menu':
				ams_fast_res_pub_menu();
				break;

			case 'pub-comment-counts':
				ams_fast_res_pub_comment_counts();
				break;

			case 'pub-authors':
				ams_fast_res_pub_authors();
				break;

			default:
				ams_fast_fail( 404, 'unknown_resource', $ams_fast_resource );
		}
	}

	$ams_fast_user_row = ams_fast_load_user( $ams_fast_claims['uid'] );
	if ( ! $ams_fast_user_row ) {
		ams_fast_fail( 401, 'unknown_user' );
	}
	if ( ! ams_fast_verify( $ams_fast_user_row, $ams_fast_claims ) ) {
		// Also what a salt-filtering plugin looks like from here: see
		// ams_fast_salt_auth(). If EVERY user gets this, suspect the salt.
		ams_fast_fail( 401, 'bad_signature' );
	}

	$ams_fast_auth = ams_fast_load_caps( (int) $ams_fast_user_row->ID );
	$ams_fast_user = array(
		'id'    => (int) $ams_fast_user_row->ID,
		'login' => (string) $ams_fast_user_row->user_login,
		'name'  => (string) $ams_fast_user_row->display_name,
		'roles' => $ams_fast_auth['roles'],
	);

	switch ( $ams_fast_resource ) {
		case 'posts':
			ams_fast_res_posts( $ams_fast_user, $ams_fast_auth['caps'] );
			break;

		case 'dashboard':
			ams_fast_res_dashboard( $ams_fast_user, $ams_fast_auth['caps'] );
			break;

		case 'categories':
			ams_fast_res_categories( $ams_fast_user );
			break;

		case 'tags':
			ams_fast_res_tags( $ams_fast_user );
			break;

		case 'authors':
			ams_fast_res_authors( $ams_fast_user );
			break;

		case 'users':
			ams_fast_res_users( $ams_fast_user, $ams_fast_auth['caps'] );
			break;

		case 'media':
			ams_fast_res_media( $ams_fast_user, $ams_fast_auth['caps'] );
			break;

		case 'programs':
			ams_fast_res_programs( $ams_fast_user, $ams_fast_auth['caps'], $ams_fast_auth['roles'] );
			break;

		case 'roles':
			ams_fast_res_roles( $ams_fast_user, $ams_fast_auth['caps'] );
			break;

		case 'settings':
			ams_fast_res_settings( $ams_fast_user, $ams_fast_auth['caps'] );
			break;

		case 'profile':
			ams_fast_res_profile( $ams_fast_user, $ams_fast_auth['roles'] );
			break;

		case 'featured':
			ams_fast_res_featured( $ams_fast_user );
			break;

		case 'program':
			ams_fast_res_program( $ams_fast_user, $ams_fast_auth['caps'], $ams_fast_auth['roles'] );
			break;

		case 'episode':
			ams_fast_res_episode( $ams_fast_user, $ams_fast_auth['caps'], $ams_fast_auth['roles'] );
			break;

		case 'episodes':
			ams_fast_res_episodes( $ams_fast_user );
			break;

		case 'whoami':
			// The cheapest possible end-to-end proof that auth works.
			ams_fast_out(
				200,
				array(
					'ok'       => true,
					'resource' => 'whoami',
					'user'     => $ams_fast_user,
					'caps'     => array_keys( $ams_fast_auth['caps'] ),
					'ms'       => array( 'boot' => $AMS_FAST_BOOT_MS ),
				)
			);
			break;

		default:
			ams_fast_fail( 404, 'unknown_resource', $ams_fast_resource );
	}
} catch ( Throwable $e ) {
	// Never leak a stack trace or a path to an unauthenticated caller — but WITH
	// the diag key, say where it threw. Added in 1.4.1: a live-only exception in
	// pub-categories was invisible here and cost a blind deploy round trip.
	$ams_fast_debug = $ams_fast_is_diag || hash_equals( AMS_FAST_DIAG_TOKEN, ams_fast_param( 'k' ) );
	ams_fast_fail(
		500,
		'exception',
		$ams_fast_debug ? get_class( $e ) . ': ' . $e->getMessage() . ' @ ' . basename( (string) $e->getFile() ) . ':' . $e->getLine() : ''
	);
}
