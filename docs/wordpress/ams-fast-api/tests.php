<?php
/**
 * Local unit tests for the pure half of fast.php. No server, no WordPress, no
 * database — run it on any machine with PHP:
 *
 *   php docs/wordpress/ams-fast-api/tests.php
 *
 * WHY THIS EXISTS: deploying to the live site is a manual, hand-carried step,
 * and the riskiest code in fast.php (the token verification) fails in exactly
 * one visible way — "bad_signature" — whether the bug is in the base64url
 * decode, the key derivation, the salt assembly or the HMAC. Getting those
 * wrong costs a deploy round trip each time. They are pure functions, so they
 * can be pinned down here first.
 *
 * THE CENTRAL TEST is `token round trip`: it extracts the REAL signing
 * functions out of ../ams-frontend-api.php (the production plugin source, by
 * name, not a copy that could drift), mints a token exactly as the live
 * web/login endpoint does, and asserts fast.php verifies it.
 *
 * WHAT THIS CANNOT PROVE — do not read a green run as more than it is:
 *   - that wp_salt('auth') on the live server really equals AUTH_KEY.AUTH_SALT.
 *     Both sides here use the same stub. A plugin filtering `salt`, or an
 *     unusual wp-config, would break the real thing and pass here. Only a real
 *     token from the live /web/login proves that — which is what ?r=whoami is
 *     for, and it is the first thing to run after deploying.
 *   - anything involving SQL, visibility scoping against real rows, or the
 *     offloader's real meta keys. Those need the server.
 */

error_reporting( E_ALL );
ini_set( 'display_errors', '1' );

/* ---------------------------------------------------------------------------
 * A tiny assertion harness. No dependencies on purpose — this must run
 * anywhere, including on the server if it ever comes to that.
 * ------------------------------------------------------------------------ */

$GLOBALS['ams_t'] = array( 'pass' => 0, 'fail' => 0, 'failures' => array() );

function t_ok( $condition, $label ) {
	if ( $condition ) {
		$GLOBALS['ams_t']['pass']++;
		echo "  ok    $label\n";
	} else {
		$GLOBALS['ams_t']['fail']++;
		$GLOBALS['ams_t']['failures'][] = $label;
		echo "  FAIL  $label\n";
	}
}

function t_same( $expected, $actual, $label ) {
	$same = ( $expected === $actual );
	if ( ! $same ) {
		$label .= "\n          expected: " . var_export( $expected, true )
				. "\n          actual:   " . var_export( $actual, true );
	}
	t_ok( $same, $label );
}

function t_group( $name ) {
	echo "\n$name\n";
}

/* ---------------------------------------------------------------------------
 * Fixture salts. Defined BEFORE fast.php is loaded, because ams_fast_salt_auth()
 * memoises. They stand in for wp-config's real ones.
 * ------------------------------------------------------------------------ */

define( 'AUTH_KEY', 'k3y-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' );
define( 'AUTH_SALT', 's4lt-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' );

/** Stub, defined BEFORE fast.php so its function_exists() guards see it —
 *  only the options ams_fast_permalink() reads. */
function get_option( $name, $default = false ) {
	$fixture = array( 'home' => 'https://infotainment.ams.com.kh/' );
	return isset( $fixture[ $name ] ) ? $fixture[ $name ] : $default;
}

define( 'AMS_FAST_LIB_ONLY', true );
require __DIR__ . '/fast.php';

/* ---------------------------------------------------------------------------
 * The production signer, lifted out of the real plugin source by name.
 *
 * Reading the functions out of ../ams-frontend-api.php rather than
 * reimplementing them is the whole point: a copy would drift silently, and a
 * reimplementation would just re-encode whatever I believed the scheme to be.
 * If the plugin's auth changes shape, the extraction below fails loudly instead
 * of quietly testing nothing.
 * ------------------------------------------------------------------------ */

function wp_salt( $scheme = 'auth' ) {
	// Stub. See the "WHAT THIS CANNOT PROVE" note at the top of this file: this
	// asserts the concatenation both sides agree on, not that the live server
	// agrees with it.
	return AUTH_KEY . AUTH_SALT;
}

function wp_json_encode( $data ) {
	return json_encode( $data );
}

function ams_extract_functions( $source_file, array $names ) {
	$src = file_get_contents( $source_file );
	if ( false === $src ) {
		fwrite( STDERR, "could not read $source_file\n" );
		exit( 1 );
	}
	$code = '';
	foreach ( $names as $name ) {
		// Function body up to the closing brace at column 0 — the file is
		// WP-formatted, so top-level functions always end that way.
		if ( ! preg_match( '/^function\s+' . preg_quote( $name, '/' ) . '\s*\(.*?^\}/ms', $src, $m ) ) {
			fwrite( STDERR, "FATAL: could not extract $name() from $source_file — has the plugin's auth changed shape?\n" );
			exit( 1 );
		}
		$code .= $m[0] . "\n";
	}
	eval( $code );
}

ams_extract_functions(
	dirname( __DIR__ ) . '/ams-frontend-api.php',
	array( 'ams_afa_b64url_encode', 'ams_afa_login_key', 'ams_afa_login_sign' )
);

/* ---------------------------------------------------------------------------
 * 1. TOKEN ROUND TRIP — production signer in, fast.php verify out
 * ------------------------------------------------------------------------ */

t_group( '1. token round trip (real signer from ams-frontend-api.php)' );

$user           = new stdClass();
$user->ID       = 42;
$user->user_pass = '$P$ByX8kQ2mZq1vN7dLp0aWcE4rT6uYs9.';

$exp   = time() + 3600;
$token = ams_afa_login_sign( $user, $exp );

$claims = ams_fast_token_claims( $token );
t_ok( null !== $claims, 'claims parse out of a real token' );
t_same( 42, $claims['uid'], 'uid survives the round trip' );
t_same( $exp, $claims['exp'], 'exp survives the round trip' );
t_ok( ams_fast_verify( $user, $claims ), 'signature VERIFIES — the key derivation matches the plugin' );

// The derived keys must be byte-identical, not merely both-accepting.
t_same(
	ams_afa_login_key( $user ),
	ams_fast_login_key( $user->ID, $user->user_pass ),
	'derived signing keys are byte-identical'
);

t_group( '2. token rejection' );

$tampered         = clone $user;
$tampered->user_pass = '$P$BDIFFERENT2mZq1vN7dLp0aWcE4rT6uY';
t_ok( ! ams_fast_verify( $tampered, $claims ), 'a changed password invalidates the token (log-out-everywhere holds)' );

$other       = clone $user;
$other->ID   = 43;
t_ok( ! ams_fast_verify( $other, $claims ), 'a token for user 42 does not verify as user 43' );

// Re-sign the claims body with a different uid but keep the old signature.
$forged         = ams_fast_token_claims( $token );
$forged['body'] = ams_afa_b64url_encode( json_encode( array( 'uid' => 1, 'exp' => $exp, 'v' => 1 ) ) );
t_ok( ! ams_fast_verify( $user, $forged ), 'swapping the body for uid 1 fails the signature' );

$flipped        = ams_fast_token_claims( $token );
$flipped['sig'] = strrev( $flipped['sig'] );
t_ok( ! ams_fast_verify( $user, $flipped ), 'a mangled signature fails' );

t_same( null, ams_fast_token_claims( 'not-a-token' ), 'garbage token -> null' );
t_same( null, ams_fast_token_claims( 'a.b.c' ), 'three segments -> null' );
t_same( null, ams_fast_token_claims( '' ), 'empty token -> null' );
t_same( null, ams_fast_token_claims( ams_afa_b64url_encode( '{"nope":1}' ) . '.xx' ), 'claims without uid/exp -> null' );

/* ---------------------------------------------------------------------------
 * 3. SALT ASSEMBLY — the branches of core's wp_salt('auth')
 * ------------------------------------------------------------------------ */

t_group( '3. salt assembly' );

t_same(
	array( 'K', 'S' ),
	ams_fast_salt_parts( array( 'AUTH_KEY' => 'K', 'AUTH_SALT' => 'S' ) ),
	'normal wp-config: AUTH_KEY . AUTH_SALT'
);

t_same(
	array( '', '' ),
	ams_fast_salt_parts( array( 'AUTH_KEY' => 'SAME', 'AUTH_SALT' => 'SAME' ) ),
	'duplicated constant values are ignored, as core does (falls back to site options)'
);

t_same(
	array( 'LEGACY', 'S' ),
	ams_fast_salt_parts( array( 'SECRET_KEY' => 'LEGACY', 'AUTH_SALT' => 'S' ) ),
	'legacy SECRET_KEY fills in when AUTH_KEY is absent'
);

t_same(
	array( 'K', 'S' ),
	ams_fast_salt_parts( array( 'SECRET_KEY' => 'LEGACY', 'AUTH_KEY' => 'K', 'AUTH_SALT' => 'S' ) ),
	'AUTH_KEY wins over the legacy SECRET_KEY'
);

t_same(
	array( '', '' ),
	ams_fast_salt_parts( array( 'AUTH_KEY' => 'put your unique phrase here', 'AUTH_SALT' => '' ) ),
	'the wp-config placeholder phrase is treated as unset'
);

t_same( AUTH_KEY . AUTH_SALT, ams_fast_salt_auth(), 'the wrapper resolves the fixture constants' );

/* ---------------------------------------------------------------------------
 * 4. CAPABILITY FLATTENING
 * ------------------------------------------------------------------------ */

t_group( '4. capability flattening' );

$roles = array(
	'administrator' => array( 'capabilities' => array( 'edit_posts' => true, 'edit_others_posts' => true, 'read_private_posts' => true, 'list_users' => true ) ),
	'author'        => array( 'capabilities' => array( 'edit_posts' => true, 'publish_posts' => true, 'edit_published_posts' => true, 'delete_posts' => true ) ),
	'subscriber'    => array( 'capabilities' => array( 'read' => true ) ),
);

$author = ams_fast_flatten_caps( array( 'author' => true ), $roles );
t_same( array( 'author' ), $author['roles'], 'author role is detected' );
t_ok( ams_fast_can( $author['caps'], 'edit_posts' ), 'author has edit_posts' );
t_ok( ! ams_fast_can( $author['caps'], 'edit_others_posts' ), 'AUTHOR DOES NOT HAVE edit_others_posts — the whole leak test rests on this' );
t_ok( ! ams_fast_can( $author['caps'], 'read_private_posts' ), 'author cannot read private posts' );

$admin = ams_fast_flatten_caps( array( 'administrator' => true ), $roles );
t_ok( ams_fast_can( $admin['caps'], 'edit_others_posts' ), 'administrator has edit_others_posts' );

$granted = ams_fast_flatten_caps( array( 'author' => true, 'edit_others_posts' => true ), $roles );
t_ok( ams_fast_can( $granted['caps'], 'edit_others_posts' ), 'a per-user grant on top of a role is honoured' );

$revoked = ams_fast_flatten_caps( array( 'author' => true, 'edit_posts' => false ), $roles );
t_ok( ! ams_fast_can( $revoked['caps'], 'edit_posts' ), 'a per-user FALSE revokes a cap the role granted' );

$multi = ams_fast_flatten_caps( array( 'author' => true, 'subscriber' => true ), $roles );
t_same( array( 'author', 'subscriber' ), $multi['roles'], 'multiple roles are merged' );

$unknown = ams_fast_flatten_caps( array( 'ghost_role' => true ), $roles );
t_same( array(), $unknown['roles'], 'an unknown role name grants nothing as a role' );
t_ok( ams_fast_can( $unknown['caps'], 'ghost_role' ), '...but is treated as a per-user cap, exactly as WP_User does' );

$none = ams_fast_flatten_caps( array(), $roles );
t_same( array(), $none['caps'], 'no assignment -> no capabilities' );

/* ---------------------------------------------------------------------------
 * 5. STATUS GATE
 * ------------------------------------------------------------------------ */

t_group( '5. status gate (mirror of handle_status_param)' );

$author_caps     = $author['caps'];
$admin_caps      = $admin['caps'];
$subscriber_caps = ams_fast_flatten_caps( array( 'subscriber' => true ), $roles )['caps'];

t_same( '', ams_fast_status_denied( 'publish', $subscriber_caps ), 'anyone may ask for published posts' );
t_same( '', ams_fast_status_denied( 'draft', $author_caps ), 'an author may ask for drafts' );
t_same( '', ams_fast_status_denied( 'pending', $author_caps ), 'an author may ask for pending' );
t_same( 'cannot_read_status', ams_fast_status_denied( 'draft', $subscriber_caps ), 'a subscriber may NOT ask for drafts' );
t_same( 'cannot_read_status', ams_fast_status_denied( 'private', $author_caps ), 'an author may NOT ask for private posts' );
t_same( '', ams_fast_status_denied( 'private', $admin_caps ), 'an administrator may ask for private posts' );

t_ok( ! in_array( 'trash', ams_fast_known_statuses(), true ), 'trash is not a servable status' );
t_ok( ! in_array( 'inherit', ams_fast_known_statuses(), true ), 'inherit (attachments) is not a servable status' );

/* ---------------------------------------------------------------------------
 * 6. ATTACHMENT URLS — the KH Offloader branch
 *
 * Shapes taken from the live site: uploads live at
 * https://s3.ams.com.kh/infotainment/2026/08/<file> when offloaded, and 642 of
 * 115,405 attachments are NOT offloaded and must stay local.
 * ------------------------------------------------------------------------ */

t_group( '6. attachment URL resolution' );

$LOCAL = 'https://infotainment.ams.com.kh/wp-content/uploads';
$CDN   = 'https://s3.ams.com.kh/infotainment';

$meta_full = serialize( array(
	'file'  => '2026/08/fake-perfume.webp',
	'sizes' => array(
		'thumbnail' => array( 'file' => 'fake-perfume-150x150.webp', 'width' => 150, 'height' => 150 ),
		'medium'    => array( 'file' => 'fake-perfume-300x182.webp' ),
	),
) );

// Exactly the row shape read off live attachment #221990.
$offloaded = array(
	'_wp_attached_file'         => '2026/08/fake-perfume.webp',
	'_wp_attachment_metadata'   => $meta_full,
	'_khs3data_webp_size_files' => serialize( array( 'fake-perfume-150x150.webp' ) ),
	'khs3data_bucket'           => 'infotainment',
	'khs3data_offloaded'        => '1',
	'khs3data_offloaded_at'     => '1785815550',
	'khs3data_path'             => '2026/08/',
	'khs3data_provider'         => 'CephAMS',
);
t_same(
	$CDN . '/2026/08/fake-perfume-150x150.webp',
	ams_fast_attachment_url( $offloaded, $LOCAL, $how ),
	'offloaded attachment -> CDN thumbnail (verified byte-for-byte against live REST)'
);
t_same( 'khs3data', $how, '...resolved by the KH Offloader marker, not by a lookalike key' );

$never_offloaded = array(
	'_wp_attached_file'       => '2026/08/local-only.webp',
	'_wp_attachment_metadata' => serialize( array( 'file' => '2026/08/local-only.webp', 'sizes' => array( 'thumbnail' => array( 'file' => 'local-only-150x150.webp' ) ) ) ),
);
t_same(
	$LOCAL . '/2026/08/local-only-150x150.webp',
	ams_fast_attachment_url( $never_offloaded, $LOCAL, $how ),
	'THE 642: an attachment with no offload marker stays on the local URL'
);
t_same( 'local', $how, '...resolved by the local branch' );

// REGRESSION. The first version of ams_fast_attachment_base() matched any
// khs3-ish meta key, so a webp-converted file that was never uploaded to S3
// resolved to a CDN URL that 404s. It passed on real data purely because every
// sampled attachment happened to be offloaded too.
$webp_but_local = array(
	'_wp_attached_file'         => '2026/08/converted.webp',
	'_wp_attachment_metadata'   => serialize( array( 'sizes' => array( 'thumbnail' => array( 'file' => 'converted-150x150.webp' ) ) ) ),
	'_khs3data_webp_size_files' => serialize( array( 'converted-150x150.webp' ) ),
);
t_same(
	$LOCAL . '/2026/08/converted-150x150.webp',
	ams_fast_attachment_url( $webp_but_local, $LOCAL, $how ),
	'webp variants WITHOUT khs3data_offloaded is not offloaded — webp conversion is a different question'
);
t_same( 'local', $how, '...and it resolves local, not CDN' );

$path_meta = array(
	'_wp_attached_file'       => '2026/08/moved.webp',
	'_wp_attachment_metadata' => serialize( array( 'sizes' => array( 'thumbnail' => array( 'file' => 'moved-150x150.webp' ) ) ) ),
	'khs3data_offloaded'      => '1',
	'khs3data_path'           => '2019/03/',
);
t_same(
	$CDN . '/2019/03/moved-150x150.webp',
	ams_fast_attachment_url( $path_meta, $LOCAL, $how ),
	'khs3data_path wins over the local folder when the two disagree'
);

$legacy_wpom = array(
	'_wp_attached_file'       => '2019/03/legacy.jpg',
	'_wp_attachment_metadata' => serialize( array( 'sizes' => array( 'thumbnail' => array( 'file' => 'legacy-150x150.jpg' ) ) ) ),
	'amazonS3_info'           => serialize( array( 'bucket' => 'infotainment', 'key' => '2019/03/legacy.jpg', 'provider' => 'CephAMS' ) ),
);
t_same(
	$CDN . '/2019/03/legacy-150x150.jpg',
	ams_fast_attachment_url( $legacy_wpom, $LOCAL, $how ),
	'a WP Offload Media row that predates the migration still resolves to the CDN'
);
t_same( 'amazonS3_info', $how, '...resolved by the legacy branch' );

$stored_url = array(
	'_wp_attached_file'       => '2026/08/stored.webp',
	'_wp_attachment_metadata' => serialize( array( 'sizes' => array( 'thumbnail' => array( 'file' => 'stored-150x150.webp' ) ) ) ),
	'some_plugin_url'         => 'https://s3.ams.com.kh/infotainment/2026/08/stored.webp',
);
t_same(
	$CDN . '/2026/08/stored-150x150.webp',
	ams_fast_attachment_url( $stored_url, $LOCAL, $how ),
	'a stored absolute CDN url is recognised as a last resort'
);
t_same( 'url:some_plugin_url', $how, '...resolved by the stored-url branch' );

$marker_false = array(
	'_wp_attached_file'       => '2026/08/pending.webp',
	'_wp_attachment_metadata' => serialize( array( 'sizes' => array( 'thumbnail' => array( 'file' => 'pending-150x150.webp' ) ) ) ),
	'khs3data_offloaded'      => '0',
);
t_same(
	$LOCAL . '/2026/08/pending-150x150.webp',
	ams_fast_attachment_url( $marker_false, $LOCAL, $how ),
	'a FALSY offload marker means not offloaded — it must not be read as merely present'
);

$no_sizes = array(
	'_wp_attached_file'       => '2026/08/no-thumb.pdf',
	'_wp_attachment_metadata' => serialize( array() ),
	'khs3data_offloaded'      => '1',
);
t_same(
	$CDN . '/2026/08/no-thumb.pdf',
	ams_fast_attachment_url( $no_sizes, $LOCAL, $how ),
	'no thumbnail size -> the full-size file, as REST falls back to source_url'
);

$flat = array( '_wp_attached_file' => 'rootfile.webp', '_wp_attachment_metadata' => serialize( array() ) );
t_same( $LOCAL . '/rootfile.webp', ams_fast_attachment_url( $flat, $LOCAL, $how ), 'a file with no year/month folder resolves without a stray slash' );

t_same( '', ams_fast_attachment_url( array(), $LOCAL, $how ), 'no _wp_attached_file -> empty string, never a broken URL' );

$hostile = array(
	'_wp_attached_file'       => '2026/08/x.webp',
	'_wp_attachment_metadata' => 'O:8:"stdClass":0:{}',
	'khs3data_offloaded'      => '1',
);
t_same( $CDN . '/2026/08/x.webp', ams_fast_attachment_url( $hostile, $LOCAL, $how ), 'an object payload in metadata is refused by unserialize, not instantiated' );

/* ---------------------------------------------------------------------------
 * 6b. SIZE CHAINS — the media grid and program posters pick non-thumbnail sizes
 * ------------------------------------------------------------------------ */

t_group( '6b. attachment URL size chains' );

$sized = array(
	'_wp_attached_file'       => '2026/08/sized.webp',
	'_wp_attachment_metadata' => serialize( array(
		'width'  => 1920,
		'height' => 1080,
		'sizes'  => array(
			'thumbnail' => array( 'file' => 'sized-150x150.webp' ),
			'medium'    => array( 'file' => 'sized-300x169.webp' ),
		),
	) ),
	'khs3data_offloaded'      => '1',
	'khs3data_path'           => '2026/08/',
);
t_same( $CDN . '/2026/08/sized-300x169.webp', ams_fast_attachment_url( $sized, $LOCAL, $how, array( 'medium' ) ), 'a medium-first chain picks the medium file' );
// Program posters (1.8.1): large-first for sharpness, medium when no large exists.
t_same( $CDN . '/2026/08/sized-300x169.webp', ams_fast_attachment_url( $sized, $LOCAL, $how, array( 'large', 'medium' ) ), 'a large,medium chain falls to medium when no large rendition exists (program posters)' );
$sized_large = $sized;
$sized_large['_wp_attachment_metadata'] = serialize( array(
	'width'  => 1920,
	'height' => 1080,
	'sizes'  => array(
		'thumbnail' => array( 'file' => 'sized-150x150.webp' ),
		'medium'    => array( 'file' => 'sized-300x169.webp' ),
		'large'     => array( 'file' => 'sized-1024x576.webp' ),
	),
) );
t_same( $CDN . '/2026/08/sized-1024x576.webp', ams_fast_attachment_url( $sized_large, $LOCAL, $how, array( 'large', 'medium' ) ), 'a large,medium chain picks large when it exists (program posters)' );
t_same( $CDN . '/2026/08/sized.webp', ams_fast_attachment_url( $sized, $LOCAL, $how, array() ), 'an empty chain always yields the full-size file (media url)' );
t_same( $CDN . '/2026/08/sized-150x150.webp', ams_fast_attachment_url( $sized, $LOCAL, $how, array( 'thumbnail', 'medium' ) ), 'thumbnail wins when present in a thumbnail,medium chain (media thumb)' );

$no_thumb_sizes = array(
	'_wp_attached_file'       => '2026/08/wide.webp',
	'_wp_attachment_metadata' => serialize( array( 'sizes' => array( 'medium' => array( 'file' => 'wide-300x100.webp' ) ) ) ),
);
t_same( $LOCAL . '/2026/08/wide-300x100.webp', ams_fast_attachment_url( $no_thumb_sizes, $LOCAL, $how, array( 'thumbnail', 'medium' ) ), 'a missing thumbnail falls through to medium, as the REST mapper does' );

t_same( 'image', ams_fast_media_type( 'image/webp' ), 'image mime -> media_type image' );
t_same( 'file', ams_fast_media_type( 'video/mp4' ), 'video mime -> media_type file — REST only ever says image or file' );
t_same( 'file', ams_fast_media_type( '' ), 'empty mime -> file' );

/* ---------------------------------------------------------------------------
 * 6c. PROGRAM CAPS — the port of ams_afa_program_caps_filter (user_has_cap
 * does not run under SHORTINIT, so this derivation IS the movie/tv_show/
 * episode capability story on the fast path)
 * ------------------------------------------------------------------------ */

t_group( '6c. program capability derivation' );

$movie_author_caps = array( 'edit_posts' => true, 'edit_movies' => true, 'edit_tv_shows' => true, 'edit_episodes' => true );
$plain_author_caps = array( 'edit_posts' => true, 'publish_posts' => true );

t_ok( ams_fast_can_program( $movie_author_caps, array( 'author' ), 'edit_movies' ), 'stored edit_movies passes as itself' );
t_ok( ams_fast_can_program( $movie_author_caps, array( 'author' ), 'edit_others_movies' ), 'edit_others_movies DERIVES from stored edit_movies — the Session 9 §7 trap' );
t_ok( ams_fast_can_program( $movie_author_caps, array( 'author' ), 'edit_published_movies' ), 'edit_published_movies derives from edit_movies' );
t_ok( ams_fast_can_program( $movie_author_caps, array( 'author' ), 'read_private_tv_shows' ), 'read_private_* derives from EDIT of the same type' );
t_ok( ! ams_fast_can_program( $movie_author_caps, array( 'author' ), 'delete_others_movies' ), 'delete variants do NOT derive without stored delete_movies' );
t_ok( ams_fast_can_program( array( 'delete_movies' => true ), array( 'author' ), 'delete_published_movies' ), 'stored delete_movies unlocks its delete variants' );
t_ok( ! ams_fast_can_program( $plain_author_caps, array( 'author' ), 'edit_others_movies' ), 'a role with NO program caps gains nothing' );
t_ok( ! ams_fast_can_program( $plain_author_caps, array( 'author' ), 'edit_movies' ), '...not even the base cap' );
t_ok( ams_fast_can_program( array(), array( 'administrator' ), 'delete_others_tv_shows' ), 'administrators pass ANY program cap, stored or not' );
t_ok( ! ams_fast_can_program( array(), array( 'administrator' ), 'edit_others_posts' ), 'administrator shortcut applies ONLY to program caps — posts still need stored caps' );
// The filter's regex maps a SINGULAR variant to a singular base (edit_movie),
// which no role stores — so it does not pass. Asserting the quirk verbatim:
// if the port ever "fixed" this it would diverge from production behavior.
t_ok( ! ams_fast_can_program( array( 'edit_movies' => true ), array( 'author' ), 'edit_others_movie' ), 'singular edit_others_movie maps to base edit_movie, not edit_movies — filter quirk preserved' );
t_ok( ams_fast_can_program( array( 'edit_movie' => true ), array( 'author' ), 'edit_others_movie' ), '...and derives only from a stored singular base, exactly as the filter would' );
t_ok( ! ams_fast_can_program( array( 'edit_movies' => true ), array( 'author' ), 'publish_movies' ), 'publish_movies is not a derivable variant — only others/published/private and read_private' );

/* ---------------------------------------------------------------------------
 * 6d. USER/ROLE HELPERS — the users list and role viewer
 * ------------------------------------------------------------------------ */

t_group( '6d. assigned roles + role counting' );

$all_roles_fixture = array(
	'administrator' => array( 'name' => 'Administrator', 'capabilities' => array( 'read' => true ) ),
	'author'        => array( 'name' => 'Author', 'capabilities' => array( 'read' => true ) ),
	'seo_manager'   => array( 'name' => 'SEO Manager', 'capabilities' => array( 'read' => true ) ),
);

t_same( array( 'author' ), ams_fast_assigned_roles( array( 'author' => true ), $all_roles_fixture ), 'a single role assignment' );
t_same( array( 'author', 'seo_manager' ), ams_fast_assigned_roles( array( 'author' => true, 'seo_manager' => true ), $all_roles_fixture ), 'two roles, stored order preserved' );
t_same( array( 'author' ), ams_fast_assigned_roles( array( 'author' => true, 'edit_others_posts' => true ), $all_roles_fixture ), 'a per-user CAP is not a role' );
t_same( array(), ams_fast_assigned_roles( array( 'author' => false ), $all_roles_fixture ), 'a false assignment is not a role' );

$counts = ams_fast_count_roles(
	array(
		serialize( array( 'administrator' => true ) ),
		serialize( array( 'author' => true ) ),
		serialize( array( 'author' => true, 'seo_manager' => true ) ),
		serialize( array( 'author' => true, 'edit_others_posts' => true ) ),
		'garbage-not-serialized',
	),
	$all_roles_fixture
);
t_same( 1, $counts['administrator'], 'one administrator counted' );
t_same( 3, $counts['author'], 'authors counted across single- and multi-role users' );
t_same( 1, $counts['seo_manager'], 'a user with two roles counts in BOTH (count_users semantics)' );

/* ---------------------------------------------------------------------------
 * 6e. PERMALINKS — the ?p=<id> form (get_permalink() needs the rewrite layer,
 * which SHORTINIT does not load). A deliberate divergence from REST's string:
 * WordPress canonicalises ?p=<id> to the real permalink with a 301, so the
 * View links this feeds land on the same page.
 * ------------------------------------------------------------------------ */

t_group( '6e. permalinks' );

t_same( 'https://infotainment.ams.com.kh/?p=221956', ams_fast_permalink( 221956 ), 'permalink uses the resolvable ?p= form' );
t_same( 'https://infotainment.ams.com.kh/?p=1', ams_fast_permalink( '1' ), 'a numeric string id is coerced' );
t_ok( false === strpos( ams_fast_permalink( 5 ), '//?p=' ), 'the home option trailing slash does not double up' );

/* ---------------------------------------------------------------------------
 * 6f. PUBLIC CARD DESCRIPTIONS (A8)
 *
 * Both branches were measured against ams3e-api's live output, not guessed:
 * descriptions are the source text cut to 147 CHARACTERS with '...' appended
 * (exactly 150), and for the ~1.8% of posts with an empty post_excerpt the
 * plugin generates one from the body — reproduced exactly on all 7 such posts
 * in a 400-post sample by stripping comments/shortcodes/tags.
 * ------------------------------------------------------------------------ */

t_group( '6f. public card descriptions' );

t_ok( ams_fast_is_public_resource( 'pub-articles' ), 'pub- prefixed resources are public' );
t_ok( ! ams_fast_is_public_resource( 'posts' ), 'the admin posts resource is NOT public' );
t_ok( ! ams_fast_is_public_resource( 'users' ), 'the users resource is NOT public — it carries emails' );
t_ok( ! ams_fast_is_public_resource( 'diag' ), 'diag is not public-by-prefix (it has its own gate)' );
t_ok( ! ams_fast_is_public_resource( 'notpub-articles' ), 'the prefix must be at the START' );

$short = 'A short excerpt.';
t_same( $short, ams_fast_truncate( $short ), 'text under the limit is untouched — no ellipsis' );

// THE TWO NUMBERS. Anything up to 150 is returned whole (so a 150-char
// description legitimately ends mid-word with NO ellipsis — live post 221602);
// past that it is cut to 147 and gets '...', landing on 150 either way.
// A first pass used 147 for both and truncated descriptions the live endpoint
// returns intact.
$exactly147 = str_repeat( 'a', 147 );
t_same( $exactly147, ams_fast_truncate( $exactly147 ), '147 characters is not truncated' );
$exactly150 = str_repeat( 'a', 150 );
t_same( $exactly150, ams_fast_truncate( $exactly150 ), 'EXACTLY 150 characters is returned whole, with no ellipsis' );
t_ok( false === strpos( ams_fast_truncate( $exactly150 ), '...' ), '...and really has no ellipsis appended' );
t_same( str_repeat( 'a', 147 ) . '...', ams_fast_truncate( str_repeat( 'a', 151 ) ), '151 characters -> 147 + ellipsis (150 total)' );
t_same( 150, strlen( ams_fast_truncate( str_repeat( 'a', 400 ) ) ), 'a long ASCII excerpt yields exactly 150 chars' );

// Khmer is multibyte: truncating by BYTES would cut mid-codepoint and emit
// mojibake. The live descriptions are 150 CHARACTERS, not 150 bytes.
$khmer = str_repeat( 'ក', 300 );
$cut   = ams_fast_truncate( $khmer );
t_same( 150, mb_strlen( $cut, 'UTF-8' ), 'Khmer truncates to 150 CHARACTERS, not bytes' );
t_ok( strlen( $cut ) > 150, '...which is more than 150 bytes, confirming it is not a byte cut' );
t_ok( '' === preg_replace( '/[ក.]/u', '', $cut ), 'no broken codepoints survive the cut' );

t_same( 'Manual excerpt.', ams_fast_card_description( 'Manual excerpt.', '<p>Body text</p>' ), 'a non-empty post_excerpt wins over the body' );
t_same( 'Manual excerpt.', ams_fast_card_description( '  Manual excerpt.  ', '<p>Body</p>' ), '...and is trimmed' );

// THE 1.8%: empty excerpt -> generate from the body. Block delimiters are HTML
// comments, which is why stripping comments handles Gutenberg here.
$block_body = "<!-- wp:paragraph -->\n<p class=\"wp-block-paragraph\">Hello   world</p>\n<!-- /wp:paragraph -->";
t_same( 'Hello world', ams_fast_card_description( '', $block_body ), 'empty excerpt -> body stripped of block delimiters and tags' );
t_same( 'Hello world', ams_fast_card_description( '   ', $block_body ), 'a whitespace-only excerpt counts as empty' );
t_same( 'Caption here', ams_fast_card_description( '', '[gallery ids="1,2"] <p>Caption here</p>' ), 'shortcodes are stripped, not printed' );
t_same( 'Tom & Jerry', ams_fast_card_description( '', '<p>Tom &amp; Jerry</p>' ), 'HTML entities are decoded' );
t_same( '', ams_fast_card_description( '', '' ), 'no excerpt and no body -> empty string, never a stray ellipsis' );
t_same( '', ams_fast_card_description( '', '<!-- wp:spacer --><div class="wp-block-spacer"></div><!-- /wp:spacer -->' ), 'a body of pure markup yields nothing rather than whitespace' );

// U+200B is everywhere in Khmer text and is NOT matched by \s — the live
// output keeps it, so the whitespace collapse must not eat it.
$zwsp_body = "<p>ក" . "\xE2\x80\x8B" . "ខ</p>";
t_same( "ក\xE2\x80\x8Bខ", ams_fast_card_description( '', $zwsp_body ), 'zero-width spaces survive the whitespace collapse' );

/* ---------------------------------------------------------------------------
 * 6g. CATEGORY DESCENDANTS (A8)
 *
 * get-article-by-category-slug aggregates a term's DESCENDANTS; get-articles
 * (by id) matches direct assignments only. Measured on the live site:
 * entertainment-news is 7,660 posts by id and 7,737 by slug. Matching only the
 * term itself would silently under-fill every parent category page.
 * ------------------------------------------------------------------------ */

t_group( '6g. category descendants' );

// root 1 -> {10, 11}; 10 -> {20}; 2 is a separate tree.
$tree = array( 1 => 0, 10 => 1, 11 => 1, 20 => 10, 2 => 0, 21 => 2 );

$d = ams_fast_descendant_ids( $tree, 1 );
sort( $d );
t_same( array( 1, 10, 11, 20 ), $d, 'a parent yields itself plus children AND grandchildren' );

t_same( array( 20 ), ams_fast_descendant_ids( $tree, 20 ), 'a leaf yields only itself' );

$d2 = ams_fast_descendant_ids( $tree, 2 );
sort( $d2 );
t_same( array( 2, 21 ), $d2, 'a sibling tree is not pulled in' );

t_same( array(), ams_fast_descendant_ids( $tree, 999 ), 'an unknown term yields nothing (caller renders an empty page)' );
t_same( array(), ams_fast_descendant_ids( $tree, 0 ), 'term id 0 yields nothing rather than the whole taxonomy' );
t_same( array(), ams_fast_descendant_ids( array(), 1 ), 'an empty taxonomy yields nothing' );

// A corrupt taxonomy must not hang the endpoint.
$cycle = array( 5 => 6, 6 => 5 );
$c     = ams_fast_descendant_ids( $cycle, 5 );
sort( $c );
t_same( array( 5, 6 ), $c, 'a parent CYCLE terminates instead of looping forever' );

/* ---------------------------------------------------------------------------
 * 6h. TERM LINKS — the pub-categories link builder
 *
 * The fixture reproduces the three cases live production actually has
 * (measured 2026-08-05, 26 terms): a custom permalink from the
 * custom_permalink_table option (23 of 26 — the table's value, verbatim,
 * appended to home), a term with NO custom row that falls back to core's
 * parent-chain form (3 of 26), and the pathological shapes the option could
 * take (first-match-wins duplicates, junk rows, a parent cycle).
 * ------------------------------------------------------------------------ */

t_group( '6h. term links (pub-categories)' );

$lk_terms = array(
	// Mirrors live: 959 celebrity-news under 957 entertainment-news under 6913 all-news.
	6913 => array( 'slug' => 'all-news', 'parent' => 0 ),
	957  => array( 'slug' => 'entertainment-news', 'parent' => 6913 ),
	959  => array( 'slug' => 'entertainment-celebrity-news', 'parent' => 957 ),
	971  => array( 'slug' => 'reports', 'parent' => 0 ),
);
$lk_table = array(
	'category/celebrity/news/'          => array( 'id' => 959 ),
	'category/entertainment-news/news/' => array( 'id' => 957 ),
	// A duplicate row for 957 later in the table: the FIRST must win,
	// because that is how Custom Permalinks' own term filter iterates.
	'category/entertainment-dupe/'      => array( 'id' => 957 ),
	// Junk rows the option could carry: no id, not an array.
	'category/orphan/'                  => array( 'kind' => 'category' ),
	'category/broken/'                  => 'not-an-array',
);
$lk = ams_fast_term_links( $lk_terms, $lk_table, 'https://infotainment.ams.com.kh/', '' );
t_same( 'https://infotainment.ams.com.kh/category/celebrity/news/', $lk[959], 'custom permalink wins over the parent chain' );
t_same( 'https://infotainment.ams.com.kh/category/entertainment-news/news/', $lk[957], 'FIRST table row wins on a duplicate id' );
t_same( 'https://infotainment.ams.com.kh/category/all-news/', $lk[6913], 'no custom row: root falls back to /category/<slug>/' );
t_same( 'https://infotainment.ams.com.kh/category/reports/', $lk[971], 'second root also derives' );

// The fallback walks the whole parent chain when there is no custom row.
$lk2 = ams_fast_term_links( $lk_terms, array(), 'https://x.test', 'category' );
t_same( 'https://x.test/category/all-news/entertainment-news/entertainment-celebrity-news/', $lk2[959], 'derived form is the full parent chain' );

// A custom category base replaces "category" only in DERIVED links —
// custom table rows carry their own full path.
$lk3 = ams_fast_term_links( $lk_terms, $lk_table, 'https://x.test/', '/topics/' );
t_same( 'https://x.test/topics/all-news/', $lk3[6913], 'category_base option is honoured in the derived form' );
t_same( 'https://x.test/category/celebrity/news/', $lk3[959], 'a custom row is used verbatim regardless of base' );

// A parent cycle terminates (same guard style as the descendant walk).
$lk_cycle = ams_fast_term_links(
	array(
		5 => array( 'slug' => 'a', 'parent' => 6 ),
		6 => array( 'slug' => 'b', 'parent' => 5 ),
	),
	array(),
	'https://x.test',
	''
);
t_ok( isset( $lk_cycle[5] ) && isset( $lk_cycle[6] ), 'a parent CYCLE terminates instead of looping forever' );

/* ---------------------------------------------------------------------------
 * 6i. MEDIA DETAILS — the pub-programs featured-image reducer
 *
 * What posterOf() consults: original width/height (portrait check), the
 * per-size source_url map (the 300x450 rendition), source_url fallback.
 * One offloaded fixture, one local, one with no attachment metadata.
 * ------------------------------------------------------------------------ */

t_group( '6i. media details (pub-programs)' );

$md_attmeta = serialize(
	array(
		'width'  => 1000,
		'height' => 1500,
		'sizes'  => array(
			'thumbnail'      => array( 'file' => 'poster-150x150.jpg', 'width' => 150, 'height' => 150 ),
			'khi-poster'     => array( 'file' => 'poster-300x450.jpg', 'width' => 300, 'height' => 450 ),
			'corrupt-nofile' => array( 'width' => 9, 'height' => 9 ),
		),
	)
);

$md = ams_fast_media_details(
	array(
		'_wp_attached_file'       => '2021/09/poster.jpg',
		'_wp_attachment_metadata' => $md_attmeta,
		'khs3data_offloaded'      => '1',
		'khs3data_path'           => '2021/09/',
	),
	'https://infotainment.ams.com.kh/wp-content/uploads'
);
t_same( 'https://s3.ams.com.kh/infotainment/2021/09/poster.jpg', $md['source_url'], 'offloaded original resolves to the CDN' );
t_same( 1000, $md['width'], 'original width' );
t_same( 1500, $md['height'], 'original height' );
t_same( 'https://s3.ams.com.kh/infotainment/2021/09/poster-300x450.jpg', $md['sizes']['khi-poster']['source_url'], 'the 300x450 rendition posterOf() prefers' );
t_same( 450, $md['sizes']['khi-poster']['height'], 'rendition dims carried' );
t_ok( ! isset( $md['sizes']['corrupt-nofile'] ), 'a size row with no file is dropped, not emitted as a broken URL' );

$md_local = ams_fast_media_details(
	array(
		'_wp_attached_file'       => '2021/09/poster.jpg',
		'_wp_attachment_metadata' => $md_attmeta,
	),
	'https://infotainment.ams.com.kh/wp-content/uploads'
);
t_same( 'https://infotainment.ams.com.kh/wp-content/uploads/2021/09/poster.jpg', $md_local['source_url'], 'a never-offloaded file stays on the local uploads base' );

t_same( null, ams_fast_media_details( array(), 'https://x.test/uploads' ), 'no _wp_attached_file -> null (registry renders no poster)' );

$md_nosizes = ams_fast_media_details(
	array( '_wp_attached_file' => '2021/09/poster.jpg', 'khs3data_offloaded' => '1', 'khs3data_path' => '2021/09/' ),
	'https://x.test/uploads'
);
t_same( array(), $md_nosizes['sizes'], 'missing attachment metadata -> empty sizes, zero dims' );
t_same( 0, $md_nosizes['width'], 'width defaults to 0 (posterOf treats it as no-portrait)' );

/* ---------------------------------------------------------------------------
 * 7. SMALL HELPERS
 * ------------------------------------------------------------------------ */

t_group( '7. helpers' );

t_same( array( 3, 1, 2 ), ams_fast_id_list( array( 3, 1, 3, 2, 0, -5, '2' ) ), 'id list dedupes, drops non-positives, preserves order' );
t_same( array(), ams_fast_id_list( array( 0, -1, 'x' ) ), 'id list of nothing usable is empty' );
t_same( '%d,%d,%d', ams_fast_placeholders( array( 1, 2, 3 ) ), 'placeholders for ints' );
t_same( '%s,%s', ams_fast_placeholders( array( 'a', 'b' ), '%s' ), 'placeholders for strings' );
t_same( array(), ams_fast_unserialize( 'not serialized' ), 'garbage unserializes to an empty array, never false' );
t_same( array(), ams_fast_unserialize( null ), 'null unserializes to an empty array' );
t_same( array( 'a' => 1 ), ams_fast_unserialize( serialize( array( 'a' => 1 ) ) ), 'a real array round trips' );

/* ---------------------------------------------------------------------------
 * pub-menu's allow-list (1.5.0)
 *
 * The resource takes a menu SLUG from the query string. Everything else about
 * it is SQL, but this is the security-relevant half and it is pure: the public
 * site may read the menus it renders, and nothing else. A regression here
 * would quietly turn a navigation endpoint into "read any menu by name".
 * ------------------------------------------------------------------------ */

$menus = ams_fast_public_menus();
t_ok( is_array( $menus ) && count( $menus ) > 0, 'pub-menu: the allow-list is a non-empty array' );
t_ok( in_array( 'ams-infotainment-third-menu', $menus, true ), 'pub-menu: the program-icon strip is allowed' );
t_ok( ! in_array( 'primary-menu', $menus, true ), 'pub-menu: an unlisted menu is NOT allowed' );
t_ok( ! in_array( '', $menus, true ), 'pub-menu: the empty slug is not allowed (a missing ?menu= must 404)' );
foreach ( $menus as $slug ) {
	t_ok(
		is_string( $slug ) && preg_match( '/^[a-z0-9-]+$/', $slug ) === 1,
		"pub-menu: '$slug' is a plain slug (no wildcard, no SQL metacharacter)"
	);
}

/* ---------------------------------------------------------------------------
 * pub-menu's icon candidates (1.5.1) — the v1.5.0 regression, pinned.
 *
 * v1.5.0 only considered meta keys starting with `_menu_item_`. The menu-image
 * plugin stores the icon in `_thumbnail_id`, so `images` came back EMPTY on all
 * 14 live rows, every row failed the frontend's has-an-icon test, and the strip
 * silently fell back to its hardcoded copy — ok:true the whole way. These
 * assertions exist so that prefix can never come back.
 *
 * The fixture is the REAL meta shape read off live on 2026-08-06.
 * ------------------------------------------------------------------------ */

t_group( '8. pub-menu icon candidates' );

$live_menu_meta = array(
	'_menu_item_type'                 => 'custom',
	'_menu_item_menu_item_parent'     => '0',
	'_menu_item_object_id'            => '221856',   // a POST id, not an attachment
	'_menu_item_object'               => 'custom',
	'_menu_item_target'               => '',
	'_menu_item_classes'              => 'a:1:{i:0;s:0:"";}',
	'_menu_item_xfn'                  => '',
	'_menu_item_url'                  => 'https://infotainment.ams.com.kh/tv-show/',
	'_menu_item_icon'                 => '',         // the plugin's icon-CLASS field: EMPTY
	'_menu_item_image_type'           => 'image',
	'_menu_item_image_size'           => 'menu-36x36',
	'_menu_item_image_title_position' => 'hide',
	'_menu_item_image_button'         => 'false',
	'_thumbnail_id'                   => '221857',   // <- the icon actually lives here
	'_wp_old_date'                    => '2026-08-04',
);

$cands = ams_fast_meta_attachment_ids( $live_menu_meta );
t_ok( isset( $cands['_thumbnail_id'] ), 'pub-menu: _thumbnail_id IS a candidate (the v1.5.0 miss)' );
t_same( 221857, $cands['_thumbnail_id'], 'pub-menu: _thumbnail_id keeps its value as an int' );
t_ok( isset( $cands['_menu_item_object_id'] ), 'pub-menu: a POST id is still OFFERED (only the attachment JOIN can reject it)' );
t_ok( ! isset( $cands['_menu_item_icon'] ), 'pub-menu: an empty value is not a candidate' );
t_ok( ! isset( $cands['_menu_item_image_size'] ), 'pub-menu: a non-numeric value is not a candidate' );
t_ok( ! isset( $cands['_menu_item_url'] ), 'pub-menu: a URL is not a candidate' );
t_ok( ! isset( $cands['_wp_old_date'] ), 'pub-menu: a date string is not a candidate' );
t_ok( ! isset( $cands['_menu_item_menu_item_parent'] ), 'pub-menu: "0" is not a candidate' );
t_same( 2, count( $cands ), 'pub-menu: exactly two candidates from the real live meta shape' );

// The keys are returned so a resolved image can be reported under the key it
// came from — that is how the frontend (and the next reader) learns the key.
t_same( array( '_menu_item_object_id', '_thumbnail_id' ), array_keys( $cands ), 'pub-menu: candidates are keyed by meta key, in meta order' );

t_same( array(), ams_fast_meta_attachment_ids( array() ), 'pub-menu: no meta -> no candidates' );
t_same( array(), ams_fast_meta_attachment_ids( array( 'a' => '-5', 'b' => '0', 'c' => '1.5', 'd' => ' 7' ) ), 'pub-menu: negatives, zero, decimals and padded ints are all rejected' );

/* ---------------------------------------------------------------------------
 * pub-comment-counts (1.5.2) — the response shape.
 *
 * The SQL half (approved only, comment_type IN ('','comment'), published posts
 * only) needs a database and is verified against live REST by the session's
 * stage harnesses. What is pure — and what a caller actually depends on — is
 * that EVERY requested id comes back, in the order asked for, as an int.
 * A post with no comments must answer 0, never an absent key: the frontend
 * reads counts[id] and an `undefined` would render as "NaN comments".
 * ------------------------------------------------------------------------ */

t_group( '9. pub-comment-counts' );

$rows = array(
	(object) array( 'comment_post_ID' => '222041', 'n' => '3' ),
	(object) array( 'comment_post_ID' => '11319', 'n' => '1' ),
);

t_same(
	array( '222041' => 3, '11319' => 1 ),
	ams_fast_comment_count_map( $rows, array( 222041, 11319 ) ),
	'comment counts: database strings become ints'
);
t_same(
	array( '10043' => 0, '222041' => 3 ),
	ams_fast_comment_count_map( $rows, array( 10043, 222041 ) ),
	'comment counts: a post with no comment rows answers 0, not an absent key'
);
t_same(
	array( '1' => 0, '2' => 0, '3' => 0 ),
	ams_fast_comment_count_map( array(), array( 1, 2, 3 ) ),
	'comment counts: no rows at all still answers for every id (the site today)'
);
t_same(
	array( '11319' => 1, '222041' => 3 ),
	ams_fast_comment_count_map( $rows, array( 11319, 222041 ) ),
	'comment counts: order follows the REQUEST, not the database'
);
t_same(
	array(),
	ams_fast_comment_count_map( $rows, array() ),
	'comment counts: asking about nothing answers nothing'
);
$unrequested = ams_fast_comment_count_map( $rows, array( 10043 ) );
t_ok( ! isset( $unrequested['222041'] ), 'comment counts: a row nobody asked about is never volunteered' );

/* ---------------------------------------------------------------------------
 * pub-authors (1.5.3) — the post-type allow-list.
 *
 * This is the security-relevant half of the only pub- resource that serves
 * USER rows: every entry in this list widens who counts as a public author.
 * It is core's own rule pinned by hand (get_post_types(show_in_rest => true),
 * which SHORTINIT cannot compute), so the assertions guard the shape and the
 * two entries whose presence is load-bearing.
 * ------------------------------------------------------------------------ */

t_group( '10. pub-authors post types' );

$types = ams_fast_public_author_post_types();
t_ok( is_array( $types ) && count( $types ) > 0, 'pub-authors: the type list is a non-empty array' );
t_ok( in_array( 'post', $types, true ), 'pub-authors: articles make you an author' );
t_ok( in_array( 'movie', $types, true ) && in_array( 'tv_show', $types, true ),
	'pub-authors: programs do too — 4 of the 40 live authors have published NO posts' );
t_ok( in_array( 'attachment', $types, true ),
	'pub-authors: attachment is on the list, as in core (harmless: attachments are post_status=inherit, never publish)' );
t_same( count( $types ), count( array_unique( $types ) ), 'pub-authors: no duplicate types' );
foreach ( $types as $type ) {
	t_ok(
		is_string( $type ) && preg_match( '/^[a-z_]+$/', $type ) === 1,
		"pub-authors: '$type' is a plain type name (no wildcard, no SQL metacharacter)"
	);
}

/* ---------------------------------------------------------------------------
 * dashboard (1.6.0) — the window maths behind the newsroom screen.
 *
 * These four are the only parts of the redesigned dashboard that can be
 * wrong without a database: the range clamp (a ceiling set by a 57-second
 * measurement, not a preference), the timezone spelling, the dense-series
 * fill, and the vs-previous-period sums. Everything else there is SQL.
 * ------------------------------------------------------------------------ */

t_group( '11. dashboard windows' );

t_same( 7, ams_fast_clamp_days( 7 ), 'clamp_days: 7 is offered' );
t_same( 30, ams_fast_clamp_days( 30 ), 'clamp_days: 30 is offered' );
t_same( 90, ams_fast_clamp_days( 90 ), 'clamp_days: 90 is offered' );
t_same( 30, ams_fast_clamp_days( 365 ), 'clamp_days: 365 falls back to 30 — it measured 57 SECONDS live' );
t_same( 30, ams_fast_clamp_days( 0 ), 'clamp_days: 0 falls back to 30' );
t_same( 30, ams_fast_clamp_days( -5 ), 'clamp_days: a negative falls back to 30' );
t_same( 30, ams_fast_clamp_days( 31 ), 'clamp_days: an arbitrary window is not honoured' );
t_same( 30, ams_fast_clamp_days( 'drop table' ), 'clamp_days: a non-numeric falls back to 30' );

$t_now = new DateTimeImmutable( '2026-08-16 09:30:00', new DateTimeZone( '+07:00' ) );
t_same( array( '2026-07-18', '2026-08-16' ), ams_fast_custom_range( '2026-07-18', '2026-08-16', $t_now ), 'custom_range: a valid window passes through' );
t_same( array( '2026-08-16', '2026-08-16' ), ams_fast_custom_range( '2026-08-16', '2026-08-16', $t_now ), 'custom_range: a single day is a 1-day window' );
t_same( array( '2026-08-01', '2026-08-16' ), ams_fast_custom_range( '2026-08-01', '2026-09-30', $t_now ), 'custom_range: `to` in the future is capped at today' );
t_same( array( '2026-05-19', '2026-08-16' ), ams_fast_custom_range( '2026-01-01', '2026-08-16', $t_now ), 'custom_range: the span is clamped to 90 days by moving `from` — the 57s probe' );
t_same( array( null, null ), ams_fast_custom_range( '2026-08-16', '2026-08-01', $t_now ), 'custom_range: from after to is unusable' );
t_same( array( null, null ), ams_fast_custom_range( '2026-02-31', '2026-08-16', $t_now ), 'custom_range: Feb 31 is refused, not repaired to Mar 3' );
t_same( array( null, null ), ams_fast_custom_range( '', '', $t_now ), 'custom_range: absent pair falls back to the preset' );
t_same( array( null, null ), ams_fast_custom_range( '18-07-2026', '2026-08-16', $t_now ), 'custom_range: wrong date shape is refused' );
t_same( array( null, null ), ams_fast_custom_range( '2027-01-01', '2027-02-01', $t_now ), 'custom_range: a window entirely in the future is unusable' );

t_same( 1, ams_fast_span_days( '2026-08-16', '2026-08-16' ), 'span_days: one day is 1' );
t_same( 3, ams_fast_span_days( '2026-08-01', '2026-08-03' ), 'span_days: inclusive at both ends' );
t_same( 90, ams_fast_span_days( '2026-05-19', '2026-08-16' ), 'span_days: the clamped maximum window is 90 days' );
t_same( 31, ams_fast_span_days( '2026-07-01', '2026-07-31' ), 'span_days: a whole month' );

t_same( '+07:00', ams_fast_tz_offset_name( 7 ), 'tz_offset_name: +7 (Asia/Phnom_Penh, this site)' );
t_same( '+00:00', ams_fast_tz_offset_name( 0 ), 'tz_offset_name: zero is +00:00' );
t_same( '-03:30', ams_fast_tz_offset_name( -3.5 ), 'tz_offset_name: a negative half-hour zone' );
t_same( '-00:30', ams_fast_tz_offset_name( -0.5 ), 'tz_offset_name: a negative sub-hour zone keeps its sign' );
t_same( '+05:45', ams_fast_tz_offset_name( 5.75 ), 'tz_offset_name: a 45-minute zone (Nepal)' );
t_same( '+01:00', ams_fast_tz_offset_name( 0.999 ), 'tz_offset_name: rounding to 60 minutes carries into the hour' );
t_ok(
	( new DateTimeZone( ams_fast_tz_offset_name( 7 ) ) )->getOffset( new DateTime( '2026-08-05', new DateTimeZone( 'UTC' ) ) ) === 25200,
	'tz_offset_name: the string DateTimeZone parses really is +7h in seconds'
);

$series = ams_fast_fill_days(
	'2026-07-30',
	5,
	array( '2026-07-30' => 100, '2026-08-01' => 250, '2026-09-09' => 999 ),
	array( '2026-08-02' => 3 )
);
t_same( 5, count( $series ), 'fill_days: returns exactly the requested number of days' );
t_same( '2026-07-30', $series[0]['d'], 'fill_days: starts on the start date' );
t_same( '2026-08-03', $series[4]['d'], 'fill_days: crosses the month boundary correctly' );
t_same( 100, $series[0]['views'], 'fill_days: a present day keeps its value' );
t_same( 0, $series[1]['views'], 'fill_days: a missing day is ZERO, not skipped — the chart must show the gap' );
t_same( 250, $series[2]['views'], 'fill_days: values land on the right day' );
t_same( 3, $series[3]['posts'], 'fill_days: the two series are filled independently' );
t_same( 0, $series[3]['views'], 'fill_days: a day with posts but no views is still zero views' );
$days_seen = array();
foreach ( $series as $row ) {
	$days_seen[] = $row['d'];
}
t_same( $days_seen, array_unique( $days_seen ), 'fill_days: never repeats a day' );
$sorted = $days_seen;
sort( $sorted );
t_same( $sorted, $days_seen, 'fill_days: ascending, so a chart can plot it in order' );
t_ok(
	! in_array( 999, array_column( $series, 'views' ), true ),
	'fill_days: a value outside the window is dropped, not folded into an edge day'
);

$flat = ams_fast_fill_days( '2026-08-01', 3, array(), array() );
t_same( array( 0, 0, 0 ), array_column( $flat, 'views' ), 'fill_days: no data at all is a real run of zeros' );

// 14 days: 1..14 in `posts`, so the last 7 sum to 68 and the 7 before to 28.
$fourteen = array();
for ( $i = 1; $i <= 14; $i++ ) {
	$fourteen[] = array( 'd' => sprintf( '2026-07-%02d', $i ), 'views' => $i * 10, 'posts' => $i );
}
list( $cur, $prev ) = ams_fast_tail_sums( $fourteen, 7, 'posts' );
t_same( 77, $cur, 'tail_sums: current window is the LAST 7 entries (8+9+…+14)' );
t_same( 28, $prev, 'tail_sums: previous window is the 7 before those (1+2+…+7)' );
list( $cur, $prev ) = ams_fast_tail_sums( $fourteen, 7, 'views' );
t_same( 770, $cur, 'tail_sums: reads the field it was asked for' );
t_same( 280, $prev, 'tail_sums: …in both windows' );

list( $cur, $prev ) = ams_fast_tail_sums( array_slice( $fourteen, 0, 10 ), 7, 'posts' );
t_same( 49, $cur, 'tail_sums: a 10-day series still yields a full current window' );
t_same( null, $prev, 'tail_sums: but the previous window is NULL, not a partial sum — no false delta' );

list( $cur, $prev ) = ams_fast_tail_sums( array_slice( $fourteen, 0, 4 ), 7, 'posts' );
t_same( 10, $cur, 'tail_sums: a series shorter than the window sums what exists' );
t_same( null, $prev, 'tail_sums: …and still refuses a previous window' );

list( $cur, $prev ) = ams_fast_tail_sums( array(), 7, 'posts' );
t_same( 0, $cur, 'tail_sums: an empty series is 0, not a warning' );
t_same( null, $prev, 'tail_sums: an empty series has no previous window' );

$missing = array( array( 'd' => '2026-07-01' ), array( 'd' => '2026-07-02', 'posts' => 5 ) );
list( $cur, ) = ams_fast_tail_sums( $missing, 2, 'posts' );
t_same( 5, $cur, 'tail_sums: a row missing the field counts as zero rather than throwing' );

/* ------------------------------------------------------------------------ */

$t = $GLOBALS['ams_t'];
echo "\n" . str_repeat( '-', 60 ) . "\n";
echo $t['fail'] ? "FAILED  {$t['fail']} of " . ( $t['pass'] + $t['fail'] ) . "\n" : "PASSED  {$t['pass']} assertions\n";
foreach ( $t['failures'] as $f ) {
	echo "  - $f\n";
}
exit( $t['fail'] ? 1 : 0 );
