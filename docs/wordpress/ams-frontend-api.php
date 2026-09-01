<?php
/**
 * Plugin Name: AMS Frontend API
 * Description: General-purpose endpoints for the AMS Infotainment Next.js frontend (add new ones here as needed). Read-only + a standalone hero-slider embed + the homepage featured-program picker + anonymous REST commenting + per-user login tokens for authenticated writes + program custom-meta exposed to REST + skips AMS Cache's synchronous page warmer on dashboard writes (96s -> under 1s). Self-contained — deactivate/delete anytime with zero effect on anything else.
 * Version:     1.22.0
 * Author:      Soth Kimleng
 *
 * Standalone "add endpoints as needed" API file, separate from the legacy
 * AMS3E-API plugin. Everything is prefixed `ams_afa_`, creates no tables, and
 * Deactivate → Delete leaves behind exactly one option (see below).
 *
 * ── Endpoints ────────────────────────────────────────────────────────────────
 *  GET /wp-json/wp/v2/web/tv-show-episodes?tv_show=<id>   episodes of a TV show
 *        Obsok=14512, One-Minute-for-Health=14570   (&page_no= &page_size=)
 *        Since 1.5.0 each row also carries run_time + release_date, so the
 *        frontend's episode lists can print "27:29 នាទី | Added: 09.11.2022".
 *
 *  GET /wp-json/wp/v2/web/episode?id=<id>                 one episode, in full
 *        Video source, run time, release date, parent show + season name — all
 *        of it private MasVideos meta that core REST will not expose.
 *
 *  GET /wp-json/wp/v2/web/featured-program                the homepage's video
 *        banner. Which program, and the artwork behind it, are picked in
 *        Settings → Featured Program. Answers { status, data: null } when unset.
 *  POST /wp-json/wp/v2/web/featured-program  { movie_id, bg_image }  (1.7.4)
 *        The same setting, writable by the dashboard's Settings screen
 *        (manage_options, via X-AMS-Token). Pings the frontend's
 *        featured-program cache tag on success.
 *
 *  POST /wp-json/wp/v2/web/login   { username, password }  issue a login token
 *        Authenticates a REAL WordPress user (the credentials they already use —
 *        NOT an application password) and returns a signed, 12h bearer token plus
 *        { id, name, username, roles, capabilities }. Send the token back on every
 *        write in an  X-AMS-Token:  header (see the auth note below) and the REST
 *        call runs AS that user, with WordPress enforcing capabilities natively.
 *        401 on bad credentials, 403 if the account has no dashboard access,
 *        429 once an IP trips the brute-force throttle. Requires HTTPS.
 *
 *  GET /wp-json/wp/v2/web/me                               who the token is
 *        The same { id, name, username, roles, capabilities } for whoever the
 *        X-AMS-Token identifies. The frontend calls it to re-validate a stored
 *        session and refresh role gating. 401 when the token is missing/expired.
 *
 *  POST /wp-json/wp/v2/web/cache/purge  { post_id }        refresh AMS Cache (1.10.0, rebuilt 1.17.0)
 *        Deletes the WordPress site's OWN cached HTML for the pages a post
 *        appears on: its page, the homepage, its category/tag archives, AND
 *        every published landing Page (/strange/ and its ~55 siblings render
 *        "latest news" blocks no purge-by-relationship can know about). Never
 *        the preload crawl. 1.17.0 purges via ams-cache's own
 *        scm_purge_cache_uri() — correct key by construction (see the key-
 *        scheme note at ams_afa_cache_purge), stats sidecar + nginx copy
 *        included, zero HTTP — replacing both the guessed-key deletes
 *        (1.10.0, matched nothing) and the whole-store flush (1.15.0-1.16.0,
 *        now the AMS_AFA_CACHE_FLUSH_ALL fallback lever, default OFF).
 *        Exists because 1.9.0 removes AMS Cache's purge hooks for dashboard
 *        writes (see the warmer note below), which keeps writes at ~5s but
 *        leaves the WP site serving stale pages until TTL; the dashboard calls
 *        this AFTER a publish returns, so the write stays fast and the old
 *        site still refreshes. Answers { status, data: { driver, cached,
 *        purged, pages: [ { url, label, cached, purged } ] } }; SKIPPED when
 *        AMS Cache is absent or off. Failures come back as HTTP 200 +
 *        status-in-body, because the host swaps 4xx bodies for HTML error
 *        pages. Gated on edit_posts.
 *
 *  GET /wp-json/wp/v2/web/roles                            all roles + caps (1.7.5)
 *        Every role with its display name, granted capability list and user
 *        count — the dashboard's read-only Role Management screen. Gated on
 *        list_users (same as the Users screen), via X-AMS-Token.
 *
 *  GET /wp-json/wp/v2/web/post-templates            theme post templates (1.19.0)
 *        The post templates the ACTIVE THEME registers, as {file, name} rows —
 *        e.g. templates/celebrity-template.php -> "Celebrity-Article Block".
 *        Core REST exposes a post's template VALUE but never the list of legal
 *        ones (Gutenberg gets it from editor bootstrap, not the API), so the
 *        dashboard's article editor had no way to render the dropdown without
 *        hardcoding sixteen theme filenames. Gated on edit_posts.
 *
 *  GET /hero-embed[?alias=<slider alias>]                 standalone Slider
 *        Renders ONE Slider Revolution slider (no theme chrome), for embedding
 *        in the Next frontend via an <iframe>. Defaults to the homepage slider;
 *        `?alias=` picks a landing page's own (whitelisted below — an unknown
 *        alias falls back to the homepage one). Sends a frame-ancestors header
 *        so the frontend origins below may embed it, posts its height to the
 *        parent for responsive auto-sizing, and forwards slide-link clicks to
 *        the parent as postMessage — an <a> inside the iframe would otherwise
 *        navigate the visitor off the frontend and onto WordPress.
 *        1.11.0: strips AMS Ads Manager's wp_head/wp_footer output, which was
 *        booting the MSA/Damrei popup inside the frame (see the note in
 *        ams_afa_render_embed). Applies to /sr-embed too — same renderer.
 *
 *  GET /sr-embed?alias=<slider alias>                     ANY slider   (1.8.0)
 *        The same standalone renderer, for sliders nobody can whitelist ahead
 *        of time: article bodies embed Slider Revolution modules with generated
 *        aliases (INFHB010_01, …), and post_content carries the module markup
 *        WITHOUT the runtime that draws it — no sr7.css, no sr7.js, no per-module
 *        SR7.JSON — so the frontend renders collapsed inline elements. Framing
 *        this route instead gives the module the WordPress page it needs.
 *        Unlike /hero-embed there is NO fallback: an alias that names no real
 *        slider 404s. Safety comes from checking Slider Revolution's own table
 *        (ams_afa_slider_alias) rather than from a hand-kept list.
 *
 * ── Behaviour changes ────────────────────────────────────────────────────────
 *  Dashboard article permalinks (1.22.0): a core REST post write carrying
 *        X-AMS-Category-Permalink: 1 stores `custom_permalink` as
 *        <deepest-category-slug>/<post-slug>. It runs after core has persisted
 *        terms, so the `link` in that same REST response is already canonical.
 *        Ordinary wp-admin, imports and autosaves remain untouched.
 *
 *  Profile avatar (1.20.0): a writable `ams_avatar` REST field on the user
 *        object, so GET/POST wp/v2/users/me carries the dashboard's profile
 *        picture. Core has no uploadable avatar — `avatar_urls` is an
 *        md5-of-email Gravatar, unset for every account on this site — so the
 *        picture is an attachment referenced from user meta (`ams_avatar_id`
 *        + `ams_avatar_url`, resolved at write time). See
 *        ams_afa_user_avatar_write for why the URL is stored, not derived.
 *        1.20.1 also answers `pre_get_avatar_data` with that picture, so
 *        wp-admin (Users list, profile screen, comments) shows it too.
 *
 *  Episode → `_seasons` sync (1.18.0): REST episode writes (the dashboard's
 *        episode dialog) now slot the episode into its show's `_seasons`
 *        repeater — the structure the WP site actually renders episode lists
 *        from — sorted by season and episode number, with the episode's
 *        `_tv_show_season_id` index kept true. Trash/delete/untrash maintain
 *        it too. See ams_afa_sync_show_seasons.
 *
 *  Anonymous REST comments: WordPress supports anonymous commenting via the
 *        classic wp-comments-post.php but blocks it over REST by default. The
 *        site's discussion settings already allow anonymous comments, so the
 *        `rest_allow_anonymous_comments` filter below simply lets REST agree
 *        with them. Comment moderation settings still apply unchanged.
 *
 *  Program custom meta over REST: MasVideos/Vodi keep a program's real fields
 *        (video source, release date, broadcast schedule, backdrop, the show
 *        link, and the episode fields) in private `_`-prefixed post meta that
 *        core REST hides — `wp/v2/movie|tv_show|episode` answer `meta: []`. The
 *        `register_post_meta` block below exposes just the CURATED set the
 *        dashboard editor writes (show_in_rest + an edit-capability auth_callback),
 *        so `?context=edit` now returns them and PATCH can write them. It exposes
 *        nothing it doesn't need (no `_seasons`, trailer, buy-ticket, IMDb/TMDb).
 *
 *  Program edit capabilities: MasVideos gives movie/tv_show/episode their own
 *        capability set, and this site's roles were never granted all of it
 *        (editing someone else's / a published program via REST returned 403).
 *        1.7.1 tried writing the missing caps onto the Administrator role with
 *        add_cap; that proved ineffective, so since 1.7.2 a `user_has_cap`
 *        filter answers the checks at runtime instead: Administrators pass any
 *        program cap, other roles extend the base program caps they already
 *        hold (edit_movies → edit_others/published_movies, …). Nothing is
 *        written to roles anymore; whatever 1.7.1 recorded as added is still
 *        handed back on deactivation.
 *
 *  Per-user token auth: a `determine_current_user` filter reads the X-AMS-Token
 *        header, verifies the /login token (HMAC over `wp_salt('auth')`, and
 *        additionally bound to a fragment of the user's password hash so that
 *        changing the password silently revokes every outstanding token) and,
 *        when it is valid, runs the request as that user. No cookies, no REST
 *        nonce, and no wp-config / .htaccess changes — a request with no header,
 *        or an already-authenticated wp-admin request, is left exactly as it was.
 *
 * ── Admin ────────────────────────────────────────────────────────────────────
 *  Settings → Featured Program      writes the option `ams_afa_featured_program`
 *        ({ movie_id, bg_image }).
 *  Settings → Frontend Cache        writes the option `ams_afa_revalidate`
 *        ({ url, secret }) — the publish→frontend revalidation webhook (1.7.3).
 *        These two options are the plugin's only stored OPTIONS. Since 1.20.0
 *        the profile avatar also leaves `ams_avatar_id` / `ams_avatar_url`
 *        user-meta rows behind — harmless orphans if the plugin is deleted.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/* ───────── Dashboard article category permalink (core REST write) ───────── */

/** Number of ancestors above a category. Invalid/cyclic trees stop safely. */
function ams_afa_category_depth( $term_id ) {
    $depth = 0;
    $seen  = array();
    $term  = get_term( (int) $term_id, 'category' );

    while ( $term && ! is_wp_error( $term ) && $term->parent ) {
        if ( isset( $seen[ $term->term_id ] ) ) {
            break;
        }
        $seen[ $term->term_id ] = true;
        $depth++;
        $term = get_term( (int) $term->parent, 'category' );
    }
    return $depth;
}

/** Deepest assigned category; Khmer-name order makes equal-depth ties stable. */
function ams_afa_permalink_category( $post_id ) {
    $terms = wp_get_post_categories( (int) $post_id, array( 'fields' => 'all' ) );
    if ( is_wp_error( $terms ) || empty( $terms ) ) {
        return null;
    }

    // Ignore Uncategorized whenever the writer assigned a real category.
    $default_id = (int) get_option( 'default_category' );
    if ( count( $terms ) > 1 ) {
        $terms = array_values( array_filter( $terms, function ( $term ) use ( $default_id ) {
            return (int) $term->term_id !== $default_id;
        } ) );
    }

    usort( $terms, function ( $a, $b ) {
        $depth = ams_afa_category_depth( $b->term_id ) - ams_afa_category_depth( $a->term_id );
        return 0 !== $depth ? $depth : strnatcasecmp( $a->name, $b->name );
    } );
    return $terms ? $terms[0] : null;
}

/**
 * Core has already saved title, slug and terms when this action fires, but has
 * not prepared its response yet. Updating the Custom Permalinks meta here makes
 * the response's `link` immediately read /category-slug/post-slug/.
 */
add_action( 'rest_after_insert_post', function ( $post, $request ) {
    if ( '1' !== (string) $request->get_header( 'x-ams-category-permalink' ) ) {
        return;
    }
    if ( ! $post instanceof WP_Post || 'post' !== $post->post_type || ! current_user_can( 'edit_post', $post->ID ) ) {
        return;
    }

    $category = ams_afa_permalink_category( $post->ID );
    $slug     = sanitize_title( $post->post_name );
    if ( ! $category || '' === $category->slug || '' === $slug ) {
        return;
    }

    update_post_meta(
        $post->ID,
        'custom_permalink',
        trailingslashit( trim( sanitize_title( $category->slug ), '/' ) . '/' . trim( $slug, '/' ) )
    );
    clean_post_cache( $post->ID );
}, 10, 2 );

/* ─────────────────────────────── CONFIG ───────────────────────────────────── */

// The Slider Revolution alias shown as the homepage hero (and the fallback for
// any ?alias= this plugin doesn't recognise).
define( 'AMS_AFA_HERO_ALIAS', 'homepage-2' );

/**
 * The sliders /hero-embed may render, read off the live landing pages'
 * `data-alias` markup (several pages share one slider). A WHITELIST because the
 * alias arrives in the query string, and "render any shortcode argument a
 * visitor sends" is not a door to leave open.
 */
function ams_afa_hero_aliases() {
    return array(
        AMS_AFA_HERO_ALIAS,           // homepage
        'cover-animation-14-12',      // /entertainment-news
        'cover-animation-11',         // /life-style
        'entainment-home-page-1',     // /celebrity
        'entainment-home-page-1-1',   // /movie-and-music, /culture
        'entainment-home-page-1-1-1', // /strange
        'life-style-home-page-1',     // /life-style/travel, /life-style/architecture
        'life-style-home-page-1-1',   // /life-style/love-and-relation
        'life-style-home-page-1-1-1', // /life-style/health-and-beauty
        'celebrity-new-1',            // /life-style/life-tips
    );
}

/** Bumped on every release. Part of the embed cache key, so shipping a new
 *  version invalidates every cached frame rather than leaving stale HTML (and a
 *  stale AMS_PARENTS list) behind a deploy. */
define( 'AMS_AFA_VERSION', '1.20.1' );

/** How long a rendered embed is reused server-side. The cost it avoids is a
 *  ~3.7s WordPress boot; the price is that a slider edited in wp-admin takes up
 *  to this long to appear in the frame. Ten minutes keeps editing tolerable
 *  while making the boot effectively free — at one view per second, 599 of
 *  every 600 views skip it. */
define( 'AMS_AFA_EMBED_TTL', 10 * MINUTE_IN_SECONDS );

/** Browser-side reuse. Deliberately shorter than the server TTL, and `private`
 *  (see ams_afa_render_embed) so no shared proxy may store a frame whose URL
 *  path alone does not identify which slider it holds. */
define( 'AMS_AFA_EMBED_BROWSER_TTL', 5 * MINUTE_IN_SECONDS );

/**
 * Frontend origins allowed to embed /hero-embed and /sr-embed in an <iframe>.
 *
 * Feeds BOTH the frame-ancestors header and the AMS_PARENTS list the embed
 * posts its height/clicks to — so an origin missing here is a hero that either
 * refuses to connect or loads and never sizes itself.
 *
 * This list is baked into the CACHED /hero-embed HTML (AMS_PARENTS), so a
 * change here needs AMS Cache cleared before it takes effect.
 */
function ams_afa_embed_origins() {
    return array(
        // Production (Dokploy). Its absence is what made the live hero blank —
        // "infotainment.ams.com.kh refused to connect" — diagnosed and parked
        // in Session 31 §5, fixed here in 1.11.0 because the popup fix below
        // is unobservable in production while the frame itself is blocked.
        'https://info.amscloud.cc',
        'http://localhost:3000',
        'https://ams-infotainment-frontend.vercel.app',
    );
}

/* ─────────────────────────── TV-show episodes ─────────────────────────────── */

add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'tv-show-episodes', array(
        'methods'             => 'GET',
        'callback'            => 'ams_afa_get_tv_show_episodes',
        'permission_callback' => '__return_true',
        'args'                => array(
            'tv_show' => array(
                'required'          => true,
                'validate_callback' => function ( $param ) {
                    return is_numeric( $param ) && (int) $param > 0;
                },
            ),
            'page_no'   => array( 'required' => false ),
            'page_size' => array( 'required' => false ),
        ),
    ) );
} );

function ams_afa_get_tv_show_episodes( $request ) {
    $tv_show_id = (int) $request->get_param( 'tv_show' );
    $page_no    = (int) $request->get_param( 'page_no' ) ?: 1;
    $page_size  = (int) $request->get_param( 'page_size' ) ?: 24;

    $query = new WP_Query( array(
        'post_type'      => 'episode',
        'post_status'    => 'publish',
        'posts_per_page' => $page_size,
        'paged'          => $page_no,
        'orderby'        => 'date',
        'order'          => 'DESC',
        'meta_query'     => array(
            array( 'key' => '_tv_show_id', 'value' => $tv_show_id ),
        ),
    ) );

    $data = array();
    foreach ( $query->posts as $post ) {
        $data[] = array(
            'id'             => $post->ID,
            'title'          => get_the_title( $post->ID ),
            'episode_number' => get_post_meta( $post->ID, '_episode_number', true ),
            // Index into the parent show's `_seasons` array, NOT an id. Editors
            // have left it wrong on plenty of episodes (obsok's "S2:E2" says 1),
            // so treat it as a hint, never as the ordering.
            'season_id'      => (int) get_post_meta( $post->ID, '_tv_show_season_id', true ),
            'permalink'      => get_permalink( $post->ID ),
            'post_thumbnail' => get_the_post_thumbnail_url( $post->ID, 'full' ),
            // Since 1.5.0 — what the live episode rows print. run_time is free
            // text ("02:01 នាទី") and hand-typed; release_date is Unix seconds
            // at MIDNIGHT PHNOM PENH TIME (format it in Asia/Phnom_Penh, or the
            // date prints a day early — the live theme's own bug).
            'run_time'       => trim( (string) get_post_meta( $post->ID, '_episode_run_time', true ) ),
            'release_date'   => (int) get_post_meta( $post->ID, '_episode_release_date', true ),
        );
    }

    return new WP_REST_Response( array(
        'status'     => 'OK',
        'data'       => $data,
        'page'       => $page_no,
        'per_page'   => $page_size,
        'total'      => (int) $query->found_posts,
        'total_page' => (int) $query->max_num_pages,
    ), 200 );
}

/* ─────────────────────────── Episode detail ───────────────────────────────── */

/**
 * The name of the season at $index of a show's `_seasons` meta, or ''.
 *
 * `_seasons` is a serialised array of { name, image_id, episodes[] } — the
 * episode's `_tv_show_season_id` is that array's INDEX, not an id. The name is
 * what the live page prints above its episode grid ("រដូវកាលទី១").
 */
function ams_afa_season_name( $tv_show_id, $index ) {
    $seasons = maybe_unserialize( get_post_meta( $tv_show_id, '_seasons', true ) );
    if ( ! is_array( $seasons ) || ! isset( $seasons[ $index ]['name'] ) ) {
        return '';
    }
    return (string) $seasons[ $index ]['name'];
}

/* ─────────── Episode → show `_seasons` sync (1.18.0) ──────────────────────── */

/* WHY THIS EXISTS: the WordPress site renders a show's episode lists from the
 * show's `_seasons` meta — the serialised repeater wp-admin's "Seasons &
 * Episodes" box edits — NOT from any query. An episode post with perfect meta
 * that is absent from that array is invisible on the WP site. The Next.js side
 * queries episodes by their `_tv_show_id` meta instead, which is why the
 * dashboard always saw episodes the show page didn't. Dashboard-created
 * episodes therefore existed everywhere except where readers look.
 *
 * These hooks keep `_seasons` true on every REST episode write and on
 * trash/untrash/delete: the episode is slotted into the season its "S2:E8"
 * label names, seasons stay sorted by number, episodes stay sorted by episode
 * number — a backfilled E8 lands between E7 and E9, not at the end — and every
 * episode's `_tv_show_season_id` (the season's array INDEX, which shifts when
 * seasons are added or re-ordered) is re-pointed. Manual wp-admin edits still
 * work; the next sync simply reconciles them.
 */

/** "S2:E8" → array( 2, 8 ). Tolerates spacing/case; a bare number means
 *  season 1; unparseable → array( 0, 0 ). */
function ams_afa_label_numbers( $label ) {
    $label = (string) $label;
    if ( preg_match( '/S\s*(\d+)\s*:\s*E\s*(\d+)/i', $label, $m ) ) {
        return array( (int) $m[1], (int) $m[2] );
    }
    if ( preg_match( '/(\d+)\D+(\d+)/', $label, $m ) ) {
        return array( (int) $m[1], (int) $m[2] );
    }
    if ( preg_match( '/(\d+)/', $label, $m ) ) {
        return array( 1, (int) $m[1] );
    }
    return array( 0, 0 );
}

/** First number in a season NAME — Arabic or Khmer digits ("រដូវកាលទី ២" → 2);
 *  $fallback when the name carries none. */
function ams_afa_number_from_name( $name, $fallback ) {
    $name = strtr( (string) $name, array(
        '០' => '0', '១' => '1', '២' => '2', '៣' => '3', '៤' => '4',
        '៥' => '5', '៦' => '6', '៧' => '7', '៨' => '8', '៩' => '9',
    ) );
    if ( preg_match( '/(\d+)/', $name, $m ) ) {
        return (int) $m[1];
    }
    return (int) $fallback;
}

/** 2 → "២" — new seasons are named in the site's own convention. */
function ams_afa_khmer_digits( $n ) {
    return strtr( (string) (int) $n, array(
        '0' => '០', '1' => '១', '2' => '២', '3' => '៣', '4' => '៤',
        '5' => '៥', '6' => '៦', '7' => '៧', '8' => '៨', '9' => '៩',
    ) );
}

/**
 * Reconcile one episode into (or out of) its show's `_seasons` repeater.
 * $remove_only is the trash/delete path: take it out of every season, touch
 * nothing else.
 */
function ams_afa_sync_show_seasons( $episode_id, $remove_only = false ) {
    $episode_id = (int) $episode_id;
    $show_id    = (int) get_post_meta( $episode_id, '_tv_show_id', true );
    if ( $show_id <= 0 || 'tv_show' !== get_post_type( $show_id ) ) {
        return;
    }

    $seasons = maybe_unserialize( get_post_meta( $show_id, '_seasons', true ) );
    if ( ! is_array( $seasons ) ) {
        $seasons = array();
    }
    $before = $seasons;

    // 1. Remove the episode everywhere first — a label edit may have moved it
    //    to another season, and re-adding below is what puts it back.
    foreach ( $seasons as $i => $season ) {
        $eps = ( isset( $season['episodes'] ) && is_array( $season['episodes'] ) ) ? array_map( 'intval', $season['episodes'] ) : array();
        $seasons[ $i ]['episodes'] = array_values( array_filter( $eps, function ( $e ) use ( $episode_id ) {
            return $e > 0 && $e !== $episode_id;
        } ) );
    }

    if ( ! $remove_only ) {
        list( $season_no, ) = ams_afa_label_numbers( get_post_meta( $episode_id, '_episode_number', true ) );
        if ( $season_no < 1 ) {
            $season_no = 1;
        }

        // 2. The season the label names, matched by the number IN its name (so
        //    "រដូវកាលទី ២", "Season 2" and "S2" all answer to season 2);
        //    created in the site's Khmer naming when it doesn't exist yet.
        $target = null;
        foreach ( $seasons as $i => $season ) {
            if ( ams_afa_number_from_name( isset( $season['name'] ) ? $season['name'] : '', $i + 1 ) === $season_no ) {
                $target = $i;
                break;
            }
        }
        if ( null === $target ) {
            $seasons[] = array(
                'name'        => 'រដូវកាលទី ' . ams_afa_khmer_digits( $season_no ),
                'image_id'    => '',
                'episodes'    => array(),
                'year'        => '',
                'description' => '',
            );
            $target = count( $seasons ) - 1;
        }

        // 3. Insert, kept sorted by episode number (ties by post id, so the
        //    order is at least stable when labels are missing or duplicated).
        $eps   = $seasons[ $target ]['episodes'];
        $eps[] = $episode_id;
        $eps   = array_values( array_unique( $eps ) );
        $keys  = array();
        foreach ( $eps as $eid ) {
            list( , $n )  = ams_afa_label_numbers( get_post_meta( $eid, '_episode_number', true ) );
            $keys[ $eid ] = $n > 0 ? $n : PHP_INT_MAX;
        }
        usort( $eps, function ( $a, $b ) use ( $keys ) {
            return $keys[ $a ] === $keys[ $b ] ? $a - $b : $keys[ $a ] - $keys[ $b ];
        } );
        $seasons[ $target ]['episodes'] = $eps;

        // 4. Seasons themselves in season order (stable for number ties).
        $order = array();
        foreach ( $seasons as $i => $season ) {
            $order[ $i ] = ams_afa_number_from_name( isset( $season['name'] ) ? $season['name'] : '', $i + 1 );
        }
        uksort( $seasons, function ( $a, $b ) use ( $order ) {
            return $order[ $a ] === $order[ $b ] ? $a - $b : $order[ $a ] - $order[ $b ];
        } );
        $seasons = array_values( $seasons );
    }

    if ( $seasons !== $before ) {
        update_post_meta( $show_id, '_seasons', $seasons );
    }

    // 5. Every listed episode's `_tv_show_season_id` must equal its season's
    //    CURRENT index — creating or re-ordering seasons shifts the indexes of
    //    everyone else's episodes too, and the episode page prints its season
    //    name through this index. Writes only on drift, so the common case is
    //    all no-ops.
    foreach ( $seasons as $i => $season ) {
        foreach ( $season['episodes'] as $eid ) {
            if ( (int) get_post_meta( $eid, '_tv_show_season_id', true ) !== $i ) {
                update_post_meta( $eid, '_tv_show_season_id', $i );
            }
        }
    }
}

// After a REST create/update has fully landed (post + meta — this hook exists
// precisely because meta is written after the insert). Covers the dashboard's
// episode dialog; wp-admin's own metabox writes `_seasons` itself.
add_action( 'rest_after_insert_episode', function ( $post ) {
    if ( $post instanceof WP_Post && 'publish' === $post->post_status ) {
        ams_afa_sync_show_seasons( $post->ID );
    }
}, 20, 1 );

// Leaving the site: out of the repeater, whichever door — dashboard trash,
// wp-admin trash, or a straight force-delete.
add_action( 'wp_trash_post', function ( $post_id ) {
    if ( 'episode' === get_post_type( $post_id ) ) {
        ams_afa_sync_show_seasons( $post_id, true );
    }
}, 10, 1 );
add_action( 'before_delete_post', function ( $post_id ) {
    if ( 'episode' === get_post_type( $post_id ) ) {
        ams_afa_sync_show_seasons( $post_id, true );
    }
}, 10, 1 );

// Restored from trash: back into its season — but only once it is published
// again (core restores to draft by default since WP 5.6).
add_action( 'untrashed_post', function ( $post_id ) {
    if ( 'episode' === get_post_type( $post_id ) && 'publish' === get_post_status( $post_id ) ) {
        ams_afa_sync_show_seasons( $post_id );
    }
}, 10, 1 );

/**
 * GET /wp-json/wp/v2/web/episode?id=<id>
 *
 * Everything the frontend's episode page needs and that WordPress will not hand
 * over: MasVideos keeps the video source, the run time, the release date and the
 * parent show in underscore-prefixed post meta, none of it registered with
 * `show_in_rest`, so `wp/v2/episode/<id>` answers `meta: []`.
 *
 * `video.choice` is MasVideos' `_episode_choice`. Every episode on the site today
 * is `episode_url` holding a `vimeo.com/<id>[/<unlisted-hash>]` link, but the
 * other two sources are real fields, so all three are returned rather than
 * guessed at here — the frontend picks.
 *
 * `release_date` is a Unix timestamp of MIDNIGHT PHNOM PENH TIME. Vodi formats it
 * in UTC and so prints every episode one day early; it is returned raw and the
 * frontend formats it in Asia/Phnom_Penh.
 */
add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'episode', array(
        'methods'             => 'GET',
        'callback'            => 'ams_afa_get_episode',
        'permission_callback' => '__return_true',
        'args'                => array(
            'id' => array(
                'required'          => true,
                'validate_callback' => function ( $param ) {
                    return is_numeric( $param ) && (int) $param > 0;
                },
            ),
        ),
    ) );
} );

function ams_afa_get_episode( $request ) {
    $id   = (int) $request->get_param( 'id' );
    $post = get_post( $id );

    if ( ! $post || 'episode' !== $post->post_type || 'publish' !== $post->post_status ) {
        return new WP_Error( 'ams_afa_not_found', 'No such published episode.', array( 'status' => 404 ) );
    }

    $meta = function ( $key ) use ( $id ) {
        return (string) get_post_meta( $id, $key, true );
    };

    $tv_show_id    = (int) $meta( '_tv_show_id' );
    $season_id     = (int) $meta( '_tv_show_season_id' );
    $attachment_id = (int) $meta( '_episode_attachment_id' );

    return new WP_REST_Response( array(
        'status' => 'OK',
        'data'   => array(
            'id'             => $id,
            'title'          => get_the_title( $id ),
            'episode_number' => $meta( '_episode_number' ),
            // Free text, and inconsistently typed: "02:01 នាទី", "02: 15នាទី".
            'run_time'       => trim( $meta( '_episode_run_time' ) ),
            'release_date'   => (int) $meta( '_episode_release_date' ),
            'tv_show_id'     => $tv_show_id,
            // The show's own title, which is what the live <h1> uses — not the
            // `movie` post's, which for some programs carries a longer name.
            'tv_show_title'  => $tv_show_id ? get_the_title( $tv_show_id ) : '',
            'season_id'      => $season_id,
            'season_name'    => $tv_show_id ? ams_afa_season_name( $tv_show_id, $season_id ) : '',
            'post_thumbnail' => (string) get_the_post_thumbnail_url( $id, 'full' ),
            'video'          => array(
                'choice'     => $meta( '_episode_choice' ),
                'url'        => $meta( '_episode_url_link' ),
                'attachment' => $attachment_id ? (string) wp_get_attachment_url( $attachment_id ) : '',
                'embed'      => $meta( '_episode_embed_content' ),
            ),
        ),
    ), 200 );
}

/* ───────────────────────── Program (movie / tv_show) ──────────────────────── */

/** An attachment as { url, width, height }, or zeroes when there isn't one.
 *
 *  The dimensions are the point: editors do not reliably put a PORTRAIT poster in
 *  the featured-image slot. vanna-yeatra's tv_show carries 2560x398 landscape key
 *  art there. Handing the frontend the size lets it tell a poster from a backdrop
 *  by shape instead of trusting which field the image was filed under. */
function ams_afa_image( $attachment_id ) {
    $attachment_id = (int) $attachment_id;
    $empty         = array( 'url' => '', 'width' => 0, 'height' => 0 );

    if ( ! $attachment_id ) {
        return $empty;
    }
    $src = wp_get_attachment_image_src( $attachment_id, 'full' );

    return $src ? array( 'url' => (string) $src[0], 'width' => (int) $src[1], 'height' => (int) $src[2] ) : $empty;
}

/**
 * GET /wp-json/wp/v2/web/program?id=<id>
 *
 * A program's title, description, poster and BACKDROP. Replaces the frontend's
 * old core-REST call (`wp/v2/movie/<id>?_fields=…&_embed=wp:featuredmedia`), which
 * could reach the first three but never the backdrop: Vodi keeps it in
 * `_vodi_<post_type>_bg_image`, and core REST answers `meta: []`.
 *
 * Works for both post types the program registry uses — most programs are a
 * `movie`, vanna-yeatra is a `tv_show`.
 */
add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'program', array(
        'methods'             => 'GET',
        'callback'            => 'ams_afa_get_program',
        'permission_callback' => '__return_true',
        'args'                => array(
            'id' => array(
                'required'          => true,
                'validate_callback' => function ( $param ) {
                    return is_numeric( $param ) && (int) $param > 0;
                },
            ),
        ),
    ) );
} );

function ams_afa_get_program( $request ) {
    $id   = (int) $request->get_param( 'id' );
    $post = get_post( $id );

    if ( ! $post || ! in_array( $post->post_type, array( 'movie', 'tv_show' ), true ) || 'publish' !== $post->post_status ) {
        return new WP_Error( 'ams_afa_not_found', 'No such published program.', array( 'status' => 404 ) );
    }

    // MasVideos prefixes its meta with the post type: `_movie_run_time`,
    // `_tv_show_run_time`, and so on. `_cast` / `_crew` are NOT prefixed.
    $p = '_' . $post->post_type;

    // `_vodi_movie_bg_image` / `_vodi_tv_show_bg_image` — the wide key art behind
    // the program's hero. Empty on plenty of posts; the frontend falls back.
    $backdrop_id = get_post_meta( $id, '_vodi_' . $post->post_type . '_bg_image', true );

    return new WP_REST_Response( array(
        'status' => 'OK',
        'data'   => array(
            'id'          => $id,
            'slug'        => $post->post_name,
            'title'       => get_the_title( $id ),
            'description' => apply_filters( 'the_excerpt', get_the_excerpt( $id ) ),
            'permalink'   => get_permalink( $id ),
            'poster'      => ams_afa_image( get_post_thumbnail_id( $id ) ),
            'backdrop'    => ams_afa_image( $backdrop_id ),
            // Unix seconds at MIDNIGHT PHNOM PENH TIME. Format it in Asia/Phnom_Penh
            // — in UTC it lands on the previous day, and on a New Year's release
            // that means the wrong YEAR, which is the only part we show.
            'release_date' => (int) get_post_meta( $id, $p . '_release_date', true ),
            // Named `run_time`, but it is NOT a duration: editors put the broadcast
            // slot in it ("រៀងរាល់ថ្ងៃអាទិត្យ វេលាម៉ោង ៨:៣០ នាទីព្រឹក"). Never render
            // it as a length. Set on 16 of the 19 programs.
            //
            // NOT RETURNED: cast/crew. MasVideos has `_cast` and `_crew` fields and
            // the Vodi single-movie template prints them ("ផលិតករៈ …"), but on this
            // site they are an empty string on every one of the 19 programs — the
            // fields have never been used. Populate them in WP admin first, then add
            // them here; resolving a shape nobody has ever stored is guesswork.
            'schedule'     => trim( (string) get_post_meta( $id, $p . '_run_time', true ) ),
        ),
    ), 200 );
}

/* ─────────────────── Homepage featured program ────────────────────────────── */

/**
 * The wide video banner on the frontend's homepage (វនយាត្រា today).
 *
 * WHY AN OPTION AND NOT JUST THE MOVIE POST: the Vodi block that renders this on
 * the WordPress homepage — `wp:vodi/section-featured-movie` — stores the movie id
 * AND the banner art TOGETHER, per placement:
 *
 *   {"movie_id":"20275","bg_image":19925,"className":"vanayeatra"}
 *
 * and the art it points at is NOT the movie's own `_vodi_movie_bg_image`. On
 * vanna-yeatra those are two different files — 19925 (2560x576) on the homepage,
 * 20277 (2560x398) on the movie — same scene, different crop. Which one suits a
 * given slot is a layout decision, so the slot owns its artwork, like the block.
 *
 * Both crops carry the show's WORDMARK in the pixels, and so does every other
 * variant in the media library. That is by design: the frontend prints only a
 * small title label and lets the artwork carry the logo. Don't go looking for a
 * "no text" version to pick — there isn't a meaningful one.
 *
 * Everything else (title, description, poster, release year, trailer) is read
 * live from the chosen movie post.
 *
 * NOTE: this is the plugin's one and only option. Deleting the plugin leaves it
 * behind; `delete_option( 'ams_afa_featured_program' )` if you want it gone.
 */
define( 'AMS_AFA_FEATURED_OPTION', 'ams_afa_featured_program' );

function ams_afa_featured_config() {
    $opt = get_option( AMS_AFA_FEATURED_OPTION, array() );
    return array(
        'movie_id' => isset( $opt['movie_id'] ) ? (int) $opt['movie_id'] : 0,
        'bg_image' => isset( $opt['bg_image'] ) ? (int) $opt['bg_image'] : 0,
    );
}

/* --- Settings screen (Settings → Featured Program) --- */

add_action( 'admin_menu', function () {
    add_options_page(
        'Homepage Featured Program',
        'Featured Program',
        'manage_options',
        'ams-afa-featured',
        'ams_afa_featured_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'ams_afa_featured', AMS_AFA_FEATURED_OPTION, array(
        'type'              => 'array',
        'sanitize_callback' => 'ams_afa_sanitize_featured',
        'default'           => array(),
    ) );
} );

function ams_afa_sanitize_featured( $input ) {
    return array(
        'movie_id' => isset( $input['movie_id'] ) ? absint( $input['movie_id'] ) : 0,
        'bg_image' => isset( $input['bg_image'] ) ? absint( $input['bg_image'] ) : 0,
    );
}

// The media picker needs wp.media, and only on our screen.
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( 'settings_page_ams-afa-featured' === $hook ) {
        wp_enqueue_media();
    }
} );

function ams_afa_featured_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $cfg    = ams_afa_featured_config();
    $movies = get_posts( array(
        'post_type'   => 'movie',
        'post_status' => 'publish',
        'numberposts' => -1,
        'orderby'     => 'title',
        'order'       => 'ASC',
    ) );
    $preview = $cfg['bg_image'] ? wp_get_attachment_image_url( $cfg['bg_image'], 'medium' ) : '';
    ?>
    <div class="wrap">
        <h1>Homepage Featured Program</h1>
        <p>
            Drives the wide video banner on the Next.js frontend
            (<code>GET /wp-json/wp/v2/web/featured-program</code>). Changes go live
            within an hour, or immediately if you ping the frontend's
            <code>/api/revalidate?tag=featured-program</code>.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields( 'ams_afa_featured' ); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="ams-afa-movie">Program</label></th>
                    <td>
                        <select id="ams-afa-movie" name="<?php echo esc_attr( AMS_AFA_FEATURED_OPTION ); ?>[movie_id]">
                            <option value="0">— none (banner hidden) —</option>
                            <?php foreach ( $movies as $m ) : ?>
                                <option value="<?php echo esc_attr( $m->ID ); ?>" <?php selected( $cfg['movie_id'], $m->ID ); ?>>
                                    <?php echo esc_html( get_the_title( $m ) . '  (#' . $m->ID . ')' ); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">
                            Title, description, poster, release year and the ▶ trailer are all read
                            from this post — edit them on the movie itself, not here.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Banner art</th>
                    <td>
                        <input type="hidden" id="ams-afa-bg"
                               name="<?php echo esc_attr( AMS_AFA_FEATURED_OPTION ); ?>[bg_image]"
                               value="<?php echo esc_attr( $cfg['bg_image'] ); ?>" />
                        <div id="ams-afa-bg-preview" style="margin-bottom:8px;">
                            <?php if ( $preview ) : ?>
                                <img src="<?php echo esc_url( $preview ); ?>"
                                     style="max-width:420px;height:auto;border:1px solid #ccd0d4;" />
                            <?php endif; ?>
                        </div>
                        <button type="button" class="button" id="ams-afa-bg-pick">Choose image</button>
                        <button type="button" class="button" id="ams-afa-bg-clear">Clear</button>
                        <p class="description">
                            A wide crop — the live homepage uses 2560&times;576
                            (<code>01_VANNA_YEATRA_COVER_4447px X 1000px_OCT 11</code>). The artwork
                            is expected to carry the show's wordmark; the frontend prints only a
                            small title label beside it. Cropping matters more than anything else
                            here: a short banner gets letterboxed, a tall one gets cropped.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <script>
    ( function ( $ ) {
        var frame;
        $( '#ams-afa-bg-pick' ).on( 'click', function ( e ) {
            e.preventDefault();
            if ( frame ) { frame.open(); return; }
            frame = wp.media( {
                title: 'Select banner art',
                button: { text: 'Use this image' },
                library: { type: 'image' },
                multiple: false
            } );
            frame.on( 'select', function () {
                var a = frame.state().get( 'selection' ).first().toJSON();
                var src = ( a.sizes && a.sizes.medium ) ? a.sizes.medium.url : a.url;
                $( '#ams-afa-bg' ).val( a.id );
                $( '#ams-afa-bg-preview' ).html(
                    $( '<img>' ).attr( 'src', src ).attr( 'style', 'max-width:420px;height:auto;border:1px solid #ccd0d4;' )
                );
            } );
            frame.open();
        } );
        $( '#ams-afa-bg-clear' ).on( 'click', function ( e ) {
            e.preventDefault();
            $( '#ams-afa-bg' ).val( '' );
            $( '#ams-afa-bg-preview' ).empty();
        } );
    } )( jQuery );
    </script>
    <?php
}

/* --- GET/POST /wp-json/wp/v2/web/featured-program --- */

/* ─────────────────────────── Roles (dashboard Role Management) ────────────── */

add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'roles', array(
        'methods'             => 'GET',
        'callback'            => 'ams_afa_get_roles',
        // Same gate as the dashboard's Users screen: the role/permission
        // layout is user-administration information. Runs as the X-AMS-Token
        // user via the determine_current_user filter below.
        'permission_callback' => function () {
            return current_user_can( 'list_users' );
        },
    ) );
} );

/**
 * GET /wp-json/wp/v2/web/roles — every role: display name, GRANTED capability
 * list (explicitly-false caps are dropped), and how many users hold the role.
 * Read-only by design — the dashboard screen is a viewer, not a role editor.
 *
 * NOTE: this reports the capabilities STORED on each role. Runtime grants are
 * not simulated — in particular this plugin's own user_has_cap filter (1.7.2)
 * answers _movie(s)/_tv_show(s)/_episode(s) checks dynamically, so a role can
 * hold program powers beyond what its stored list shows.
 */
function ams_afa_get_roles() {
    $counts = count_users();
    $avail  = isset( $counts['avail_roles'] ) ? (array) $counts['avail_roles'] : array();

    $data = array();
    foreach ( wp_roles()->roles as $slug => $role ) {
        $caps = array();
        foreach ( (array) ( isset( $role['capabilities'] ) ? $role['capabilities'] : array() ) as $cap => $granted ) {
            if ( $granted ) {
                $caps[] = (string) $cap;
            }
        }
        sort( $caps );
        $data[] = array(
            'slug'       => (string) $slug,
            'name'       => translate_user_role( $role['name'] ),
            'user_count' => isset( $avail[ $slug ] ) ? (int) $avail[ $slug ] : 0,
            'caps'       => $caps,
        );
    }

    return new WP_REST_Response( array( 'status' => 'OK', 'data' => $data ), 200 );
}

/* ───────────────── Post templates (dashboard article editor) ──────────────── */

add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'post-templates', array(
        'methods'             => 'GET',
        'callback'            => 'ams_afa_get_post_templates',
        // Anyone who may edit a post may see which layouts a post can use.
        // Runs as the X-AMS-Token user via the determine_current_user filter.
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
    ) );
} );

/**
 * GET /wp-json/wp/v2/web/post-templates — the post templates the ACTIVE theme
 * registers, newest-theme-truth rather than a list copied into the frontend.
 *
 * Why this endpoint exists at all: core's posts controller returns a post's
 * `template` (readable AND writable, verified against this install), but the
 * SCHEMA carries no enum of legal values and no route lists them. Gutenberg
 * renders its own Template dropdown from `availableTemplates` in the editor
 * bootstrap, which is PHP-side state the REST API never publishes. Without this,
 * the dashboard editor's only options were hardcoding the theme's filenames or
 * scraping wp-admin — the first goes stale silently the moment the theme adds a
 * template, the second is not a contract.
 *
 * `get_post_templates()` is on WP_Theme and walks the parent chain itself, so a
 * child theme (this site runs vodi-child) gets its own templates AND the
 * parent's, exactly as the block editor would show them. Empty array is a legal
 * answer — a theme need not register any.
 */
function ams_afa_get_post_templates( $request ) {
    $post_type = (string) $request->get_param( 'post_type' );
    if ( '' === $post_type ) {
        $post_type = 'post';
    }
    if ( ! post_type_exists( $post_type ) ) {
        return new WP_REST_Response(
            array( 'status' => 'ERROR', 'message' => 'Unknown post type.' ),
            400
        );
    }

    // Keyed file => display name. Sorted by NAME because that is the order the
    // dropdown reads in; the file order is registration order, which is noise.
    $templates = wp_get_theme()->get_post_templates();
    $for_type  = isset( $templates[ $post_type ] ) ? (array) $templates[ $post_type ] : array();
    asort( $for_type, SORT_NATURAL | SORT_FLAG_CASE );

    $data = array();
    foreach ( $for_type as $file => $name ) {
        $data[] = array(
            'file' => (string) $file,
            'name' => (string) $name,
        );
    }

    return new WP_REST_Response(
        array(
            'status'    => 'OK',
            'post_type' => $post_type,
            'theme'     => (string) wp_get_theme()->get_stylesheet(),
            'data'      => $data,
        ),
        200
    );
}

add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'featured-program', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'ams_afa_get_featured_program',
            'permission_callback' => '__return_true',
        ),
        // Since 1.7.4: lets the dashboard's Settings screen set the banner
        // (same gate as the wp-admin page). Runs as the X-AMS-Token user.
        array(
            'methods'             => 'POST',
            'callback'            => 'ams_afa_set_featured_program',
            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },
        ),
    ) );
} );

/**
 * Body: { movie_id: int, bg_image: int } — 0s allowed (0 movie hides the
 * banner; 0 bg falls back to the movie's own backdrop). A non-zero movie_id
 * must be a published movie; bg_image, when set, must be an attachment. On
 * success the frontend's `featured-program` cache tag is pinged through the
 * same webhook the publish hook uses, so the homepage refreshes immediately.
 */
function ams_afa_set_featured_program( WP_REST_Request $req ) {
    $movie_id = absint( $req->get_param( 'movie_id' ) );
    $bg_image = absint( $req->get_param( 'bg_image' ) );

    if ( $movie_id ) {
        $post = get_post( $movie_id );
        if ( ! $post || 'movie' !== $post->post_type || 'publish' !== $post->post_status ) {
            return new WP_REST_Response( array( 'status' => 'ERROR', 'message' => 'movie_id is not a published movie' ), 400 );
        }
    }
    if ( $bg_image && 'attachment' !== get_post_type( $bg_image ) ) {
        return new WP_REST_Response( array( 'status' => 'ERROR', 'message' => 'bg_image is not a media attachment' ), 400 );
    }

    update_option( AMS_AFA_FEATURED_OPTION, array( 'movie_id' => $movie_id, 'bg_image' => $bg_image ) );
    ams_afa_ping_revalidate( array( 'featured-program' ) );

    return new WP_REST_Response( array( 'status' => 'OK', 'data' => ams_afa_featured_config() ), 200 );
}

function ams_afa_get_featured_program() {
    $cfg  = ams_afa_featured_config();
    $id   = $cfg['movie_id'];
    $post = $id ? get_post( $id ) : null;

    // Nothing configured, or configured against a post that has since been
    // unpublished or deleted. Answer 200 with data:null rather than 404 — the
    // banner is decoration, and the frontend just skips rendering it.
    if ( ! $post || 'movie' !== $post->post_type || 'publish' !== $post->post_status ) {
        return new WP_REST_Response( array( 'status' => 'OK', 'data' => null ), 200 );
    }

    $meta = function ( $key ) use ( $id ) {
        return (string) get_post_meta( $id, $key, true );
    };

    // The slot's own artwork. Only if it has none do we fall back to the movie's
    // Vodi field — see the long note above on why that is a last resort.
    $bg_id         = $cfg['bg_image'] ?: (int) $meta( '_vodi_movie_bg_image' );
    $attachment_id = (int) $meta( '_movie_attachment_id' );

    return new WP_REST_Response( array(
        'status' => 'OK',
        'data'   => array(
            'id'           => $id,
            // The slot's RAW override id (0 = falling back to the movie's own
            // backdrop) — the dashboard's Settings screen needs it to save
            // without silently clearing an existing override. `cover` below
            // stays the resolved URL for the public banner.
            'bg_image_id'  => (int) $cfg['bg_image'],
            'slug'         => $post->post_name,
            'title'        => get_the_title( $id ),
            // Gutenberg HTML, same shape as core's excerpt.rendered.
            'description'  => apply_filters( 'the_excerpt', get_the_excerpt( $id ) ),
            'permalink'    => get_permalink( $id ),
            // PORTRAIT poster (~346x600) — NOT interchangeable with `cover`.
            'poster'       => (string) get_the_post_thumbnail_url( $id, 'full' ),
            'cover'        => $bg_id ? (string) wp_get_attachment_image_url( $bg_id, 'full' ) : '',
            // Unix seconds at MIDNIGHT PHNOM PENH TIME — same trap as episodes:
            // format it in Asia/Phnom_Penh, or you print the wrong day (and, on a
            // New Year's release, the wrong year).
            'release_date' => (int) $meta( '_movie_release_date' ),
            // NOT a duration, despite the meta key. Editors put the broadcast
            // schedule in here ("រៀងរាល់ថ្ងៃអាទិត្យ វេលាម៉ោង ៨:៣០ នាទីព្រឹក").
            // Passed through as-is; never render it as a run time.
            'schedule'     => trim( $meta( '_movie_run_time' ) ),
            // Movies point at their show with `_khi_tv_show_id`; EPISODES use
            // `_tv_show_id`. Different keys, same idea — don't mix them up.
            'tv_show_id'   => (int) $meta( '_khi_tv_show_id' ),
            'video'        => array(
                'choice'     => $meta( '_movie_choice' ),
                'url'        => $meta( '_movie_url_link' ),
                'attachment' => $attachment_id ? (string) wp_get_attachment_url( $attachment_id ) : '',
                // ⚠ GOES STALE. On vanna-yeatra this holds an OLDER Vimeo id than
                // `url` does. WordPress never shows it (`choice` is `movie_url`, so
                // Vodi renders `url` through oEmbed), which is why nobody noticed.
                // Consumers must prefer `url` and only fall back to this when it is
                // empty — the frontend's src/lib/api/video.ts does exactly that.
                'embed'      => $meta( '_movie_embed_content' ),
            ),
        ),
    ), 200 );
}

/* ──────────────── Publish → frontend cache webhook (since 1.7.3) ───────────── */

/**
 * Tells the Next.js frontend the moment content changes, so its ISR caches
 * revalidate on demand instead of on a timer (which lets the frontend run LONG
 * revalidate windows without going stale — the fix for the Vercel ISR-writes
 * budget). Fires on any save where the post is, or was, published (covers
 * publish, edit-while-published, unpublish and trash) for the types the
 * frontend renders, and sends the frontend's cache tags for exactly the pages
 * the change touches:
 *
 *   post              → articles, home, daily-events, article:<slug>,
 *                       category:<slug> (each of its categories)
 *   episode           → episodes, tv-show:<its show id>
 *   movie / tv_show   → program
 *
 * Configure it in Settings → Frontend Cache (webhook URL + shared secret; the
 * secret must equal the frontend's REVALIDATE_SECRET env). Unconfigured = the
 * hook no-ops, so the plugin stays safe to deploy anywhere. The request is
 * fire-and-forget (non-blocking, 2s cap) — publishing never waits on Vercel.
 */
define( 'AMS_AFA_REVALIDATE_OPTION', 'ams_afa_revalidate' );

function ams_afa_revalidate_config() {
    $opt = get_option( AMS_AFA_REVALIDATE_OPTION, array() );
    return array(
        'url'    => isset( $opt['url'] ) ? (string) $opt['url'] : '',
        'secret' => isset( $opt['secret'] ) ? (string) $opt['secret'] : '',
    );
}

/** The frontend cache tags a change to this post invalidates. */
function ams_afa_revalidate_tags( $post ) {
    switch ( $post->post_type ) {
        case 'post':
            $tags = array( 'articles', 'home', 'daily-events', 'article:' . $post->post_name );
            $terms = get_the_terms( $post, 'category' );
            if ( is_array( $terms ) ) {
                foreach ( $terms as $t ) {
                    // RAW slug on purpose — the frontend normalizes both sides
                    // through safeTag(), so over-long Khmer slugs still match.
                    $tags[] = 'category:' . rawurldecode( $t->slug );
                }
            }
            return $tags;
        case 'episode':
            $show = (int) get_post_meta( $post->ID, '_tv_show_id', true );
            return $show ? array( 'episodes', 'tv-show:' . $show ) : array( 'episodes' );
        case 'movie':
        case 'tv_show':
            // The frontend keys program pages by ITS OWN registry slugs, which
            // WordPress cannot know — the blanket tag (≈43 pages) is correct.
            return array( 'program' );
        default:
            return array();
    }
}

/** Fire-and-forget ping to the frontend's /api/revalidate with these tags.
 *  No-ops when the webhook isn't configured. */
function ams_afa_ping_revalidate( $tags ) {
    $cfg = ams_afa_revalidate_config();
    if ( ! $cfg['url'] || ! $cfg['secret'] || ! $tags ) {
        return;
    }
    // Repeated ?tag= params (the route reads getAll("tag")); add_query_arg
    // can't repeat a key, so the query string is built by hand.
    $query = 'secret=' . rawurlencode( $cfg['secret'] );
    foreach ( $tags as $tag ) {
        $query .= '&tag=' . rawurlencode( $tag );
    }
    wp_remote_post( $cfg['url'] . '?' . $query, array(
        'blocking'  => false,
        'timeout'   => 2,
        'sslverify' => true,
    ) );
}

add_action( 'transition_post_status', function ( $new_status, $old_status, $post ) {
    if ( 'publish' !== $new_status && 'publish' !== $old_status ) {
        return; // draft shuffling — nothing public changed
    }
    if ( ! in_array( $post->post_type, array( 'post', 'episode', 'movie', 'tv_show' ), true ) ) {
        return;
    }
    ams_afa_ping_revalidate( ams_afa_revalidate_tags( $post ) );
}, 10, 3 );

/* --- AMS Cache: keep its PURGE, drop only its synchronous crawl (1.13.0) --- */

/**
 * Measured 2026-08-10 with docs/wordpress/ams-write-probe, per callback:
 *
 *   REST create (draft, full stack, 62 plugins)        715 ms
 *   wp_delete_post                                  97,086 ms
 *     of which scm_delete_post (ams-cache)           96,673 ms  = 99.6%
 *
 * ams-cache purges the affected URL and then calls scm_preload_critical_urls(),
 * which re-warms the homepage and archives by FETCHING THEM OVER HTTP —
 * synchronously, inside the write request, every fetch a full WordPress render
 * through the theme and all 62 plugins, competing for the same PHP-FPM pool as
 * the request waiting on it.
 *
 * That is the entire "saving took minutes, the dashboard reported failure, and
 * the row appeared anyway" complaint. The write had finished in under a second;
 * the request was waiting on the crawl. Aborting the fetch never cancelled it.
 *
 * It fires on publish, unpublish, save-of-a-published-post and permanent
 * delete. Draft saves are already free — scm_update_post returns early unless
 * post_status is 'publish', which is why a draft create measures 715 ms.
 *
 * 1.13.0 — WHAT CHANGED, AND WHY THE 1.9.0 SHAPE WAS WRONG.
 *
 * 1.9.0 removed all four callbacks. That killed the crawl, but it also killed
 * the PURGE, so a dashboard publish stopped invalidating the WP page cache
 * entirely. 1.10.0 tried to hand-roll the purge in ams_afa_cache_purge() below
 * — and it never worked: measured 2026-08-18, every target reported
 * cached:false/purged:false while the site was demonstrably serving 22-hour-old
 * cached HTML with ams-cache's own footer on it. The stored key scheme in this
 * fork is not the md5(path) we assumed. Symptom the owner actually saw: an
 * article published from the dashboard was visible to logged-in users (who
 * bypass the cache) and invisible to everyone else until the 24h TTL expired.
 *
 * So the amputation is replaced by a scalpel. The four callbacks stay
 * REGISTERED — ams-cache purges with its own key logic, which cannot mismatch
 * what wrote the entry — and only the expensive half is neutralised, by
 * short-circuiting the site's self-directed HTTP (ams_afa_block_self_http).
 * The purge is a handful of key deletes; the 96s was always the crawl.
 *
 * WHY PURGE-WITHOUT-WARM IS SAFE, not merely faster:
 *   - The warmer fills a cache of WORDPRESS-RENDERED PAGES. The public site is
 *     the Next.js frontend now; the only WP-rendered pages a visitor still sees
 *     are /hero-embed and the Slider Revolution ad frames, and no article write
 *     invalidates either of those.
 *   - The frontend's own cache is refreshed by ams_afa_ping_revalidate() above,
 *     which is non-blocking with a 2s cap and targets a DIFFERENT host, so the
 *     self-HTTP block never touches it. That one stays.
 *   - PURGING is not the cost; warming is. And purge-without-warm is precisely
 *     what a cache is built to survive — the next visitor re-renders once. The
 *     editor's LegacySiteChip already re-warms the affected URLs from the
 *     browser afterwards, off the write path, so in practice few visitors land
 *     on a cold page.
 *
 * SCOPE: only requests carrying our header, so wp-admin keeps every bit of its
 * present behaviour, and no other plugin is touched or disabled.
 *
 * Header PRESENCE is the gate rather than a verified token, deliberately: this
 * changes cache warming, never authorization, and the write itself is still
 * gated by the REST capability check. Verifying would buy a user lookup on every
 * request to decide something that is not a permission.
 *
 * The response carries X-AMS-Cache-Preload so this is verifiable rather than
 * assumed — `skipped=11` is healthy as of 1.21.0 (ams-cache's 4 callbacks plus
 * the vodi-child theme's 7 watch-cache hooks; it was `skipped:4` before). Fewer
 * means a callback was renamed or moved priority, which would otherwise be a
 * SILENT return to minute-long writes, so it is written to the error log as
 * well — except a wholly absent theme feature, which is a legitimate state
 * (the theme was swapped) and simply reports skipped=4.
 */
/**
 * Count of self-directed HTTP requests short-circuited in THIS request.
 * Static rather than a global so nothing else can write to it.
 */
function ams_afa_self_http_blocked( $increment = false ) {
    static $n = 0;
    if ( $increment ) {
        $n++;
    }
    return $n;
}

/**
 * Short-circuit HTTP requests the site makes TO ITSELF.
 *
 * This is the scalpel that replaces the 1.9.0 amputation. ams-cache's purge
 * callbacks are cheap (a few key deletes); the 96s is scm_preload_critical_urls()
 * re-rendering pages over HTTP, synchronously, inside the write. Blocking that
 * traffic leaves the purge intact and makes the crawl instant.
 *
 * Answering with a well-formed 200/empty body rather than a WP_Error is
 * deliberate: the caller is a preloader throwing away the result, and an error
 * could send a retry loop or an admin notice down a path nobody has read.
 *
 * NARROW BY DESIGN — same host only, GET/HEAD only, and only while a dashboard
 * write is being dispatched (see the caller). Outbound calls to anywhere else
 * are untouched, which is what keeps ams_afa_ping_revalidate() (it targets the
 * Next.js origin, a different host) and any third-party webhook working.
 */
function ams_afa_block_self_http( $pre, $args, $url ) {
    // Another filter already answered — don't fight it.
    if ( false !== $pre ) {
        return $pre;
    }

    $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
    $home = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
    if ( '' === $host || '' === $home || $host !== $home ) {
        return $pre;
    }

    $method = isset( $args['method'] ) ? strtoupper( (string) $args['method'] ) : 'GET';
    if ( 'GET' !== $method && 'HEAD' !== $method ) {
        return $pre;
    }

    ams_afa_self_http_blocked( true );

    return array(
        'headers'  => array(),
        'body'     => '',
        'response' => array( 'code' => 200, 'message' => 'OK' ),
        'cookies'  => array(),
        'filename' => null,
    );
}

/**
 * Flush the ENTIRE AMS Cache — since 1.17.0 the FALLBACK, no longer the default.
 *
 * 1.15.0 reached for this because the targeted purges had to GUESS each entry's
 * key and guessed wrong for three versions. That mystery is solved: reading the
 * ams-cache source (docs/wordpress/ams-cache.zip, pulled off the live site)
 * showed the real key is md5( <prefix> . '|' . <normalized path> ) — our
 * md5(path) never matched anything. Better still, the plugin exposes
 * scm_purge_cache_uri(), which purges one page with the correct key, its stats
 * sidecar and its nginx copy, no HTTP. 1.17.0's targeted purge is built on it,
 * so the blunt instrument is no longer needed for correctness.
 *
 * Kept as a lever: `define( 'AMS_AFA_CACHE_FLUSH_ALL', true );` in wp-config.php
 * flushes the whole store instead — the escape hatch if the target list ever
 * turns out to miss a surface in practice, usable with no re-upload. The cost is
 * a fully cold site (5-19s per first visit, measured on this box).
 *
 * Returns whether it actually flushed, so the response can say — never again a
 * cache operation that reports success while doing nothing.
 */
function ams_afa_flush_all_cache() {
    static $done = null;
    if ( null !== $done ) {
        return $done;
    }
    $done = false;

    if ( ! function_exists( 'scm_driver_factory' ) ) {
        return $done;
    }
    if ( 'enable' !== get_option( 'scm_option_caching_status', 'disable' ) ) {
        return $done;
    }

    try {
        $driver = scm_driver_factory( get_option( 'scm_option_driver', 'file' ) );
        if ( is_object( $driver ) && method_exists( $driver, 'clear' ) ) {
            $driver->clear();
            $done = true;
        } else {
            error_log( '[ams-afa] cache flush: driver exposes no clear() method' );
        }
    } catch ( Throwable $e ) {
        error_log( '[ams-afa] cache flush failed: ' . $e->getMessage() );
    }

    return $done;
}

/**
 * The published landing Pages, as purge targets (1.14.0, reshaped 1.17.0).
 *
 * The gap 1.13.0 left, found the moment it was tested: a publish correctly
 * purged the article's own URL, its categories and the homepage — and left
 * /strange/ serving a copy from the previous day. /strange/ is not a category.
 * It is a PAGE (ID 16156) whose template happens to render a "latest news"
 * block, and WordPress records no relationship between a post and a page that
 * merely lists it. Nothing could have known to invalidate it. Fifty-five
 * published pages share that shape — /life-style/, /celebrity/,
 * /entertainment-news/, /movie-and-music/ and the rest. This is structural in
 * ams-cache too: its own purge vocabulary is post URL + taxonomy/date/author
 * archives, nothing else, so a plain wp-admin publish ALSO leaves /strange/
 * stale. Any purge of "the pages an article appears on" must carry this list.
 *
 * 1.14.0 handed each page to scm_update_post() because we could not delete
 * keys ourselves (wrong key scheme, see ams_afa_cache_purge). That worked but
 * dragged scm_update_post's synchronous preload along, needing the self-HTTP
 * block to stay cheap. Now that scm_purge_cache_uri() is known, the pages are
 * simply returned as targets for the same purge loop as everything else.
 */
function ams_afa_landing_page_targets() {
    $page_ids = get_posts( array(
        'post_type'              => 'page',
        'post_status'            => 'publish',
        'numberposts'            => (int) apply_filters( 'ams_afa_landing_page_limit', 100 ),
        'fields'                 => 'ids',
        'no_found_rows'          => true,
        'update_post_meta_cache' => false,
        'update_post_term_cache' => false,
    ) );

    $targets = array();
    foreach ( $page_ids as $pid ) {
        $url = get_permalink( $pid );
        if ( $url ) {
            $targets[] = array(
                'url'   => $url,
                'label' => get_the_title( $pid ),
            );
        }
    }
    return $targets;
}

add_action( 'rest_api_init', function () {
    if ( '' === ams_afa_request_token() ) {
        return;
    }

    $targets = array(
        'save_post'              => 'scm_update_post',
        'transition_post_status' => 'scm_update_post_status',
        'wp_trash_post'          => 'scm_purge_post_before_trash',
        'before_delete_post'     => 'scm_delete_post',
    );

    /* ROLLBACK LEVER. `define( 'AMS_AFA_CACHE_MODE', 'skip' );` in wp-config.php
     * restores the 1.9.0 behaviour instantly, with no plugin re-upload — the
     * escape hatch if blocking self-HTTP turns out not to catch the crawl (a
     * preloader using raw curl instead of the WP HTTP API would slip past
     * pre_http_request, and the symptom would be minute-long saves returning). */
    /* DEFAULT IS 'skip' AGAIN AS OF 1.16.0 — the write path does NO cache work.
     *
     * 1.13.0 made 'purge' the default on the premise (from the 1.9.0 notes) that
     * the 96s was all crawl and purging was cheap. It is not: with the crawl
     * blocked, ams-cache's callbacks still cost ~29s inside the write. The admin
     * client aborts writes at 30s (src/lib/admin/client.ts), so saves began
     * ABORTING while WordPress committed them anyway — the editor reported
     * failure for work that had actually succeeded, which is far worse than a
     * stale cache.
     *
     * The fix is not a bigger timeout. Cache work does not belong in the write
     * at all: it is now done by web/cache/purge, which the editor calls from the
     * browser AFTER the save returns, blocking nothing. */
    $mode = defined( 'AMS_AFA_CACHE_MODE' ) ? AMS_AFA_CACHE_MODE : 'skip';

    if ( 'skip' === $mode ) {
        $removed = array();
        $missing = array();

        foreach ( $targets as $hook => $callback ) {
            // has_action() returns the PRIORITY, which can legitimately be 0 —
            // hence the strict comparison instead of a truthiness test.
            $priority = has_action( $hook, $callback );
            if ( false !== $priority ) {
                remove_action( $hook, $callback, $priority );
                $removed[] = $callback;
            } else {
                $missing[] = $hook . ':' . $callback;
            }
        }

        /* The vodi-child theme's watch-page purge (deployed 2026-08-24) is the
         * FIFTH slow save-path callback, and it lives OUTSIDE ams-cache, which
         * is why `skipped:4` stayed green while episode saves took 139s
         * (probe-measured 2026-08-26: khi_invalidate_watch_cache_for_post =
         * 136,648 ms of it). It loops the show's published episodes/movies and
         * calls scm_purge_cache_uri() PER PAGE — one full stats-tree scan each,
         * the exact 1.17.x mistake web/cache/purge's 1.18.1 batch fixed. So the
         * same treatment as ams-cache: removed for token-carrying writes, with
         * both halves replaced — the cheap per-show version bump is re-hooked
         * right below (milliseconds), and the sibling-page purge moved into
         * web/cache/purge's batched sweep (1.21.0), which the dashboard already
         * calls after every save. wp-admin saves are untouched, as ever.
         *
         * A theme WITHOUT the feature is a legitimate state, not a failure:
         * nothing to remove, nothing hooked, saves already fast — so the
         * function_exists gate skips silently and the header just reads
         * skipped=4. A theme that RENAMED the callbacks would leave them
         * hooked (slow writes return) — that shows as the same skipped=4,
         * which is why the healthy number is documented as 11. */
        $theme_targets = array(
            array( 'save_post',         'khi_invalidate_watch_cache_for_post' ),
            array( 'delete_post',       'khi_invalidate_watch_cache_for_post' ),
            array( 'trashed_post',      'khi_invalidate_watch_cache_for_post' ),
            array( 'untrashed_post',    'khi_invalidate_watch_cache_for_post' ),
            array( 'added_post_meta',   'khi_invalidate_watch_cache_for_meta_change' ),
            array( 'updated_post_meta', 'khi_invalidate_watch_cache_for_meta_change' ),
            array( 'deleted_post_meta', 'khi_invalidate_watch_cache_for_meta_change' ),
        );
        foreach ( $theme_targets as $pair ) {
            list( $hook, $callback ) = $pair;
            if ( ! function_exists( $callback ) ) {
                continue;
            }
            $priority = has_action( $hook, $callback );
            if ( false !== $priority ) {
                remove_action( $hook, $callback, $priority );
                $removed[] = $callback;
            } else {
                $missing[] = $hook . ':' . $callback;
            }
        }

        /* Re-hook the CHEAP half of what was just removed: the theme's watch
         * pages render from their own JSON file cache, keyed on a per-show
         * version counter — without the bump, a dashboard edit would not show
         * on the watch page until that cache's 15-minute TTL lapsed. The bump
         * is one update_post_meta; it was never the slow part. Mirrors the
         * theme's own two callbacks minus khi_purge_watch_pages_for_show(). */
        if ( function_exists( 'khi_bump_show_cache_version' ) ) {
            $bump_for_post = function ( $post_id ) {
                $post = get_post( $post_id );
                if ( ! $post ) {
                    return;
                }
                if ( 'tv_show' === $post->post_type ) {
                    khi_bump_show_cache_version( $post->ID );
                } elseif ( 'episode' === $post->post_type ) {
                    $show_id = absint( get_post_meta( $post->ID, '_tv_show_id', true ) );
                    if ( $show_id ) {
                        khi_bump_show_cache_version( $show_id );
                    }
                } elseif ( 'movie' === $post->post_type ) {
                    $show_id = absint( get_post_meta( $post->ID, '_khi_tv_show_id', true ) );
                    if ( $show_id ) {
                        khi_bump_show_cache_version( $show_id );
                    }
                }
            };
            add_action( 'save_post', $bump_for_post );
            add_action( 'delete_post', $bump_for_post );
            add_action( 'trashed_post', $bump_for_post );
            add_action( 'untrashed_post', $bump_for_post );

            $bump_for_meta = function ( $meta_id, $object_id, $meta_key, $meta_value ) {
                $show_id = 0;
                if ( '_seasons' === $meta_key && 'tv_show' === get_post_type( $object_id ) ) {
                    $show_id = absint( $object_id );
                } elseif ( in_array( $meta_key, array( '_tv_show_id', '_tv_show_season_id' ), true ) && 'episode' === get_post_type( $object_id ) ) {
                    $show_id = '_tv_show_id' === $meta_key
                        ? absint( $meta_value )
                        : absint( get_post_meta( $object_id, '_tv_show_id', true ) );
                }
                if ( $show_id ) {
                    khi_bump_show_cache_version( $show_id );
                }
            };
            add_action( 'added_post_meta', $bump_for_meta, 10, 4 );
            add_action( 'updated_post_meta', $bump_for_meta, 10, 4 );
            add_action( 'deleted_post_meta', $bump_for_meta, 10, 4 );
        }

        if ( $missing ) {
            error_log( '[ams-afa] slow save-path callbacks NOT removed: ' . implode( ', ', $missing ) );
        }

        add_filter( 'rest_post_dispatch', function ( $response ) use ( $removed ) {
            if ( $response instanceof WP_REST_Response ) {
                $response->header( 'X-AMS-Cache-Preload', 'mode=skip skipped=' . count( $removed ) );
            }
            return $response;
        }, 10, 1 );
        return;
    }

    /* 'purge' mode (default, 1.13.0) — leave ams-cache's callbacks REGISTERED so
     * it invalidates with its own key logic, which by construction matches
     * whatever wrote the entry. That is the whole point: our own reimplementation
     * in ams_afa_cache_purge() below could not find a single live entry (measured
     * 2026-08-18 — every page reported cached:false while the site was demonstrably
     * serving 22-hour-old cached HTML), because the key scheme this fork actually
     * uses is not the one we guessed. Asking the plugin to purge itself removes
     * that guess from the design. */
    $present = 0;
    foreach ( $targets as $hook => $callback ) {
        if ( false !== has_action( $hook, $callback ) ) {
            $present++;
        }
    }

    // hooks=0 means publishes silently stop invalidating — the exact failure this
    // change exists to end, so it must never be silent again.
    if ( 0 === $present ) {
        error_log( '[ams-afa] ams-cache purge callbacks absent — dashboard writes will NOT invalidate the WP page cache.' );
    }

    // By reference into both closures below, so the response header reports what
    // the write actually did rather than what it intended.
    $flushed = 0;

    add_filter( 'pre_http_request', 'ams_afa_block_self_http', 10, 3 );

    /* NOTHING CACHE-RELATED IS HOOKED INTO THE WRITE HERE — deliberately, and
     * this is the lesson of 1.13.0-1.15.0. Every version that did cache work
     * inside the save spent the editor's 30s budget on it. The flush now lives
     * in web/cache/purge, called from the browser after the save completes. */

    add_filter( 'rest_post_dispatch', function ( $response ) use ( $present, &$flushed ) {
        if ( $response instanceof WP_REST_Response ) {
            $response->header(
                'X-AMS-Cache-Preload',
                'mode=purge hooks=' . $present
                    . ' blocked=' . ams_afa_self_http_blocked()
                    . ' flushed=' . (int) $flushed
            );
        }
        return $response;
    }, 10, 1 );
}, 5 );

/* ─────────── POST /wp-json/wp/v2/web/cache/purge  (dashboard → AMS Cache) ─── */

add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'cache/purge', array(
        'methods'             => 'POST',
        'callback'            => 'ams_afa_cache_purge',
        // Any dashboard user who can write content may refresh the cache of the
        // pages that content sits on. Runs as the X-AMS-Token user.
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args'                => array(
            'post_id' => array( 'required' => true, 'type' => 'integer' ),
        ),
    ) );
} );

/**
 * The counterpart to the 1.9.0 warmer removal above: that removal keeps
 * dashboard writes fast by skipping AMS Cache's purge+preload callbacks
 * entirely, which also means a dashboard publish never invalidates the WP
 * site's own cached HTML. This endpoint restores the purge HALF only — and
 * never the preload crawl. The editor calls it AFTER a save has returned, so
 * nothing here costs the author's 30s write budget.
 *
 * REBUILT 1.17.0 on scm_purge_cache_uri(), ams-cache's own single-page purge.
 * The 1.10.0-1.15.0 versions deleted driver keys directly and computed
 * md5(<path>) — but the real scheme (read from the ams-cache source, kept in
 * docs/wordpress/ams-cache.zip) is
 *
 *     md5( scm_get_cache_key_prefix() . '|' . <normalized path> )
 *
 * with a site-specific prefix (`scm_<blog_id>_<dir_hash>_`), so every guessed
 * key named an entry that never existed: three versions of purge that matched
 * nothing while the site served day-old HTML, which then justified 1.15.0's
 * whole-store flush. scm_purge_cache_uri() computes the key with the plugin's
 * own functions — it cannot mismatch — and also removes the entry's stats
 * sidecar and nginx static copy, with zero HTTP. Per page: milliseconds.
 *
 * The target list is the article + homepage + its category/tag archives PLUS
 * every published landing Page (see ams_afa_landing_page_targets — pages like
 * /strange/ render "latest news" blocks that no post-to-page relationship
 * records). ~60 key deletes, well under a second, all outside the write.
 *
 * There is deliberately NO re-warm: at ~4-7 publishes/day against ~5k
 * visits/day, the first visitor to each purged page pays one 5-19s render and
 * re-fills the cache — accepted 2026-08-18 in favour of keeping this simple.
 * Purged pages serve CORRECT content immediately; cold is not stale.
 *
 * cached/purged are real per-page answers now (has() with the correct key
 * before and after), because 1.10.0's bare 'OK' let a purge that never worked
 * survive three versions unnoticed. `cached:false` just means nobody had
 * visited that page since its last expiry — a healthy answer, not a failure.
 *
 * Works for TRASHED posts too (1.17.1): the dashboard calls this after a
 * trash, and the original-path reconstruction in ams_afa_cache_purge_targets
 * makes sure the ghost page — a cached article that no longer exists — is
 * among what gets purged.
 */
function ams_afa_cache_purge( WP_REST_Request $req ) {
    $post = get_post( absint( $req->get_param( 'post_id' ) ) );
    if ( ! $post ) {
        return new WP_REST_Response( array( 'status' => 'ERROR', 'message' => 'post_id names no post' ), 200 );
    }

    if ( ! function_exists( 'scm_driver_factory' ) ) {
        return new WP_REST_Response( array( 'status' => 'SKIPPED', 'message' => 'AMS Cache is not active', 'data' => array( 'pages' => array() ) ), 200 );
    }
    if ( 'enable' !== get_option( 'scm_option_caching_status', 'disable' ) ) {
        return new WP_REST_Response( array( 'status' => 'SKIPPED', 'message' => 'AMS Cache page caching is disabled', 'data' => array( 'pages' => array() ) ), 200 );
    }

    // The key function this endpoint is built on. Absent means the ams-cache
    // fork on the server changed shape — say so rather than silently doing
    // nothing (the 1.10.0 lesson, again).
    if ( ! function_exists( 'scm_get_cache_key' ) ) {
        return new WP_REST_Response( array( 'status' => 'ERROR', 'message' => 'ams-cache changed: scm_get_cache_key missing — update ams-frontend-api to match' ), 200 );
    }

    try {
        $driver = scm_driver_factory( get_option( 'scm_option_driver', 'file' ) );
    } catch ( Throwable $e ) {
        return new WP_REST_Response( array( 'status' => 'ERROR', 'message' => 'cache driver unavailable: ' . $e->getMessage() ), 200 );
    }

    /* The escape hatch, OFF by default since 1.17.0: define
     * `AMS_AFA_CACHE_FLUSH_ALL` as true in wp-config.php and this flushes the
     * whole store instead of the targeted purge — for the day the target list
     * turns out to miss a surface in practice. No re-upload needed either way. */
    $flush_all = defined( 'AMS_AFA_CACHE_FLUSH_ALL' ) && (bool) AMS_AFA_CACHE_FLUSH_ALL;
    if ( $flush_all && ams_afa_flush_all_cache() ) {
        return new WP_REST_Response( array(
            'status' => 'OK',
            'data'   => array(
                'driver'  => (string) get_option( 'scm_option_driver', 'file' ),
                'flushed' => true,
                'pages'   => array_map(
                    function ( $t ) {
                        return array( 'url' => $t['url'], 'label' => $t['label'], 'cached' => true, 'purged' => true );
                    },
                    ams_afa_cache_purge_targets( $post )
                ),
            ),
        ), 200 );
    }

    $targets = array_merge( ams_afa_cache_purge_targets( $post ), ams_afa_landing_page_targets() );

    /* BATCHED since 1.18.1. The 1.17.x loop called scm_purge_cache_uri() per
     * target — correct, but that function does a full recursive scan of the
     * stats sidecar tree PER CALL, and ~60 targets meant ~60 scans of the same
     * directory. On this host that sometimes blew past the dashboard's request
     * timeout: the purge completed while the editor was told it failed. Keys
     * still come from scm_get_cache_key() — never guessed (the 1.10.0 lesson) —
     * only the sidecar cleanup is batched: driver keys and nginx copies go
     * first, then ONE walk of the stats tree removes every file matching a
     * purged key or pointing at a purged URI (the same stale-prefix sweep
     * scm_purge_cache_uri does per-URI). Same effects, one scan. */
    $seen  = array();
    $pages = array();
    $keys  = array(); // purged cache keys  → true
    $uris  = array(); // purged normalized paths → true
    $n_cached = 0;
    $n_purged = 0;
    foreach ( $targets as $t ) {
        $path = isset( $t['path'] ) ? $t['path'] : parse_url( $t['url'], PHP_URL_PATH );
        $path = ( is_string( $path ) && '' !== $path ) ? $path : '/';
        $norm = function_exists( 'scm_normalize_cache_uri' ) ? scm_normalize_cache_uri( $path ) : $path;
        if ( isset( $seen[ $norm ] ) ) {
            continue;
        }
        $seen[ $norm ] = true;
        if ( function_exists( 'scm_is_cacheable_document_path' ) && ! scm_is_cacheable_document_path( $norm ) ) {
            continue;
        }

        $cached = false;
        $purged = false;
        try {
            $key    = scm_get_cache_key( $path );
            $cached = (bool) $driver->has( $key );
            $driver->delete( $key );
            $purged = $cached && ! $driver->has( $key );
            $keys[ $key ]  = true;
            $uris[ $norm ] = true;
        } catch ( Throwable $e ) {
            // One bad entry must not abort the rest of the purge.
        }

        if ( function_exists( 'scm_delete_nginx_static_cache' ) ) {
            try {
                scm_delete_nginx_static_cache( $path );
            } catch ( Throwable $e ) {
                // Optional layer; a miss here only leaves an nginx copy to TTL out.
            }
        }

        $n_cached += $cached ? 1 : 0;
        $n_purged += $purged ? 1 : 0;

        $pages[] = array(
            'url'    => $t['url'],
            'label'  => $t['label'],
            'cached' => $cached,
            'purged' => $purged,
            // false = purge-only: the dashboard's chip must NOT re-warm this
            // page from the browser (sibling episode pages, potentially 600+).
            'warm'   => ! isset( $t['warm'] ) || false !== $t['warm'],
        );
    }

    // The single stats-tree sweep for everything purged above.
    if ( $keys && function_exists( 'scm_get_upload_dir' ) ) {
        $stats_root = scm_get_upload_dir() . '/stats';
        if ( is_dir( $stats_root ) ) {
            try {
                foreach ( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $stats_root, FilesystemIterator::SKIP_DOTS ) ) as $file ) {
                    if ( ! $file->isFile() || 'json' !== strtolower( $file->getExtension() ) ) {
                        continue;
                    }
                    $fkey = strstr( $file->getFilename(), '.', true );
                    $hit  = isset( $keys[ $fkey ] );
                    if ( ! $hit && function_exists( 'scm_read_stats_file' ) && function_exists( 'scm_normalize_cache_uri' ) ) {
                        // Entries written under an OLDER key prefix still point
                        // at a purged URI — drop their driver entry too.
                        $stats = scm_read_stats_file( $file->getPathname() );
                        if ( ! empty( $stats['uri'] ) && isset( $uris[ scm_normalize_cache_uri( $stats['uri'] ) ] ) ) {
                            $hit = true;
                            try {
                                $driver->delete( $fkey );
                            } catch ( Throwable $e ) {
                                // The sidecar removal below still proceeds.
                            }
                        }
                    }
                    if ( $hit ) {
                        @unlink( $file->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors -- best-effort cleanup of our own sidecars.
                    }
                }
            } catch ( Throwable $e ) {
                error_log( '[ams-afa] stats sweep failed: ' . $e->getMessage() );
            }
        }
    }

    return new WP_REST_Response( array(
        'status' => 'OK',
        'data'   => array(
            'driver' => (string) get_option( 'scm_option_driver', 'file' ),
            'cached' => $n_cached,
            'purged' => $n_purged,
            'pages'  => $pages,
        ),
    ), 200 );
}

/**
 * The pages a post can appear on BY RELATIONSHIP, deduped by cache path: the
 * homepage, the post's own page, and — for an article — every category it sits
 * in plus that category's ancestors (WP archives list descendants' posts too)
 * and its tag archives; for a program/episode, the post type archive instead.
 * The landing Pages, which appear by TEMPLATE rather than relationship, come
 * from ams_afa_landing_page_targets() and are merged in by the endpoint.
 */
function ams_afa_cache_purge_targets( $post ) {
    $targets = array(
        array( 'url' => home_url( '/' ), 'label' => 'Homepage' ),
    );

    $permalink = get_permalink( $post );
    if ( $permalink && 'trash' === $post->post_status ) {
        /* The dashboard purges AFTER a trash completes — and wp_trash_post()
         * has renamed the slug to "<slug>__trashed" by then, so get_permalink
         * names a path that was never cached. The stale page — now serving a
         * DELETED article — lives at the original path; reconstruct it or this
         * purge misses the one page a trash exists to remove. */
        $permalink = str_replace( '__trashed', '', $permalink );
    }
    if ( $permalink ) {
        $type_obj  = get_post_type_object( $post->post_type );
        $targets[] = array(
            'url'   => $permalink,
            'label' => $type_obj ? $type_obj->labels->singular_name : 'Post',
        );
    }

    if ( 'post' === $post->post_type ) {
        $terms = get_the_terms( $post, 'category' );
        if ( is_array( $terms ) ) {
            $ids = array();
            foreach ( $terms as $term ) {
                $ids[] = (int) $term->term_id;
                foreach ( get_ancestors( $term->term_id, 'category' ) as $anc ) {
                    $ids[] = (int) $anc;
                }
            }
            foreach ( array_unique( $ids ) as $tid ) {
                $link = get_term_link( $tid, 'category' );
                $term = get_term( $tid, 'category' );
                if ( ! is_wp_error( $link ) && $term && ! is_wp_error( $term ) ) {
                    $targets[] = array( 'url' => $link, 'label' => $term->name );
                }
            }
        }

        // Tag archives list the post just as directly as category archives do.
        $tags = get_the_terms( $post, 'post_tag' );
        if ( is_array( $tags ) ) {
            foreach ( $tags as $tag ) {
                $link = get_term_link( $tag );
                if ( ! is_wp_error( $link ) ) {
                    $targets[] = array( 'url' => $link, 'label' => $tag->name );
                }
            }
        }
    } else {
        $archive = get_post_type_archive_link( $post->post_type );
        if ( $archive ) {
            $targets[] = array( 'url' => $archive, 'label' => 'Archive' );
        }

        /* MasVideos programs are a linked FAMILY (1.17.2): a movie fronts its
         * episode-container show (`_khi_tv_show_id`), episodes point at that
         * show (`_tv_show_id`), and the show's WP page lists the episodes. A
         * write to any member goes stale on the others' pages — an added
         * episode is exactly the kind of change the show and movie pages
         * exist to display — so the whole family is purged. At most two
         * extra pages. */
        $show_id = 0;
        if ( 'episode' === $post->post_type ) {
            $show_id = (int) get_post_meta( $post->ID, '_tv_show_id', true );
        } elseif ( 'movie' === $post->post_type ) {
            $show_id = (int) get_post_meta( $post->ID, '_khi_tv_show_id', true );
        } elseif ( 'tv_show' === $post->post_type ) {
            $show_id = $post->ID;
        }

        if ( $show_id > 0 ) {
            if ( 'tv_show' !== $post->post_type ) {
                $show_url = get_permalink( $show_id );
                if ( $show_url ) {
                    // A program trash trashes its container too — same
                    // renamed-slug problem as the post itself above.
                    $targets[] = array( 'url' => str_replace( '__trashed', '', $show_url ), 'label' => get_the_title( $show_id ) );
                }
            }
            if ( 'movie' !== $post->post_type ) {
                // The movie fronting this show — reverse of `_khi_tv_show_id`.
                $movie_ids = get_posts( array(
                    'post_type'     => 'movie',
                    'post_status'   => 'publish',
                    'numberposts'   => 1,
                    'fields'        => 'ids',
                    'no_found_rows' => true,
                    'meta_key'      => '_khi_tv_show_id',
                    'meta_value'    => $show_id,
                ) );
                foreach ( $movie_ids as $mid ) {
                    $movie_url = get_permalink( $mid );
                    if ( $movie_url ) {
                        $targets[] = array( 'url' => $movie_url, 'label' => get_the_title( $mid ) );
                    }
                }
            }

            /* SIBLING watch pages (1.21.0): every episode page renders the
             * show's data and the full sibling list, so a change to any family
             * member leaves every sibling's cached page stale. The theme used
             * to purge these INSIDE the write — scm_purge_cache_uri() per page,
             * one full stats-tree scan each, 136s measured for 18 episodes —
             * which 1.21.0 removes for dashboard writes (see the warmer note).
             * Here they are just more keys in the one batched sweep. Marked
             * warm:false so the dashboard's chip purges them WITHOUT re-warming
             * them from the browser — a show can hold 600+ episodes, and the
             * theme's own loop never warmed them either; the next visitor pays
             * one uncached render, exactly as before. */
            $sibling_ids = get_posts( array(
                'post_type'              => array( 'episode', 'movie' ),
                'post_status'            => 'publish',
                'numberposts'            => -1,
                'fields'                 => 'ids',
                'no_found_rows'          => true,
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
                'meta_query'             => array(
                    'relation' => 'OR',
                    array( 'key' => '_tv_show_id',     'value' => $show_id ),
                    array( 'key' => '_khi_tv_show_id', 'value' => $show_id ),
                ),
            ) );
            foreach ( $sibling_ids as $sid ) {
                if ( (int) $sid === (int) $post->ID ) {
                    continue; // the post's own page is already a warm target above
                }
                $sib_url = get_permalink( $sid );
                if ( $sib_url ) {
                    $targets[] = array( 'url' => $sib_url, 'label' => get_the_title( $sid ), 'warm' => false );
                }
            }
        }
    }

    $seen = array();
    $out  = array();
    foreach ( $targets as $t ) {
        $path = parse_url( $t['url'], PHP_URL_PATH );
        $path = ( is_string( $path ) && '' !== $path ) ? $path : '/';
        if ( isset( $seen[ $path ] ) ) {
            continue;
        }
        $seen[ $path ] = true;
        $t['path']     = $path;
        $out[]         = $t;
    }
    return $out;
}

/* --- Settings screen (Settings → Frontend Cache) --- */

add_action( 'admin_menu', function () {
    add_options_page(
        'Frontend Cache Webhook',
        'Frontend Cache',
        'manage_options',
        'ams-afa-revalidate',
        'ams_afa_revalidate_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'ams_afa_revalidate', AMS_AFA_REVALIDATE_OPTION, array(
        'type'              => 'array',
        'sanitize_callback' => 'ams_afa_sanitize_revalidate',
        'default'           => array(),
    ) );
} );

function ams_afa_sanitize_revalidate( $input ) {
    return array(
        'url'    => isset( $input['url'] ) ? esc_url_raw( trim( (string) $input['url'] ) ) : '',
        'secret' => isset( $input['secret'] ) ? trim( (string) $input['secret'] ) : '',
    );
}

function ams_afa_revalidate_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    $cfg = ams_afa_revalidate_config();
    ?>
    <div class="wrap">
        <h1>Frontend Cache Webhook</h1>
        <p>
            When a post, episode or program is published (or updated/unpublished), the
            plugin pings the Next.js frontend so the affected pages refresh immediately.
            Leave the URL empty to disable.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields( 'ams_afa_revalidate' ); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="ams-afa-reval-url">Webhook URL</label></th>
                    <td>
                        <input type="url" id="ams-afa-reval-url" class="regular-text" style="width:480px"
                               name="<?php echo esc_attr( AMS_AFA_REVALIDATE_OPTION ); ?>[url]"
                               value="<?php echo esc_attr( $cfg['url'] ); ?>"
                               placeholder="https://ams-infotainment-frontend.vercel.app/api/revalidate" />
                        <p class="description">The frontend's <code>/api/revalidate</code> route.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="ams-afa-reval-secret">Shared secret</label></th>
                    <td>
                        <input type="password" id="ams-afa-reval-secret" class="regular-text" autocomplete="off"
                               name="<?php echo esc_attr( AMS_AFA_REVALIDATE_OPTION ); ?>[secret]"
                               value="<?php echo esc_attr( $cfg['secret'] ); ?>" />
                        <p class="description">
                            Must equal the frontend's <code>REVALIDATE_SECRET</code> environment
                            variable (Dokploy → the app → Environment).
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

/* ─────────── Program custom meta → REST  (movie / tv_show / episode) ───────── */

/**
 * Expose the CURATED set of program meta the dashboard editor needs.
 *
 * These keys hold a program's real data but start with `_`, so WordPress treats
 * them as protected and core REST won't show or accept them — `wp/v2/movie/<id>`
 * returns `meta: []`. register_post_meta with show_in_rest lifts that, and the
 * auth_callback (edit-capability on the post) is what makes a PROTECTED key
 * writable over REST rather than read-only.
 *
 * Scope is deliberately the trimmed editor set only (see the frontend's Program
 * editor): title/description/poster ride on core fields and are NOT here; the
 * `_seasons` repeater, trailer, buy-ticket and IMDb/TMDb fields are intentionally
 * left hidden. Keys mirror exactly what this plugin's own web/program and
 * web/episode endpoints already read, so nothing new is invented.
 *
 * NOTE: MasVideos never registered these for REST (that's why meta was empty), so
 * this is the first and only registration — no conflict. If a future theme update
 * starts registering one of them differently, WordPress will warn; adjust here.
 */
function ams_afa_register_program_meta() {
    // Protected meta is writable over REST only if an auth_callback allows it.
    // edit_post maps to the post type's edit capability (edit_movies, …).
    $auth = function ( $allowed, $meta_key, $post_id ) {
        return current_user_can( 'edit_post', $post_id );
    };
    $reg = function ( $post_type, $key, $type ) use ( $auth ) {
        register_post_meta( $post_type, $key, array(
            'single'        => true,
            'type'          => $type,
            'show_in_rest'  => true,
            'auth_callback' => $auth,
        ) );
    };

    // movie — most programs are this type
    $reg( 'movie', '_movie_choice',        'string' );  // video source: movie_url | movie_file | movie_embed
    $reg( 'movie', '_movie_url_link',      'string' );  // Vimeo/YouTube/MP4 URL (prefer over embed — see landmine)
    $reg( 'movie', '_movie_embed_content', 'string' );
    $reg( 'movie', '_movie_attachment_id', 'integer' ); // uploaded-file source
    $reg( 'movie', '_movie_release_date',  'integer' ); // Unix seconds, midnight Asia/Phnom_Penh
    $reg( 'movie', '_movie_run_time',      'string' );  // BROADCAST SCHEDULE text, not a duration
    $reg( 'movie', '_vodi_movie_bg_image', 'integer' ); // backdrop attachment id
    $reg( 'movie', '_khi_tv_show_id',      'integer' ); // links a movie-program to its show

    // tv_show — the one program (vanna-yeatra) that is a show, not a movie
    $reg( 'tv_show', '_tv_show_release_date',  'integer' );
    $reg( 'tv_show', '_tv_show_run_time',      'string' );
    $reg( 'tv_show', '_vodi_tv_show_bg_image', 'integer' );

    // episode — its own video + numbering + parent-show links
    $reg( 'episode', '_episode_number',        'string' );  // single source of truth for ordering
    $reg( 'episode', '_episode_choice',        'string' );
    $reg( 'episode', '_episode_url_link',      'string' );
    $reg( 'episode', '_episode_embed_content', 'string' );
    $reg( 'episode', '_episode_attachment_id', 'integer' );
    $reg( 'episode', '_episode_release_date',  'integer' );
    $reg( 'episode', '_episode_run_time',      'string' );
    $reg( 'episode', '_tv_show_id',            'integer' ); // parent show
    $reg( 'episode', '_tv_show_season_id',     'integer' ); // index into _seasons (editors leave it wrong — hint only)
}
add_action( 'init', 'ams_afa_register_program_meta' );

/* ─────────────── Menu-item ICON meta → REST  (nav_menu_item) ──────────────── */

/**
 * Make the program-icon strip's icons WRITABLE over core REST (1.7.6).
 *
 * The icons on WordPress's "AMS Infotainment Third Menu" are added by a
 * menu-image plugin that never registered its meta for REST, so
 * `/wp/v2/menu-items/<id>` answered `meta: {}` and refused any write — the
 * dashboard's Menus screen could show an icon but not change one.
 *
 * WHERE THE ICON ACTUALLY LIVES, measured on live 2026-08-06 (do not guess
 * this — the obvious-looking key is a decoy): the plugin stores it in
 * **`_thumbnail_id`**, i.e. as the menu item's FEATURED IMAGE, a core key
 * outside the `_menu_item_*` namespace entirely. `_menu_item_icon` also exists
 * on every row and is always EMPTY — it is the icon-CLASS field.
 *
 * WHY edit_theme_options RATHER THAN edit_post: menus are a theme surface in
 * core (which is why /wp/v2/menus and /wp/v2/menu-items both 401 anonymously),
 * and a nav_menu_item is a post nobody "owns" in the editorial sense. This is
 * the same capability core itself requires to reach these routes at all, so it
 * grants nothing that the endpoint did not already gate on.
 *
 * SCOPE: registered against `nav_menu_item` ONLY. `_thumbnail_id` is the core
 * featured-image key — registering it unscoped would expose and open the
 * featured image of every post type on the site.
 *
 * The three companion keys are registered because an icon set on a NEWLY
 * created item needs them to render: `_menu_item_image_size` picks the
 * rendition (the public strip reads exactly this), while `_menu_item_image_type`
 * and `_menu_item_image_title_position` are what make the WordPress theme draw
 * the image rather than the label. Their values are not invented — they are
 * the ones every existing row already carries ('image' / 'hide').
 *
 * No conflict to worry about: the OPTIONS schema for menu-items showed
 * `meta.properties` EMPTY before this, so nothing else registers these keys.
 * If the menu-image plugin ever starts registering one, WordPress will warn.
 */
function ams_afa_register_menu_icon_meta() {
    $auth = function () {
        return current_user_can( 'edit_theme_options' );
    };

    // An icon must be a real attachment. A bare int would happily store a POST
    // id and render a broken image — the same confusion the fast path's
    // pub-menu avoids with an attachment JOIN. 0 clears the icon.
    register_post_meta( 'nav_menu_item', '_thumbnail_id', array(
        'single'            => true,
        'type'              => 'integer',
        'show_in_rest'      => true,
        'auth_callback'     => $auth,
        'sanitize_callback' => function ( $value ) {
            $id = absint( $value );
            return ( $id > 0 && 'attachment' === get_post_type( $id ) ) ? $id : 0;
        },
    ) );

    // Only a size WordPress actually knows, or 'full'. An unknown name would
    // silently fall back to the original — which on this menu means a
    // 2251x2250 JPEG in a 36px slot.
    register_post_meta( 'nav_menu_item', '_menu_item_image_size', array(
        'single'            => true,
        'type'              => 'string',
        'show_in_rest'      => true,
        'auth_callback'     => $auth,
        'sanitize_callback' => function ( $value ) {
            $value   = sanitize_text_field( (string) $value );
            $allowed = array_merge( array( 'full' ), get_intermediate_image_sizes() );
            return in_array( $value, $allowed, true ) ? $value : 'full';
        },
    ) );

    foreach ( array( '_menu_item_image_type', '_menu_item_image_title_position' ) as $key ) {
        register_post_meta( 'nav_menu_item', $key, array(
            'single'            => true,
            'type'              => 'string',
            'show_in_rest'      => true,
            'auth_callback'     => $auth,
            'sanitize_callback' => 'sanitize_text_field',
        ) );
    }
}
add_action( 'init', 'ams_afa_register_menu_icon_meta' );

/* ───────────────────────────── Profile avatar ─────────────────────────────── */

/**
 * `ams_avatar` — the dashboard profile picture, as a REST field on `user`
 * (since 1.20.0), so it rides the same GET/POST wp/v2/users/me the profile
 * screen already uses.
 *
 * Core has no uploadable avatar: `avatar_urls` is an md5-of-email Gravatar and
 * no account on this site has one set. So the picture is an ATTACHMENT the
 * dashboard uploads through wp/v2/media, referenced from two user-meta keys:
 *
 *   ams_avatar_id    the attachment id — the durable reference
 *   ams_avatar_url   the rendition URL, resolved HERE at write time
 *
 * The URL is STORED rather than derived on read because the fast path serves
 * the profile under SHORTINIT, where the media-offload filters that produce
 * the real s3.ams.com.kh file URL never run. Resolving once in full-WordPress
 * context and storing the result gives every reader — core REST and fast.php
 * alike — the same plain string, no filter machinery required. The trade-off
 * (a regenerated/moved rendition would leave the stored URL stale) heals on
 * the next avatar save, and avatars change far more often than media moves.
 *
 * Write contract (POST wp/v2/users/me): `ams_avatar: { id: <attachment id> }`
 * sets it, `{ id: 0 }` clears it. No extra capability gate: the users
 * controller has already verified the caller may edit the target user before
 * update_callback runs (own profile always passes; other people's need
 * edit_users, exactly as core intends).
 */
function ams_afa_user_avatar_read( $user_arr ) {
    $uid = (int) $user_arr['id'];
    $id  = (int) get_user_meta( $uid, 'ams_avatar_id', true );
    $url = (string) get_user_meta( $uid, 'ams_avatar_url', true );
    return ( $id > 0 && '' !== $url ) ? array( 'id' => $id, 'url' => $url ) : null;
}

function ams_afa_user_avatar_write( $value, $user ) {
    $id = absint( is_array( $value ) ? ( isset( $value['id'] ) ? $value['id'] : 0 ) : $value );

    if ( 0 === $id ) {
        delete_user_meta( $user->ID, 'ams_avatar_id' );
        delete_user_meta( $user->ID, 'ams_avatar_url' );
        return true;
    }

    // A real image attachment or nothing — a bare post id would store fine and
    // render a broken <img> forever (same rule as the menu-icon sanitizer).
    if ( 'attachment' !== get_post_type( $id ) || ! wp_attachment_is_image( $id ) ) {
        return new WP_Error( 'ams_afa_bad_avatar', 'ams_avatar.id must be an image attachment.', array( 'status' => 400 ) );
    }

    // 150px cropped square; an original too small to have renditions falls
    // back to the file itself.
    $src = wp_get_attachment_image_src( $id, 'thumbnail' );
    if ( ! $src ) {
        $src = wp_get_attachment_image_src( $id, 'full' );
    }
    if ( ! $src || empty( $src[0] ) ) {
        return new WP_Error( 'ams_afa_bad_avatar', 'The attachment has no resolvable image URL.', array( 'status' => 400 ) );
    }

    update_user_meta( $user->ID, 'ams_avatar_id', $id );
    update_user_meta( $user->ID, 'ams_avatar_url', esc_url_raw( $src[0] ) );
    return true;
}

add_action( 'rest_api_init', function () {
    register_rest_field( 'user', 'ams_avatar', array(
        'get_callback'    => 'ams_afa_user_avatar_read',
        'update_callback' => 'ams_afa_user_avatar_write',
        'schema'          => array(
            'description' => 'Dashboard profile picture: { id, url } or null. Write { id } to set, { id: 0 } to clear.',
            'type'        => array( 'object', 'null' ),
            'context'     => array( 'view', 'edit', 'embed' ),
        ),
    ) );
} );

/**
 * Show the dashboard picture inside WordPress too (1.20.1).
 *
 * Everything in wp-admin — the Users list, the profile screen, comment lists —
 * draws avatars through get_avatar_data(), and `pre_get_avatar_data` lets a
 * plugin answer with its own URL before Gravatar is consulted. Without this the
 * picture set on /admin/profile was invisible in wp-admin, which read as "it
 * didn't save". Accounts with no ams_avatar fall through to Gravatar exactly as
 * before.
 *
 * Side effect, deliberate: REST `avatar_urls` now carries the same URL at every
 * size (the stored rendition is the 150px thumbnail — fine for chips). The
 * public site renders no avatars, so nothing public changes.
 */
function ams_afa_avatar_user_id( $id_or_email ) {
    if ( is_numeric( $id_or_email ) ) {
        return (int) $id_or_email;
    }
    if ( $id_or_email instanceof WP_User ) {
        return (int) $id_or_email->ID;
    }
    if ( $id_or_email instanceof WP_Post ) {
        return (int) $id_or_email->post_author;
    }
    if ( $id_or_email instanceof WP_Comment ) {
        if ( (int) $id_or_email->user_id > 0 ) {
            return (int) $id_or_email->user_id;
        }
        $id_or_email = (string) $id_or_email->comment_author_email;
    }
    if ( is_string( $id_or_email ) && is_email( $id_or_email ) ) {
        $user = get_user_by( 'email', $id_or_email );
        return $user ? (int) $user->ID : 0;
    }
    return 0;
}

function ams_afa_pre_get_avatar_data( $args, $id_or_email ) {
    $uid = ams_afa_avatar_user_id( $id_or_email );
    if ( $uid <= 0 ) {
        return $args;
    }
    $url = (string) get_user_meta( $uid, 'ams_avatar_url', true );
    if ( '' === $url || (int) get_user_meta( $uid, 'ams_avatar_id', true ) <= 0 ) {
        return $args;
    }
    $args['url']          = $url;
    $args['found_avatar'] = true;
    return $args;
}
add_filter( 'pre_get_avatar_data', 'ams_afa_pre_get_avatar_data', 10, 2 );

/**
 * Program capabilities, answered at runtime via `user_has_cap` (since 1.7.2).
 *
 * MasVideos registers movie / tv_show / episode with their own capability set
 * (edit_movies, edit_others_movies, publish_tv_shows, …; `map_meta_cap` turns a
 * per-post check like `edit_post` on a published program someone else owns into
 * edit_published_movies + edit_others_movies), but this site's roles were never
 * granted all of it, so REST 403'd `?context=edit` on real programs. 1.7.1's
 * add_cap reconcile onto the Administrator role proved ineffective; answering
 * the capability check itself cannot miss, no matter how the caps are spelled
 * or mapped, and writes nothing to stored role state:
 *
 *   - Administrators pass EVERY program cap (anything ending in _movie(s) /
 *     _tv_show(s) / _episode(s), singular or plural).
 *   - Other roles pass the per-post variants (edit_others_*, edit_published_*,
 *     edit_private_*, delete_others_* …, read_private_*) of a BASE cap their
 *     role already stores. This site's Author role deliberately carries
 *     edit_movies / edit_tv_shows / edit_episodes (see /web/login caps), so
 *     program editors can open and save ANY program — but they do NOT inherit
 *     delete variants unless the role also stores delete_movies etc., and roles
 *     with no program caps gain nothing at all.
 */
function ams_afa_program_caps_filter( $allcaps, $caps, $args, $user ) {
    foreach ( $caps as $cap ) {
        if ( ! empty( $allcaps[ $cap ] ) ) {
            continue; // already allowed
        }
        if ( ! preg_match( '/_(movies?|tv_shows?|episodes?)$/', $cap ) ) {
            continue; // not a program cap
        }
        if ( in_array( 'administrator', (array) $user->roles, true ) ) {
            $allcaps[ $cap ] = true;
            continue;
        }
        // Derive the per-post variant from its base cap:
        //   edit_others_movies / edit_published_movies / edit_private_movies → edit_movies
        //   delete_others_movies / delete_published_movies / …              → delete_movies
        //   read_private_movies                                             → edit_movies
        if ( preg_match( '/^(edit|delete)_(?:others|published|private)_(movies?|tv_shows?|episodes?)$/', $cap, $m ) ) {
            $base = $m[1] . '_' . $m[2];
        } elseif ( preg_match( '/^read_private_(movies?|tv_shows?|episodes?)$/', $cap, $m ) ) {
            $base = 'edit_' . $m[1];
        } else {
            continue;
        }
        if ( ! empty( $allcaps[ $base ] ) ) {
            $allcaps[ $cap ] = true;
        }
    }
    return $allcaps;
}
add_filter( 'user_has_cap', 'ams_afa_program_caps_filter', 10, 4 );

// On deactivation, hand back exactly the caps 1.7.1's add_cap reconcile recorded
// as added, and drop its marker — so roles return to exactly how MasVideos left
// them (the runtime filter above needs no stored state at all).
register_deactivation_hook( __FILE__, function () {
    $added = get_option( 'ams_afa_program_caps_added', array() );
    $role  = get_role( 'administrator' );
    if ( $role && is_array( $added ) ) {
        foreach ( $added as $cap ) {
            $role->remove_cap( $cap );
        }
    }
    delete_option( 'ams_afa_program_caps_added' );
} );

/* ──────────── Per-user login token  (POST /web/login, GET /web/me) ─────────── */

/**
 * Lets dashboard staff sign in with the real WordPress username + password they
 * already use, without cookies, a JWT plugin, or any wp-config / .htaccess edit.
 *
 * HOW IT FITS TOGETHER
 *   1. Next.js server  POSTs { username, password } to  /web/login.
 *   2. We run it through wp_authenticate() — so every existing login protection
 *      (security plugins, blocked/spam users, the wp_login_failed hooks) still
 *      applies — and on success mint a short-lived signed token.
 *   3. Next.js keeps that token in an httpOnly cookie the browser can't read, and
 *      replays it on each write in an  X-AMS-Token:  header.
 *   4. The determine_current_user filter below verifies the token and sets the
 *      current user, so the write executes AS that person and WordPress enforces
 *      their capabilities exactly as it would in wp-admin.
 *
 * THE TOKEN  ( body ".", signature ), both base64url:
 *   body      = base64url( {"uid":<id>,"exp":<unix>,"v":1} )   — readable, signed
 *   signature = HMAC-SHA256( body, key )
 *   key       = HMAC-SHA256( "<id>|<4 chars of user_pass>", wp_salt('auth') )
 * Signing with wp_salt('auth') reuses a secret WordPress already has (no new
 * config). Folding in four characters of the stored password hash means a
 * password change rotates the key and instantly invalidates that user's tokens —
 * the same trick core uses for its own auth cookies. There is no server-side
 * token store, so "log out everywhere" == change password; ordinary logout is
 * just the Next.js server dropping the cookie.
 *
 * WHY A CUSTOM  X-AMS-Token  HEADER (not Authorization: Bearer): Apache/mod_php
 * commonly strips the Authorization header before PHP sees it. A custom header
 * sidesteps that entirely and never collides with core's own auth handling.
 *
 * These are the only writable defaults; edit a `define()` (or add one to
 * wp-config before the plugin loads) to change the TTL, throttle, etc.
 */
if ( ! defined( 'AMS_AFA_LOGIN_TTL' ) ) {
    define( 'AMS_AFA_LOGIN_TTL', 12 * HOUR_IN_SECONDS );      // token lifetime
}
if ( ! defined( 'AMS_AFA_LOGIN_HEADER' ) ) {
    define( 'AMS_AFA_LOGIN_HEADER', 'X-AMS-Token' );          // header carrying it
}
if ( ! defined( 'AMS_AFA_LOGIN_MAX_FAILS' ) ) {
    define( 'AMS_AFA_LOGIN_MAX_FAILS', 5 );                   // fails before lockout
}
if ( ! defined( 'AMS_AFA_LOGIN_LOCKOUT' ) ) {
    define( 'AMS_AFA_LOGIN_LOCKOUT', 15 * MINUTE_IN_SECONDS ); // lockout window
}
if ( ! defined( 'AMS_AFA_LOGIN_REQUIRE_SSL' ) ) {
    define( 'AMS_AFA_LOGIN_REQUIRE_SSL', true );               // refuse creds over http
}

/* --- token helpers --- */

function ams_afa_b64url_encode( $bin ) {
    return rtrim( strtr( base64_encode( $bin ), '+/', '-_' ), '=' );
}

function ams_afa_b64url_decode( $str ) {
    $b64 = strtr( (string) $str, '-_', '+/' );
    $pad = strlen( $b64 ) % 4;
    if ( $pad ) {
        $b64 .= str_repeat( '=', 4 - $pad );
    }
    return base64_decode( $b64, true );
}

/** Per-user signing key: wp_salt('auth') + a fragment of the password hash. */
function ams_afa_login_key( $user ) {
    $pass_frag = substr( (string) $user->user_pass, 8, 4 );
    return hash_hmac( 'sha256', $user->ID . '|' . $pass_frag, wp_salt( 'auth' ) );
}

function ams_afa_login_sign( $user, $exp ) {
    $body = ams_afa_b64url_encode( wp_json_encode( array(
        'uid' => (int) $user->ID,
        'exp' => (int) $exp,
        'v'   => 1,
    ) ) );
    $sig = hash_hmac( 'sha256', $body, ams_afa_login_key( $user ), true );
    return $body . '.' . ams_afa_b64url_encode( $sig );
}

/** Returns the user id a token authenticates, or 0 if it is invalid/expired. */
function ams_afa_login_verify( $token ) {
    if ( ! is_string( $token ) || substr_count( $token, '.' ) !== 1 ) {
        return 0;
    }
    list( $body, $sig_b64 ) = explode( '.', $token, 2 );

    $json = ams_afa_b64url_decode( $body );
    if ( false === $json ) {
        return 0;
    }
    $payload = json_decode( $json, true );
    if ( ! is_array( $payload ) || empty( $payload['uid'] ) || empty( $payload['exp'] ) ) {
        return 0;
    }
    if ( (int) $payload['exp'] < time() ) {
        return 0; // expired
    }

    $user = get_user_by( 'id', (int) $payload['uid'] );
    if ( ! $user ) {
        return 0;
    }

    $expected = hash_hmac( 'sha256', $body, ams_afa_login_key( $user ), true );
    $given    = ams_afa_b64url_decode( $sig_b64 );
    if ( false === $given || ! hash_equals( $expected, $given ) ) {
        return 0; // bad signature (or password since changed → key rotated)
    }
    return (int) $user->ID;
}

/** The header value, read from $_SERVER (works this early, outside REST too). */
function ams_afa_request_token() {
    $key = 'HTTP_' . strtoupper( str_replace( '-', '_', AMS_AFA_LOGIN_HEADER ) );
    return isset( $_SERVER[ $key ] ) ? trim( (string) wp_unslash( $_SERVER[ $key ] ) ) : '';
}

/* --- authenticate REST requests carrying the header --- */

/**
 * Priority 20 (same slot core uses for Application Passwords): after normal
 * cookie auth (10), so a genuine wp-admin session is never overridden. We touch
 * $user_id ONLY when nothing else resolved it AND our header is present — every
 * other request passes through untouched.
 */
add_filter( 'determine_current_user', function ( $user_id ) {
    if ( $user_id ) {
        return $user_id;
    }
    $token = ams_afa_request_token();
    if ( '' === $token ) {
        return $user_id;
    }
    $verified = ams_afa_login_verify( $token );
    return $verified ? $verified : $user_id;
}, 20 );

/* --- the { id, name, roles, capabilities } payload --- */

/**
 * The capabilities the dashboard actually gates on — a curated allow-list, not
 * WordPress's full ~60-cap surface. The frontend reads these booleans directly
 * (e.g. capabilities.list_users decides whether the Users nav item renders),
 * which replaces the hardcoded isAdmin in AdminSidebar.tsx. Add a key here the
 * day a screen needs to branch on it; there is no cost to the ones already
 * listed. Roles map (plan §4): Author cannot publish_posts; Contributor can;
 * manage_options is over-granted to Author/Contributor/Editor.
 */
function ams_afa_login_caps() {
    return array(
        // Posts / editorial
        'edit_posts', 'publish_posts', 'edit_published_posts',
        'edit_others_posts', 'delete_posts', 'delete_others_posts',
        'manage_categories',
        // Users
        'list_users', 'edit_users', 'promote_users',
        // Site
        'manage_options', 'upload_files',
        // MasVideos CPTs — programs (movie / tv_show / episode) and videos
        'edit_movies', 'publish_movies',
        'edit_tv_shows', 'publish_tv_shows',
        'edit_videos', 'publish_videos',
        'edit_episodes', 'publish_episodes',
    );
}

function ams_afa_login_user_payload( $user ) {
    $caps = array();
    foreach ( ams_afa_login_caps() as $cap ) {
        $caps[ $cap ] = user_can( $user, $cap );
    }
    return array(
        'id'           => (int) $user->ID,
        'name'         => $user->display_name,
        'username'     => $user->user_login,
        'roles'        => array_values( (array) $user->roles ),
        'capabilities' => $caps,
    );
}

/**
 * Gate: does this account have ANY reason to be in the dashboard? Blocks pure
 * Subscribers / Visitors / Translators (plan §4 "none") from getting a token at
 * all — cleaner than issuing one and showing them an empty shell. Relax by
 * editing the list if a read-only role should be allowed in later.
 */
function ams_afa_login_has_access( $user ) {
    $gate = array(
        'edit_posts', 'upload_files', 'manage_options', 'list_users',
        'edit_movies', 'edit_tv_shows', 'edit_videos', 'edit_episodes',
    );
    foreach ( $gate as $cap ) {
        if ( user_can( $user, $cap ) ) {
            return true;
        }
    }
    return false;
}

/* --- brute-force throttle (per client IP, transient-backed) --- */

function ams_afa_client_ip() {
    // REMOTE_ADDR only — X-Forwarded-For is caller-supplied and spoofable. If
    // this WordPress sits behind a proxy you control, resolve the real IP here.
    return isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

function ams_afa_login_throttle_key() {
    return 'ams_afa_login_fails_' . md5( ams_afa_client_ip() );
}

/** True over HTTPS, including behind an SSL-terminating proxy. */
function ams_afa_login_is_secure() {
    if ( is_ssl() ) {
        return true;
    }
    $proto = isset( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) ? strtolower( (string) $_SERVER['HTTP_X_FORWARDED_PROTO'] ) : '';
    return 'https' === $proto;
}

/* --- routes --- */

add_action( 'rest_api_init', function () {
    register_rest_route( 'wp/v2/web', 'login', array(
        'methods'             => 'POST',
        'callback'            => 'ams_afa_login',
        'permission_callback' => '__return_true',
        'args'                => array(
            'username' => array( 'required' => true, 'type' => 'string' ),
            'password' => array( 'required' => true, 'type' => 'string' ),
        ),
    ) );

    register_rest_route( 'wp/v2/web', 'me', array(
        'methods'             => 'GET',
        'callback'            => 'ams_afa_me',
        'permission_callback' => function () {
            return is_user_logged_in();
        },
    ) );
} );

function ams_afa_login( $request ) {
    if ( AMS_AFA_LOGIN_REQUIRE_SSL && ! ams_afa_login_is_secure() ) {
        return new WP_Error( 'ams_afa_insecure', 'Login requires HTTPS.', array( 'status' => 400 ) );
    }

    // Throttle first — a locked-out IP never reaches wp_authenticate().
    $throttle_key = ams_afa_login_throttle_key();
    $fails        = (int) get_transient( $throttle_key );
    if ( $fails >= AMS_AFA_LOGIN_MAX_FAILS ) {
        $resp = new WP_REST_Response( array(
            'status'  => 'error',
            'code'    => 'too_many_attempts',
            'message' => 'Too many failed attempts. Try again later.',
        ), 429 );
        $resp->header( 'Retry-After', (string) AMS_AFA_LOGIN_LOCKOUT );
        return $resp;
    }

    $username = trim( (string) $request->get_param( 'username' ) );
    $password = (string) $request->get_param( 'password' );
    if ( '' === $username || '' === $password ) {
        return new WP_Error( 'ams_afa_bad_request', 'Username and password are required.', array( 'status' => 400 ) );
    }

    $user = wp_authenticate( $username, $password );

    if ( is_wp_error( $user ) ) {
        // Count the failure; answer with ONE generic message so the response
        // never reveals whether the username exists.
        set_transient( $throttle_key, $fails + 1, AMS_AFA_LOGIN_LOCKOUT );
        return new WP_Error( 'ams_afa_invalid_login', 'Invalid username or password.', array( 'status' => 401 ) );
    }

    if ( ! ams_afa_login_has_access( $user ) ) {
        // Valid credentials, but nothing to do here. Don't count it as a brute-
        // force failure, but don't hand out a token either.
        return new WP_Error( 'ams_afa_no_access', 'This account has no dashboard access.', array( 'status' => 403 ) );
    }

    delete_transient( $throttle_key ); // clean slate on success

    $exp = time() + AMS_AFA_LOGIN_TTL;
    return new WP_REST_Response( array(
        'status'     => 'OK',
        'token'      => ams_afa_login_sign( $user, $exp ),
        'expires_at' => $exp,
        'user'       => ams_afa_login_user_payload( $user ),
    ), 200 );
}

function ams_afa_me() {
    return new WP_REST_Response( array(
        'status' => 'OK',
        'user'   => ams_afa_login_user_payload( wp_get_current_user() ),
    ), 200 );
}

/* ───────────────────── Anonymous REST comments ────────────────────────────── */

/**
 * Let `POST /wp-json/wp/v2/comments` accept anonymous comments.
 *
 * The site already accepts them — the theme's own form posts to
 * wp-comments-post.php with no login — but core REST refuses anonymous
 * creation unless this filter opts in. It changes WHO may use the REST route,
 * not what happens next: required fields, moderation and spam settings from
 * Settings → Discussion apply exactly as they do to the classic form.
 */
add_filter( 'rest_allow_anonymous_comments', '__return_true' );

/* ────────── Slider embeds  (GET /hero-embed, GET /sr-embed) ────────────────── */

/**
 * Resolve a caller-supplied alias to a slider that ACTUALLY EXISTS, or null.
 *
 * This is what lets /sr-embed accept aliases no human whitelisted, without
 * reopening the door the hero whitelist was closing. The rule there was "render
 * any shortcode argument a visitor sends" is unsafe — still true. The answer is
 * not a longer list (article sliders can't be hand-maintained), it is asking
 * Slider Revolution whether the alias names a real slider before rendering it.
 * Anything else 404s and never reaches do_shortcode().
 *
 * Case is PRESERVED, deliberately. sanitize_title() lowercases, and this site
 * has modules whose aliases differ only in case and suffix (INFHB010_01 next to
 * infhb010_01-1) — lowercasing turns one into a near-miss of the other. The
 * shape gate below allows exactly the characters SR puts in an alias.
 *
 * Returns the STORED alias, not the caller's spelling: the column collation is
 * case-insensitive, so the matched row may be spelled differently from the
 * input, and the shortcode wants the real one.
 */
function ams_afa_slider_alias( $raw ) {
    global $wpdb;

    $alias = preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $raw );
    if ( $alias === '' || strlen( $alias ) > 191 ) {
        return null;
    }

    // Slider Revolution deactivated or never installed — nothing to render, and
    // the query below would fatal on a missing table.
    $table = $wpdb->prefix . 'revslider_sliders';
    if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
        return null;
    }

    // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is $wpdb->prefix, not input.
    $found = $wpdb->get_var( $wpdb->prepare( "SELECT alias FROM {$table} WHERE alias = %s LIMIT 1", $alias ) );

    return ( $found === null || $found === '' ) ? null : (string) $found;
}

/**
 * Render ONE slider as a standalone page and exit.
 *
 * The whole reason the frontend can show Slider Revolution at all: wp_head() and
 * wp_footer() are what emit sr7.css, tptools.js, sr7.js, the _tpt bootstrap AND
 * the per-module SR7.JSON config. None of those live in post_content, which is
 * why the same markup pasted into the Next app renders as collapsed inline
 * elements — it has the slider's body and none of its runtime.
 */
function ams_afa_render_embed( $alias ) {
    /* A frame is not a page — strip the site's ad furniture ──────────────────
     *
     * wp_head()/wp_footer() are called below for ONE reason: they emit Slider
     * Revolution's runtime. But EVERY other plugin hooked there fires too, and
     * AMS Ads Manager (ams-msa-popup) hooks both — so the MSA/Damrei popup was
     * booting INSIDE the hero iframe. Sealed in a 100%-wide, overflow:hidden
     * frame it can never reach the page it exists to cover; it just sat on top
     * of the slider, and counted impressions against a surface no visitor could
     * act on. Same for every article slider, since /sr-embed shares this
     * renderer.
     *
     * Removed by hook here rather than by teaching the ads plugin what an embed
     * is: this route is what decides a frame carries a slider and nothing else,
     * and remove_action() against an absent plugin is a harmless no-op — so
     * this holds whether or not the ads plugin is installed, with no coupling
     * in the other direction.
     *
     * Priorities must match the add_action() calls exactly (1 and 20) or the
     * removal silently does nothing.
     *
     * Deliberately surgical: dropping every wp_head hook would take Slider
     * Revolution's own runtime with it and leave an empty frame.
     */
    remove_action( 'wp_head', 'ams_msa_popup_head', 1 );
    remove_action( 'wp_footer', 'ams_msa_popup_footer', 20 );

    // Let the whitelisted frontend origins iframe this page (override any
    // X-Frame-Options a security plugin may have set).
    //
    // Headers are ALWAYS sent fresh, never served from the cache below — so the
    // frame-ancestors list takes effect the moment the plugin updates, even
    // while cached HTML is still being served.
    header_remove( 'X-Frame-Options' );
    header( "Content-Security-Policy: frame-ancestors 'self' " . implode( ' ', ams_afa_embed_origins() ) );
    status_header( 200 );

    /* ────────── Cache the rendered frame (1.12.0) ───────────────────────────
     *
     * Measured before this: TTFB 3.73s on /hero-embed against 0.08s on the
     * cached WP homepage — 44× slower, on the same box. Almost none of that is
     * the slider or the network (transfer is ~250ms); it is WordPress booting
     * the full plugin/theme stack to answer, on EVERY view, because this route
     * sends no-store and AMS Cache therefore skips it.
     *
     * WHY NOT JUST LET AMS CACHE HAVE IT: Cache Master keys entries on
     * md5(<URL path>) with NO query string (Session 34). Both embed routes vary
     * only by ?alias=, so every alias would collide on ONE entry — landing
     * pages serving each other's heroes, and every article slider serving
     * whichever module was rendered first. That is a worse bug than slowness,
     * so we cache per-alias ourselves and keep the page cache off the route via
     * DONOTCACHEPAGE (respected by AMS Cache's upstream and every common fork).
     *
     * `private` on the browser header is the same defence one layer out: it
     * lets the visitor's own browser reuse the frame, while forbidding any
     * shared proxy from storing a document whose URL-path alone does not
     * identify it.
     *
     * The key carries the plugin version, so an upgrade invalidates every entry
     * — which is what keeps AMS_PARENTS (baked into this HTML, unlike the
     * header above) from going stale across a deploy.
     *
     * Logged-in users bypass entirely: wp_head() emits the admin bar and
     * user-specific nonces for them, none of which belongs in a shared entry.
     */
    if ( ! defined( 'DONOTCACHEPAGE' ) ) {
        define( 'DONOTCACHEPAGE', true );
    }

    $cacheable = ! is_user_logged_in();
    $cache_key = 'ams_afa_embed_' . md5( $alias . '|' . AMS_AFA_VERSION );

    if ( $cacheable ) {
        $cached = get_transient( $cache_key );
        if ( is_string( $cached ) && $cached !== '' ) {
            header( 'Cache-Control: private, max-age=' . AMS_AFA_EMBED_BROWSER_TTL );
            header( 'X-AMS-Embed-Cache: HIT' );
            echo $cached; // phpcs:ignore WordPress.Security.EscapeOutput -- stored output of this same renderer.
            exit;
        }
    }

    ob_start();

    ?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- A frame is not a page. Keep these out of the index so they never compete
         with the article or landing page that embeds them. -->
    <meta name="robots" content="noindex,nofollow">
    <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}</style>
    <?php wp_head(); ?>
</head>
<body <?php body_class( 'ams-hero-embed' ); ?>>
    <?php echo do_shortcode( '[rev_slider alias="' . esc_attr( $alias ) . '"]' ); ?>
    <?php wp_footer(); ?>
    <script>
    (function () {
        /**
         * The slider's height — measured from the MODULE, never the document.
         *
         * Slider Revolution injects <sr7-fonttest-wrap>, a 1000px-tall scratch
         * element it uses for font metrics. It is absolutely positioned, so it
         * never touches body.scrollHeight — but it DOES inflate
         * documentElement.scrollHeight, and the old Math.max() of the two took
         * the inflated number every time the real slider was shorter than
         * ~1300px. Measured live: the homepage hero is 650px and was reporting
         * 1322px, i.e. ~670px of dead space under the hero; a 150px article
         * banner reported 1322px too.
         *
         * offsetTop + offsetHeight rather than a bounding rect: this also runs
         * on an interval, and a rect is viewport-relative, so a scrolled frame
         * would measure short.
         */
        function measure() {
            var m = document.querySelector('sr7-module');
            if ( m && m.offsetHeight > 0 ) return m.offsetTop + m.offsetHeight;
            // No module (bad alias, or SR still booting): the body box is still
            // honest, because the fonttest wrap is out of flow.
            return document.body.scrollHeight;
        }
        /**
         * ONLY REPORT A HEIGHT SLIDER REVOLUTION HAS SETTLED ON.
         *
         * SR lays a module out more than once while booting: it picks a
         * breakpoint from whatever the frame measures at that instant, then
         * re-lays-out when things settle. Measured on the live article, every
         * module reported a transient 460px (SR's tablet layout) — and one
         * reported 5030px — before landing on its real height seconds later.
         * The parent applied each of those, so the page heaved up and down by
         * hundreds of pixels as the reader scrolled.
         *
         * The parent already reserves the module's declared geometry, and that
         * reservation is CORRECT — every module settles to exactly it. So the
         * cure is not faster updates, it is silence: send nothing until a value
         * has held for three consecutive samples, and the reservation carries
         * the layout until then. Zero shift, rather than fast-converging shift.
         */
        var STABLE_TICKS = 3;
        var lastSeen = -1, seenCount = 0, lastSent = -1;
        function post() {
            var h = measure();
            if ( h <= 0 ) return;
            if ( h === lastSeen ) { seenCount++; } else { lastSeen = h; seenCount = 1; }
            if ( seenCount < STABLE_TICKS || h === lastSent ) return;
            lastSent = h;
            // Two key names for one value. amsHeroHeight is what the deployed
            // HeroEmbed listens for and must keep working; amsEmbedHeight is the
            // name that isn't a lie when the frame holds an article slider. New
            // callers use the generic pair, and the hero can migrate later
            // without a flag day.
            parent.postMessage( { amsHeroHeight: h, amsEmbedHeight: h }, '*' );
        }
        window.addEventListener( 'load', post );
        // A real resize IS a new layout, so let the next value through quickly
        // rather than making it re-earn three ticks against the old one.
        window.addEventListener( 'resize', function () { lastSeen = -1; seenCount = 0; post(); } );
        // 200ms x 60 = 12s of watching. Denser than the old 400ms tick because
        // three samples now have to agree before anything is sent.
        var n = 0, t = setInterval( function () { post(); if ( ++n > 60 ) clearInterval( t ); }, 200 );

        /**
         * REPLAY ON RE-ENTRY.
         *
         * On WordPress a module resets its layers when it leaves the viewport
         * and plays its intro again on the way back — measured: opacity drops
         * to 0 while away, then staggers 0.02 -> 0.90 -> 1.0 on return. Framed,
         * that never happens: the module is permanently inside the frame's own
         * viewport, so SR sees no exit and no re-entry.
         *
         * Only the parent knows where the frame really is on the page, so the
         * parent owns this: it watches the frame and asks for a replay. Below is
         * the same lever SR's own viewport observer pulls — set inViewPort and
         * call the module's toggle, which routes to SR7.F.module.resume.
         *
         * Wrapped in try/catch on purpose. SR7.M / observParams are internals,
         * not public API, and the honest failure mode if a future release moves
         * them is "the animation stops replaying" — never a broken frame.
         */
        var AMS_PARENTS = <?php echo wp_json_encode( ams_afa_embed_origins() ); ?>;
        window.addEventListener( 'message', function ( e ) {
            if ( AMS_PARENTS.indexOf( e.origin ) === -1 ) return;
            if ( ! e.data || e.data.amsEmbedReplay !== true ) return;
            try {
                var el = document.querySelector( 'sr7-module' );
                if ( ! el || ! el.observParams || ! window.SR7 || ! SR7.M ) return;
                var M = SR7.M[ el.id ];
                if ( ! M || ! M.states ) return;
                M.states.inViewPort = true;
                el.observParams.toggleCall( el.id, null, M.c && M.c.slide );
            } catch ( err ) {}
        } );

        // Slide links are absolute WordPress URLs, and following one inside the
        // iframe navigates the visitor off the frontend entirely. Hand the click
        // to the parent instead; it maps the URL onto its own routes.
        document.addEventListener( 'click', function ( e ) {
            var a = e.target && e.target.closest ? e.target.closest( 'a[href]' ) : null;
            if ( ! a || window.parent === window ) {
                return;
            }
            e.preventDefault();
            parent.postMessage( { amsHeroNav: a.href, amsEmbedNav: a.href }, '*' );
        }, true );
    })();
    </script>
</body>
</html><?php
    $html = ob_get_clean();

    // Store only a plausible render. A truncated buffer (fatal mid-page, OOM)
    // would otherwise be pinned for the whole TTL and serve a broken frame to
    // everyone — the failure this cache could most easily cause.
    if ( $cacheable && strlen( $html ) > 1024 && stripos( $html, '</html>' ) !== false ) {
        set_transient( $cache_key, $html, AMS_AFA_EMBED_TTL );
    }

    header( 'Cache-Control: private, max-age=' . AMS_AFA_EMBED_BROWSER_TTL );
    header( 'X-AMS-Embed-Cache: MISS' );
    echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- assembled above.
    exit;
}

add_action( 'template_redirect', function () {
    $path = trim( (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ), '/' );

    /* ---- /hero-embed — UNCHANGED semantics ---------------------------------
       Whitelist, and an unknown alias falls back to the homepage slider. That
       fallback is correct for a hero (a landing page always wants *a* hero) and
       is load-bearing for every deployed frontend, so it stays exactly as it
       was. It is also precisely wrong for article content, which is why
       /sr-embed below is a separate route rather than a looser flag on this
       one: dropping the homepage hero into the middle of an article would be a
       worse failure than rendering nothing. */
    if ( $path === 'hero-embed' ) {
        $alias = isset( $_GET['alias'] ) ? sanitize_title( wp_unslash( $_GET['alias'] ) ) : '';
        if ( ! in_array( $alias, ams_afa_hero_aliases(), true ) ) {
            $alias = AMS_AFA_HERO_ALIAS;
        }
        ams_afa_render_embed( $alias );
    }

    /* ---- /sr-embed — any slider that exists, 404 otherwise ----------------- */
    if ( $path === 'sr-embed' ) {
        $alias = ams_afa_slider_alias( $_GET['alias'] ?? '' );
        if ( $alias === null ) {
            status_header( 404 );
            header( 'Content-Type: text/plain; charset=utf-8' );
            header( 'X-Robots-Tag: noindex' );
            echo 'Unknown slider alias.';
            exit;
        }
        ams_afa_render_embed( $alias );
    }
} );
