<?php
/*
Plugin Name: AMS3E-API
Description: Custom API endpoints for AMS website.
Version: 1.0
Author: Sak Ravuth
*/

require_once 'helper.php';


function add_cors_headers( $headers ) {
    $allowed_origins = [
        'http://localhost:3000',
        'https://dev.cloudlab.cam',
        'https://ams.com.kh',
    ];

    if ( isset( $_SERVER['HTTP_ORIGIN'] ) && in_array( $_SERVER['HTTP_ORIGIN'], $allowed_origins ) ) {
        header( 'Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN'] );
        header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
        header( 'Access-Control-Allow-Headers: Content-Type, Authorization' );
    }

    return $headers;
}
add_action( 'send_headers', 'add_cors_headers' );



// START::AMS.COM.KH
add_action('rest_api_init', function() {
    
	register_rest_route('wp/v2/web', 'get-articles', array(
		'methods' => 'GET',
		'callback' => 'get_articles',
		'args' => array(
            'page_no' => array(
                'required' => false,
                'validate_callback' => function($param, $request, $key) {
                    return $param === null || (is_numeric($param) && $param > 0);
                },
            ),
            'page_size' => array(
                'required' => false,
                'validate_callback' => function($param, $request, $key) {
                    return $param === null || (is_numeric($param) && $param > 0);
                },
            ),
            'category_id' => array(
                'validate_callback' => function ($param, $request, $key) {
                    $category_ids = explode(',', $param);
                    foreach ($category_ids as $id) {
                        if (!is_numeric($id)) {
                            return false;
                        }
                    }
                    return true;
                }
            ),
            'date_filter' => array(
                'required' => false,
                'validate_callback' => function ($param, $request, $key) {
                    return in_array($param, ['today', '1day_ago', '2days_ago']);
                }
            )
        ),
    
	));
	
	register_rest_route('wp/v2/web', 'get-article-by-id', array(
		'methods' => 'GET',
		'callback' => 'get_article_detail',
		'args' => array(
            'pId' => array(
                'required' => true,
                'validate_callback' => function($param, $request, $key) {
                    return $param === null || (is_numeric($param) && $param > 0);
                },
            ),
        ),
	));

    register_rest_route('wp/v2/web', 'get-article-by-slug', array(
        'methods' => 'GET',
        'callback' => 'get_article_by_slug',
        'args' => array(
            'slug' => array(
                'required' => true,
                'validate_callback' => function($param, $request, $key) {
                    return !empty($param) && is_string($param);
                },
            ),
        ),
    ));
    
	
	register_rest_route('wp/v2/web', 'get-author', array(
		'methods' => 'GET',
		'callback' => 'get_author',
		'args' => array(
            'authorId' => array(
                'required' => true,
                'validate_callback' => function($param, $request, $key) {
                    return $param === null || (is_numeric($param) && $param > 0);
                },
            ),
        ),
	));
	
	
	register_rest_route('wp/v2/web', 'find-articles', array(
		'methods' => 'GET',
		'callback' => 'search_articles',
		'args' => array(
            's' => array(
                'required' => true,
                'validate_callback' => function($param, $request, $key) {
                    return is_string($param) && !empty($param);
                },
            ),
        ),
	));
	
	
    register_rest_route('wp/v2/web', 'get-article-by-category-slug', array(
        'methods' => 'GET',
        'callback' => 'get_article_by_category_slug',
        'args' => array(
            'page_no' => array(
                'required' => false,
                'validate_callback' => function($param, $request, $key) {
                    return $param === null || (is_numeric($param) && $param > 0);
                },
            ),
            'page_size' => array(
                'required' => false,
                'validate_callback' => function($param, $request, $key) {
                    return $param === null || (is_numeric($param) && $param > 0);
                },
            ),
            'slug' => array(
                'required' => true,
                'validate_callback' => function($param, $request, $key) {
                    return !empty($param) && is_string($param);
                },
            ),
        ),
    ));
    
    
    // Get menu by location
    register_rest_route('wp/v2/web', '/secondary-menu', [
        'methods' => 'GET',
        'callback' => function() {
            return rest_ensure_response(get_menu_items_by_location('AMS 3E'));
        },
        'permission_callback' => '__return_true'
    ]);
	
	
	// Get hot news category
	
     register_rest_route('wp/v2/web', 'get-entertainment-hot-news', array(
        'methods' => 'GET',
        'callback' => 'get_latest_post_by_category_entertainment_hot_news'
    ));
    
     register_rest_route('wp/v2/web', 'get-life-style-hot-news', array(
        'methods' => 'GET',
        'callback' => 'get_latest_post_by_category_life_style_hot_news'
    ));
	

});



function get_menu_items_by_location($location) {
    $locations = get_nav_menu_locations();

    if (!isset($locations[$location])) {
        return new WP_Error('no_menu', 'Menu not found for the given location', ['status' => 404]);
    }

    $menu_id = $locations[$location];
    $menu_items = wp_get_nav_menu_items($menu_id);

    if (!$menu_items) {
        return [];
    }

    $items = [];
    foreach ($menu_items as $item) {
        $items[] = [
            'id'    => $item->ID,
            'title' => $item->title,
            'url'   => $item->url,
            'parent' => $item->menu_item_parent
        ];
    }

    return $items;
}


function get_article_by_category_slug($request) {
    $category_slug = $request->get_param('slug');
    $page_no = intval($request->get_param('page_no')) ?: 1;
    $page_size = intval($request->get_param('page_size')) ?: 10;

       $args = array(
        'category_name' => $category_slug,
        'posts_per_page' => $page_size,
        'paged' => $page_no,
        'post_status' => 'publish',
        'orderby' => array( 'date' => 'DESC', 'ID' => 'ASC' ),
    );

    $query = new WP_Query($args);

    // Prepare post data for response
    $post_list = array();
    foreach ($query->posts as $post) {
        
        $categories = get_the_category($post->ID);
        // Get post categories
        $post_categories = wp_get_post_categories($post->ID);
        $cats = array();
    
        foreach ($post_categories as $c) {
            $cat = get_category($c);
            $cats[] = [
                'id' => $cat->term_id,
                'name' => $cat->name,
                'slug' => $cat->slug
            ];
        }
        
        usort($cats, function($a, $b) {
            return $a['id'] - $b['id'];
        });

        $first_category_slug = '';
        if (!empty($categories)) {
            $first_category = $categories[0];
            $first_category_slug = $first_category->slug;
        }
        
        
        $post_list[] = array(
            "id" => $post->ID,
            "title" => $post->post_title,
            "categories" => $cats,
            "category" => $first_category_slug,
            "slug" => $post->post_name,
            "post_date" => format_time_ago_in_khmer($post->post_date),
            "thumbnail" => get_the_post_thumbnail_url($post->ID),
            "description" => mb_strimwidth($post->post_excerpt, 0, 150, '...'),
            
        );
    }

    // Pagination details
    $total_posts = $query->found_posts;
    $total_pages = $query->max_num_pages;

    $response_data = array(
        'status' => 'OK',
        'data' => $post_list,
        'page' => $page_no,
        'per_page' => $page_size,
        'total' => $total_posts,
        'total_page' => $total_pages,
    );

    $response = new WP_REST_Response($response_data);
    $response->set_status(200);

    return $response;
}



function get_articles($request) {
    
    $page_no = isset($request['page_no']) ? (int)$request['page_no'] : 1;
    $page_size = isset($request['page_size']) ? (int)$request['page_size'] : 10;
    $show_desc = isset($request['showDesc']) ? (bool)$request['showDesc'] : false;
    
      $args = array(
        'paged' => $page_no,
        'posts_per_page' => $page_size,
        'post_status' => 'publish',
        'orderby' => array( 'date' => 'DESC', 'ID' => 'ASC' ),
        'ignore_sticky_posts' => true,
    );
    
    // Date filter
    if (!empty($request['date_filter'])) {
        $today = current_time('Y-m-d');
        switch ($request['date_filter']) {
            case 'today':
                $args['date_query'] = array(
                    array(
                        'after' => $today,
                        'before' => $today . ' 23:59:59',
                        'inclusive' => true,
                    ),
                );
                break;

            case '1day_ago':
                $args['date_query'] = array(
                    array(
                        'after' => date('Y-m-d', strtotime('-1 day')),
                        'before' => $today . ' 23:59:59',
                        'inclusive' => true,
                    ),
                );
                break;

            case '2days_ago':
                $args['date_query'] = array(
                    array(
                        'after' => date('Y-m-d', strtotime('-2 days')),
                        'before' => date('Y-m-d', strtotime('-1 day')) . ' 23:59:59',
                        'inclusive' => true,
                    ),
                );
                break;
        }
    }

    
    if (!empty($request['category_id'])) {
        $category_ids = explode(',', $request['category_id']);
        $args['category__in'] = array_map('intval', $category_ids);
    }
    

    $query = new WP_Query($args);
    $posts = $query->posts;

    $total_posts = $query->found_posts;
    $total_pages = $query->max_num_pages;


    if (empty($posts)) {
        // return new WP_Error('empty_category', 'There are no posts in this category', array('status' => 404));
        return ApiResponse::notFound('No posts There are no posts in this category');
    }

    $post_list = [];

    foreach ($posts as $post) {
        
        $categories = get_the_category($post->ID);
        
        // Get post categories
        $post_categories = wp_get_post_categories($post->ID);
        $cats = array();
    
        foreach ($post_categories as $c) {
            $cat = get_category($c);
            $cats[] = [
                'id' => $cat->term_id,
                'name' => $cat->name,
                'slug' => $cat->slug
            ];
        }


        
        usort($cats, function($a, $b) {
            return $a['id'] - $b['id'];
        });

        $first_category_slug = '';
        if (!empty($categories)) {
            $first_category = $categories[0];
            $first_category_slug = $first_category->slug;
        }
        
        $post_list[] = (object)[
            "id" => $post->ID,
            "title" => $post->post_title,
            "categories" => $cats,
            "category" => $first_category_slug,
            "slug" => $post->post_name,
            "post_date" => format_time_ago_in_khmer($post->post_date),
            "thumbnail" => get_the_post_thumbnail_url($post->ID),
                        "description" => $show_desc
                ? ($post->post_excerpt ?: get_the_excerpt($post->ID))
                : mb_strimwidth($post->post_excerpt ?: get_the_excerpt($post->ID), 0, 150, '...'),

        ];
    }

    // Prepare the response structure
    $response_data = [
        'status' => 'OK',
        'data' => $post_list,
        'page' => $page_no,
        'per_page' => $page_size,
        'total' => $total_posts,
        'total_page' => $total_pages,
    ];

    $response = new WP_REST_Response($response_data);
    $response->set_status(200);

    return $response;
    
}


function format_time_ago_in_khmer($datetime) {
    $timestamp = strtotime($datetime);
    $current_time = current_time('timestamp');
    $diff = $current_time - $timestamp;

    if ($diff < 60) {
        return $diff . 'នាទីមុន';
    } elseif ($diff < 3600) {
        return floor($diff / 60) . 'នាទីមុន';
    } elseif ($diff < 86400) {
        return floor($diff / 3600) . 'ម៉ោងមុន';
    } elseif ($diff < 2592000) {
        return floor($diff / 86400) . 'ថ្ងៃមុន';
    } elseif ($diff < 31536000) {
        return floor($diff / 2592000) . 'ខែមុន';
    } else {
        return floor($diff / 31536000) . 'ឆ្នាំមុន';
    }
}


function get_article_detail($request) {
    // Fetch the post
    $post = get_post($request["pId"]);

    if (empty($post)) {
        // return new WP_REST_Response(["status" => "ERROR", "message" => "Article not found!"], 404);
        return ApiResponse::notFound('Article not found!');
    }

    // Get post categories
    $post_categories = wp_get_post_categories($post->ID);
    $cats = array();

    foreach ($post_categories as $c) {
        $cat = get_category($c);
        $cats[] = [
            'id' => $cat->term_id,
            'name' => $cat->name
        ];
    }
    
    usort($cats, function($a, $b) {
        return $a['id'] - $b['id'];
    });

    // Retrieve SEO metadata
    $seo_title = get_post_meta($post->ID, '_yoast_wpseo_title', true);
    $seo_description = get_post_meta($post->ID, '_yoast_wpseo_metadesc', true);
    // $seo_keywords = get_post_meta($post->ID, '_yoast_wpseo_focuskw', true);
    
    //Author
    $profile = get_user_meta($post->post_author, 'sabox-profile-image', true);
    if (empty($profile)) {
        $profile = get_user_meta($post->post_author, 'ams_avatar', true);
    }

    // Prepare the post output
    $post_output = (object) [
        "id" => $post->ID,
        "title" => $post->post_title,
        "thumbnail" => get_the_post_thumbnail_url($post->ID),
        "categories" => $cats,
        "publish_date" => $post->post_date,
        "last_updated" => $post->post_modified,
        "description" => mb_strimwidth($post->post_excerpt ?: get_the_excerpt($post), 0, 150, '...'),
        "post_content" => apply_filters('the_content', $post->post_content),
        "post_embeded" => get_post_meta($post->ID, 'url_embed_video', true),
        "author" => (object) [
            "id" => $post->post_author,
            'author_name' => get_the_author_meta('display_name', $post->post_author),
            'profile' => $profile,
            'description' => get_the_author_meta('description', $post->post_author)
        ],
        "seo" => (object) [
            "title" => $seo_title ?: $post->post_title,
            "description" => $seo_description ?: mb_strimwidth($post->post_excerpt ?: get_the_excerpt($post), 0, 150, '...'),
        ]
    ];

    // Create a response
    $response = new WP_REST_Response($post_output);
    $response->set_status(200);

    return $response;
}



function get_article_by_slug($request) {
    // Fetch the post by slug
    $args = array(
        'name'           => $request['slug'],
        'post_type'      => 'post',
        'posts_per_page' => 1,
    );
    $posts = get_posts($args);

    if (empty($posts)) {
        // return new WP_REST_Response(["status" => "ERROR", "message" => "Article not found!"], 404);
        return ApiResponse::notFound('Article not found!');
    }

    $post = $posts[0];

    // Get post categories
    $post_categories = wp_get_post_categories($post->ID);
    $cats = array();

    foreach ($post_categories as $c) {
        $cat = get_category($c);
        $cats[] = [
            'id' => $cat->term_id,
            'name' => $cat->name
        ];
    }
    
    usort($cats, function($a, $b) {
        return $a['id'] - $b['id'];
    });

    // Retrieve SEO metadata
    $seo_title = get_post_meta($post->ID, '_yoast_wpseo_title', true);
    $seo_description = get_post_meta($post->ID, '_yoast_wpseo_metadesc', true);
    
    //Author
    $profile = get_user_meta($post->post_author, 'sabox-profile-image', true);
    if (empty($profile)) {
        $profile = get_user_meta($post->post_author, 'ams_avatar', true);
    }

    // Prepare the post output
    $post_output = (object) [
        "id" => $post->ID,
        "title" => $post->post_title,
        "thumbnail" => get_the_post_thumbnail_url($post->ID),
        "categories" => $cats,
        "publish_date" => $post->post_date,
        "last_updated" => $post->post_modified,
        "description" => mb_strimwidth($post->post_excerpt ?: get_the_excerpt($post), 0, 150, '...'),
        "post_content" => apply_filters('the_content', $post->post_content),
        "author" => (object) [
            "id" => $post->post_author,
            'author_name' => get_the_author_meta('display_name', $post->post_author),
            'profile' => $profile,
            'description' => get_the_author_meta('description', $post->post_author)
        ],
        "seo" => (object) [
            "title" => $seo_title ?: $post->post_title,
            "description" => $seo_description ?: mb_strimwidth($post->post_excerpt ?: get_the_excerpt($post), 0, 150, '...'),
        ]
    ];

    // Create a response
    $response = new WP_REST_Response($post_output);
    $response->set_status(200);

    return $response;
}




function get_author($request) {
    
    $author_id = $request["authorId"];

    if ( ! $author_id || ! get_user_by('id', $author_id) ) {
        return new WP_REST_Response(["status" => "ERROR", "message" => "Author not found!"], 404);
    }
    
    $profile = get_user_meta($author_id, 'sabox-profile-image', true);
    if (empty($profile)) {
        $profile = get_user_meta($author_id, 'ams_avatar', true);
    }

    $post_output = (object) [
        "id" => $author_id,
        'author_name' => get_the_author_meta('display_name', $author_id),
        'profile' => $profile,
        'description' => get_the_author_meta('description', $author_id)
    ];

    $response = new WP_REST_Response($post_output);
    $response->set_status(200);

    return $response;
}



function search_articles($request) {
    $page_no = isset($request['page_no']) ? $request['page_no'] : 1;
    $page_size = isset($request['page_size']) ? $request['page_size'] : 10;
    
    $args = array(
        'paged' => $page_no,
        'posts_per_page' => $page_size,
        'post_status' => 'publish',
    );

    if (!empty($request['s'])) {
        $args['s'] = sanitize_text_field($request['s']); // Search by title
    }

    $posts = get_posts($args);

    // Check for total posts
    $total_posts = wp_count_posts()->publish;
    $total_pages = ceil($total_posts / $page_size);

    if (empty($posts)) {
        // return new WP_Error('no_posts', 'There are no posts matching your criteria', array('status' => 404));
        return ApiResponse::notFound('Article not found!');
    }

    $post_list = [];

    foreach ($posts as $post) {
        $post_list[] = (object)[
            "id" => $post->ID,
            "title" => $post->post_title,
            "slug" => $post->post_name,
            "description" => mb_strimwidth($post->post_excerpt, 0, 150, '...'),
            "thumbnail" => get_the_post_thumbnail_url($post->ID),
        ];
    }

    // Prepare the response structure
    $response_data = [
        'status' => 'OK',
        'data' => $post_list,
        'page' => $page_no,
        'per_page' => $page_size,
        'total' => $total_posts,
        'total_page' => $total_pages,
    ];

    $response = new WP_REST_Response($response_data);
    $response->set_status(200);

    return $response;
}


// ::GET by Category hot-new

// function get_latest_post_by_category_hot_news($request) {
//     $category_slug = $request['category_slug'] ?? 'hot-news';

//     $two_days_ago = date('Y-m-d H:i:s', strtotime('-2 days', current_time('timestamp')));
   
//     $args = array(
//         'post_type'      => 'post',
//         'posts_per_page' => 2,
//         'category_name'  => $category_slug,
//         'orderby'        => 'date',
//         'order'          => 'DESC',
//         'date_query'     => array(
//             array(
//                 'after' => $two_days_ago,
//                 'inclusive' => true,
//             ),
//         ),
        
//     );

//     $query = new WP_Query($args);
//     $post_list = [];

//     // Check if posts exist BEFORE looping
//     if ($query->have_posts()) {
//         while ($query->have_posts()) {
//             $query->the_post();
//             $categories = get_the_category(get_the_ID());
//             $category_list = [];
//             foreach ($categories as $cat) {
//                 $category_list[] = [
//                     'id'   => $cat->term_id,
//                     'name' => $cat->name,
//                     'slug' => $cat->slug,
//                 ];
//              }
//             $post_list[] = [
//                 'id'            => get_the_ID(),
//                 'post_date'     => format_time_ago_in_khmer(get_the_date('Y-m-d H:i:s')),
//                 'title'         => get_the_title(),
//                 'categories'    => $category_list,
//                 'author'        => get_the_author(),
//                 'description'   => get_the_excerpt(),
//                 'slug'          => get_post_field('post_name', get_the_ID()),
//                 'thumbnail'     => get_the_post_thumbnail_url(get_the_ID(), 'full'),
//                 'website'       => 'infotainment',
//                 'date'          => get_the_date('Y-m-d H:i:s'),
//             ];
//         }
//         wp_reset_postdata();

//         $response = new WP_REST_Response(['status' => 'OK', 'data' => $post_list]);
//         $response->set_status(200);
//         return $response;
//     } else {
//         // No posts found in the last 2 days
//         $response = new WP_REST_Response([
//             'status' => 'OK',
//             'message' => 'No recent posts found in this category (within 2 days)',
//             'data' => [],
//         ]);
//         $response->set_status(200);
//         return $response;
//     }
// }

function get_latest_post_by_category_entertainment_hot_news($request) {
    // The two required category slugs
    $category_slugs = ['hot-news', 'entertainment-news'];

    // Convert slugs to IDs
    $category_ids = [];
    foreach ($category_slugs as $slug) {
        $cat = get_category_by_slug($slug);
        if ($cat) {
            $category_ids[] = $cat->term_id;
        }
    }

    if (count($category_ids) < 2) {
        return new WP_REST_Response([
            'status' => 'ERROR',
            'message' => 'One or more categories do not exist',
            'data' => [],
        ], 400);
    }

    $two_days_ago = date('Y-m-d H:i:s', strtotime('-2 days', current_time('timestamp')));

    $args = [
        'post_type'      => 'post',
        'posts_per_page' => 1,
        'orderby'        => 'date',
        'order'          => 'DESC',
        'date_query'     => [
            [
                'after'     => $two_days_ago,
                'inclusive' => true,
            ],
        ],
        'tax_query' => [
            'relation' => 'AND', // Require posts to be in both categories
            [
                'taxonomy' => 'category',
                'field'    => 'term_id',
                'terms'    => $category_ids[0],
            ],
            [
                'taxonomy' => 'category',
                'field'    => 'term_id',
                'terms'    => $category_ids[1],
            ],
        ],
    ];

    $query = new WP_Query($args);
    $post_list = [];

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $categories = get_the_category(get_the_ID());
            $category_list = [];
            foreach ($categories as $cat) {
                $category_list[] = [
                    'id'   => $cat->term_id,
                    'name' => $cat->name,
                    'slug' => $cat->slug,
                ];
            }
            $post_list[] = [
                'id'            => get_the_ID(),
                'post_date'     => format_time_ago_in_khmer(get_the_date('Y-m-d H:i:s')),
                'title'         => get_the_title(),
                'categories'    => $category_list,
                'author'        => get_the_author(),
                'description'   => get_the_excerpt(),
                'slug'          => get_post_field('post_name', get_the_ID()),
                'thumbnail'     => get_the_post_thumbnail_url(get_the_ID(), 'full'),
                'website'       => 'infotainment',
                'date'          => get_the_date('Y-m-d H:i:s'),
            ];
        }
        wp_reset_postdata();

        return new WP_REST_Response(['status' => 'OK', 'data' => $post_list], 200);
    } else {
        return new WP_REST_Response([
            'status'  => 'OK',
            'message' => 'No recent posts found in both categories (within 2 days)',
            'data'    => [],
        ], 200);
    }
}

function get_latest_post_by_category_life_style_hot_news($request) {
    // The two required category slugs
    $category_slugs = ['hot-news', 'life-style-news'];

    // Convert slugs to IDs
    $category_ids = [];
    foreach ($category_slugs as $slug) {
        $cat = get_category_by_slug($slug);
        if ($cat) {
            $category_ids[] = $cat->term_id;
        }
    }

    if (count($category_ids) < 2) {
        return new WP_REST_Response([
            'status' => 'ERROR',
            'message' => 'One or more categories do not exist',
            'data' => [],
        ], 400);
    }

    $two_days_ago = date('Y-m-d H:i:s', strtotime('-2 days', current_time('timestamp')));

    $args = [
        'post_type'      => 'post',
        'posts_per_page' => 1,
        'orderby'        => 'date',
        'order'          => 'DESC',
        'date_query'     => [
            [
                'after'     => $two_days_ago,
                'inclusive' => true,
            ],
        ],
        'tax_query' => [
            'relation' => 'AND', // Require posts to be in both categories
            [
                'taxonomy' => 'category',
                'field'    => 'term_id',
                'terms'    => $category_ids[0],
            ],
            [
                'taxonomy' => 'category',
                'field'    => 'term_id',
                'terms'    => $category_ids[1],
            ],
        ],
    ];

    $query = new WP_Query($args);
    $post_list = [];

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $categories = get_the_category(get_the_ID());
            $category_list = [];
            foreach ($categories as $cat) {
                $category_list[] = [
                    'id'   => $cat->term_id,
                    'name' => $cat->name,
                    'slug' => $cat->slug,
                ];
            }
            $post_list[] = [
                'id'            => get_the_ID(),
                'post_date'     => format_time_ago_in_khmer(get_the_date('Y-m-d H:i:s')),
                'title'         => get_the_title(),
                'categories'    => $category_list,
                'author'        => get_the_author(),
                'description'   => get_the_excerpt(),
                'slug'          => get_post_field('post_name', get_the_ID()),
                'thumbnail'     => get_the_post_thumbnail_url(get_the_ID(), 'full'),
                'website'       => 'infotainment',
                'date'          => get_the_date('Y-m-d H:i:s'),
            ];
        }
        wp_reset_postdata();

        return new WP_REST_Response(['status' => 'OK', 'data' => $post_list], 200);
    } else {
        return new WP_REST_Response([
            'status'  => 'OK',
            'message' => 'No recent posts found in both categories (within 2 days)',
            'data'    => [],
        ], 200);
    }
}


    function send_telegram_message_contact($name=null, $email=null, $question=null) {
        
        // Make sure the data is coming in the expected format
        $botToken = "7650788436:AAHUUCm8oEmIbazWMwDkNzflvebqRpFxoMU";
        $chatId = "-4505012513";
        
        date_default_timezone_set("Asia/Phnom_Penh");

        $messageText = "CONTACT FORM: AMS.COM.KH\n";
        $messageText .= "Name: " . ($name ?: "N/A") . "\n";
        $messageText .= "Email: " . ($email ?: "N/A") . "\n";
        $messageText .= "Date: " . date("Y-m-d H:i:s") . "\n";
        $messageText .= "Questions: " . ($question ?: "N/A");

        if (empty($botToken) || empty($chatId) || empty($messageText)) {
            return new WP_Error('invalid_parameters', 'Invalid parameters provided.', array('status' => 400));
        }
    
        $apiUrl = "https://api.telegram.org/bot{$botToken}/sendMessage";
    
        $params = array('chat_id' => $chatId,'text' => $messageText);
    
        $ch = curl_init($apiUrl);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $params);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $response = curl_exec($ch);
        curl_close($ch);
   
        return $response;
    }





// CONTACT FORM
$allowed_domains = ['admin.amskh.co', 'infotainment.ams.com.kh'];
$current_domain = strtolower($_SERVER['HTTP_HOST']);

if (in_array($current_domain, array_map('strtolower', $allowed_domains))) {
    
    // Hook to initialize the REST API
    add_action('rest_api_init', function() {
        
        register_rest_route('wp/v2/web', 'contact-form', array(
            'methods' => 'POST',
            'callback' => 'create_form_submit',
            // 'permission_callback' => '__return_true',
        ));
        
        register_rest_route('wp/v2/web', 'contact-form', array(
            'methods' => 'GET',
            'callback' => 'get_form_submit',
            // 'permission_callback' => '__return_true',
            // 'permission_callback' => function() {
            //     return is_user_logged_in();
            // },
        ));
        
        register_rest_route('wp/v2/web', 'advertise', array(
            'methods' => 'GET',
            'callback' => 'get_advertise',
            'permission_callback' => '__return_true',
        ));
        
        
        register_rest_route('wp/v2/web', 'send-telegram', array(
            'methods' => 'GET',
            'callback' => 'send_telegram_message_contact_action',
            // 'permission_callback' => '__return_true',
        ));
        
        function send_telegram_message_contact_action() {
            send_telegram_message_contact("Sak Ravuth", "sakravuth@gmail.com", "Question 1");
        }
        
        
        // GET ADVERTISE
        function get_advertise(WP_REST_Request $request) {
            global $wpdb;
            $tbl_ads = $wpdb->prefix . 'ams3e_ads_central';
            
            $pageNo = intval($request->get_param('page_no')) > 0 ? intval($request->get_param('page_no')) : 1;
            $perPage = intval($request->get_param('per_page')) > 0 ? intval($request->get_param('per_page')) : 10;
            
            // Filter
            $ads_location = $request->get_param('ads_location');
            $position = $request->get_param('position');
    
            $offset = ($pageNo - 1) * $perPage;
            
            $query = "SELECT * FROM $tbl_ads WHERE 1=1";
    
            // Add filters if parameters are set
            if ($ads_location) {
                $query .= $wpdb->prepare(" AND ads_location = %s", $ads_location);
            }
            if ($position) {
                $query .= $wpdb->prepare(" AND position = %s", $position);
            }
            
            // Add pagination to the query
            $query .= $wpdb->prepare(" ORDER BY id DESC LIMIT %d OFFSET %d", $perPage, $offset);
            
            // Execute query
            $results = $wpdb->get_results($query);
            
            
            if (empty($results))  return new WP_REST_Response(array('message' => 'No data found.'), 404);
            
            $res_data = array();
            foreach ($results as $result) {
                $res_data[] = array(
                    'id' => $result->id,
                    'ads_title' => $result->ads_title,
                    'ads_location' => $result->ads_location,
                    'ads_position' => $result->position,
                    'image' => $result->image,
                );
            }
            
            return new WP_REST_Response(array(
                'status' => 'OK',
                'message' => 'Get ads successfully.',
                'data' => $res_data,
                'current_page' => $pageNo,
                'per_page' => $perPage,
                'total_items' => $wpdb->get_var("SELECT COUNT(*) FROM $tbl_ads"),
            ), 200);
            
            
        }
        
        
        // CREATE CONTACT FORM
        function create_form_submit(WP_REST_Request $request) {
            global $wpdb;
            $tbl_contact_form = $wpdb->prefix . 'ams3e_contact_form';
    
            $full_name = sanitize_text_field($request->get_param('full_name'));
            $email = sanitize_email($request->get_param('email'));
            $question = sanitize_textarea_field($request->get_param('question'));
    
            $existing_email = $wpdb->get_var($wpdb->prepare("SELECT email FROM $tbl_contact_form WHERE email = %s", $email));
            if ($existing_email) {
                return new WP_REST_Response(array("status" => "ERROR", "message" => "Email already exists."), 409);
            }
            
    
            $data = array(
                'full_name' => $full_name,
                'email' => $email,
                'question' => $question,
            );
    
            $result = $wpdb->insert($tbl_contact_form, $data);
            if ($result) {
                send_telegram_message_contact($full_name, $email, $question);
                return new WP_REST_Response(array("status" => "OK", "message" => "Created Successfully."), 200);
            }
            
        }
        
        // GET CONTACT FORM
        function get_form_submit(WP_REST_Request $request) {
            global $wpdb;
            $tbl_contact_form = $wpdb->prefix . 'ams3e_contact_form';
            
            $pageNo = intval($request->get_param('page_no')) > 0 ? intval($request->get_param('page_no')) : 1;
            $perPage = intval($request->get_param('per_page')) > 0 ? intval($request->get_param('per_page')) : 10;
            
            $offset = ($pageNo - 1) * $perPage;
            
            $query = $wpdb->prepare("SELECT * FROM $tbl_contact_form ORDER BY created_at DESC LIMIT %d OFFSET %d", $perPage, $offset);
            $results = $wpdb->get_results($query);
            
            if (empty($results))  return new WP_REST_Response(array('message' => 'No entries found.'), 404);
    
            $response_data = array();
            foreach ($results as $result) {
                $response_data[] = array(
                    'id' => $result->id,
                    'full_name' => $result->full_name,
                    'email' => $result->email,
                    'question' => $result->question,
                    'created_at' => $result->created_at,
                );
            }
            
            return new WP_REST_Response(array(
                'status' => 'OK',
                'message' => 'Get contact successfully.',
                'data' => $response_data,
                'current_page' => $pageNo,
                'per_page' => $perPage,
                'total_items' => $wpdb->get_var("SELECT COUNT(*) FROM $tbl_contact_form"),
            ), 200);
    
        }
    
    
    });
    
    

    function mcf_create_contact_table() {
        global $wpdb;

        $table_name = $wpdb->prefix . 'ams3e_contact_form';

        $charset_collate = $wpdb->get_charset_collate();
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            full_name varchar(100) NOT NULL,
            email varchar(100) NOT NULL UNIQUE,
            question text NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY (id)
        ) $charset_collate;";

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');

        dbDelta($sql);
    }
    
    register_activation_hook(__FILE__, 'mcf_create_contact_table');


    
    
    
    // Function to add the admin menu item
    function au_add_admin_menu() {
        add_menu_page('Advertisement', 'Advertisement', 'manage_options', 'advertisement', 'au_advertise_page');
        
        if (isset($_GET['page']) && $_GET['page'] === 'advertisement') {
            remove_all_actions('admin_notices');
            remove_all_actions('all_admin_notices');
        }
        
    }
    add_action('admin_menu', 'au_add_admin_menu');

    

}




if (!defined('ABSPATH')) {
    exit;
}

// Create the custom database table on plugin activation
function au_create_ads_table() {
    global $wpdb;

    $table_name = $wpdb->prefix . 'ams3e_ads_central'; // Custom table name
    $charset_collate = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE IF NOT EXISTS $table_name (
        id mediumint(9) NOT NULL AUTO_INCREMENT,
        ads_title tinytext NOT NULL,
        ads_location tinytext NOT NULL, -- New column
        ads_position tinytext NOT NULL,
        image text NOT NULL,
        PRIMARY KEY (id)
    ) $charset_collate;";

    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta($sql);
    
    // Ensure new column exists
    $column_exists = $wpdb->get_var("SHOW COLUMNS FROM $table_name LIKE 'ads_location'");
    if (!$column_exists) {
        $wpdb->query("ALTER TABLE $table_name ADD ads_location tinytext NOT NULL AFTER ads_title");
    }
    
}
register_activation_hook(__FILE__, 'au_create_ads_table');

// Function to handle advertisement uploads and updates
function au_handle_advertisement_upload($edit_id = null) {
    global $wpdb;

    if (!function_exists('wp_handle_upload')) {
        require_once(ABSPATH . 'wp-admin/includes/file.php');
    }

    // Check if the uploaded file exists
    if (isset($_FILES['au_image']) && $_FILES['au_image']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['au_image'];
        $upload_overrides = array('test_form' => false);

        // Upload the image
        $movefile = wp_handle_upload($file, $upload_overrides);

        if ($movefile && !isset($movefile['error'])) {
            // Prepare data for database insertion or update
            $ads_title = sanitize_text_field($_POST['ads_title']);
            $ads_location = sanitize_text_field($_POST['ads_location']);
            $position = sanitize_text_field($_POST['position']);
            $image_url = esc_url($movefile['url']);

            // Insert or update the advertisement data
            if ($edit_id) {
                // Update existing advertisement
                $result = $wpdb->update(
                    $wpdb->prefix . 'ams3e_ads_central',
                    array(
                        'ads_title' => $ads_title,
                        'ads_location' => $ads_location,
                        'position' => $position,
                        'image' => $image_url,
                    ),
                    array('id' => $edit_id),
                    array('%s', '%s', '%s', '%s'),
                    array('%d')
                );
            } else {
                // Insert new advertisement
                $result = $wpdb->insert(
                    $wpdb->prefix . 'ams3e_ads_central',
                    array(
                        'ads_title' => $ads_title,
                        'ads_location' => $ads_location,
                        'position' => $position,
                        'image' => $image_url,
                    ),
                    array('%s', '%s', '%s', '%s')
                );
            }

            if ($result === false) {
                // Log the error for debugging
                $error = $wpdb->last_error;
                echo "<div class='error'><p>Error: Could not insert/update advertisement into the database. MySQL Error: $error</p></div>";
            } else {
                echo "<div class='updated'><p>Advertisement " . ($edit_id ? "updated" : "uploaded") . " successfully: <a href='{$image_url}' target='_blank'>View Image</a></p></div>";
                wp_redirect(admin_url('admin.php?page=advertisement'));
                exit;
            }
        } else {
            echo "<div class='error'><p>Error: " . esc_html($movefile['error']) . "</p></div>";
        }
    } else {
        if (isset($_POST['ads_title'])) {
            // If no file is uploaded but form submitted, proceed to update
            $ads_title = sanitize_text_field($_POST['ads_title']);
            $ads_location = sanitize_text_field($_POST['ads_location']);
            $position = sanitize_text_field($_POST['position']);
            
            if ($edit_id) {
                // Update existing advertisement without changing the image
                $result = $wpdb->update(
                    $wpdb->prefix . 'ams3e_ads_central',
                    array(
                        'ads_title' => $ads_title,
                        'ads_location' => $ads_location,
                        'position' => $position,
                    ),
                    array('id' => $edit_id),
                    array('%s', '%s', '%s'),
                    array('%d')
                );
                
                if ($result === false) {
                    $error = $wpdb->last_error;
                    echo "<div class='error'><p>Error: Could not update advertisement. MySQL Error: $error</p></div>";
                } else {
                    echo "<div class='updated'><p>Advertisement updated successfully.</p></div>";
                    wp_redirect(admin_url('admin.php?page=advertisement'));
                    exit;
                }
            }
        } else {
            echo "<div class='error'><p>Error: No file uploaded or an upload error occurred.</p></div>";
        }
    }
}

// Function to fetch all advertisements from the database
function au_get_all_advertisements() {
    global $wpdb;

    // Query to select all advertisements
    $table_name = $wpdb->prefix . 'ams3e_ads_central'; // Use the correct table name
    $query = "SELECT * FROM $table_name";
    $ads = $wpdb->get_results($query);

    return $ads;
}

// Function to get advertisement by ID for editing
function au_get_advertisement($id) {
    global $wpdb;

    $table_name = $wpdb->prefix . 'ams3e_ads_central';
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table_name WHERE id = %d", $id));
}

// Function to display the admin page for uploading and editing advertisements
function au_advertise_page() {
    $edit_id = isset($_GET['edit']) ? intval($_GET['edit']) : null;
    $advertisement = $edit_id ? au_get_advertisement($edit_id) : null;

    ?>
    <div class="wrap">
        
        <div style="display:flex;">
            
            <div style="width:30%; padding-right:15px;">
                <h2><?php echo $edit_id ? 'Edit Advertisement' : 'Create New Advertise'; ?></h2>
                <form method="post" enctype="multipart/form-data" style="background-color:white;padding:20px;">
                    <label for="ads_title">Advertisement Title:</label><br/>
                    <input type="text" name="ads_title" value="<?php echo esc_attr($advertisement->ads_title ?? ''); ?>" style="width:100%;margin-top:10px;" required />
                    <br/><br/>
                    
                    <label for="ads_location">Ads Location:</label><br/>
                       <select name="ads_location" style="width:100%;max-width:100vw;margin-top:10px;" required>
                            <option value="Home Page" <?php selected($advertisement->ads_location ?? '', 'Home Page'); ?>>Home Page</option>
                            <option value="Page Detail" <?php selected($advertisement->ads_location ?? '', 'Page Detail'); ?>>Page Detail</option>
                        </select>
                    <br/><br/>
        
                    <label for="position">Position:</label><br/>
                    <input type="text" name="position" value="<?php echo esc_attr($advertisement->position ?? ''); ?>" style="width:100%;margin-top:10px;" required />
                    <br/><br/>
        
                    <label for="image-upload">Ads Image:</label><br/>
            
                    <?php if ($advertisement) : ?>
                        <div>
                            <input type="hidden" name="current_image" value="<?php echo esc_url($advertisement->image); ?>" />
                            <img src="<?php echo esc_url($advertisement->image); ?>" alt="Current Ad Image" style="max-width: 100px; display: block;" />
                        </div>
                    <?php endif; ?>
                    
                    <input type="file" name="au_image" accept="image/*" id="image-upload" /> </br>
        
                    <button type="submit" name="au_upload" class="button button-primary" style="margin-top:10px;"><?php echo $edit_id ? 'Update Advertisement' : 'Create Advertisement'; ?></button>
                </form>    
            </div>
            
            
            <div style="width:70%; padding-left:15px;">
            
                <h2>All Advertisements</h2>
                <table class="widefat fixed">
                    <thead>
                        <tr>
                            <th width="3%;">ID</th>
                            <th width="5%;">Image</th>
                            <th>Advertisement Title</th>
                            <th>Ads. Location</th>
                            <th>Position</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $ads = au_get_all_advertisements();
                        if ($ads) {
                            foreach ($ads as $ad) {
                                echo "<tr>";
                                echo "<td>" . esc_html($ad->id) . "</td>";
                                echo "<td><img src='" . esc_url($ad->image) . "' alt='Ad Image' style='width: 60px;'/></td>";
                                echo "<td>" . esc_html($ad->ads_title) . "</td>";
                                echo "<td>" . esc_html($ad->ads_location) . "</td>";
                                echo "<td>" . esc_html($ad->position) . "</td>";
                                echo "<td><a href='" . admin_url('admin.php?page=advertisement&edit=' . esc_attr($ad->id)) . "' class='button'>Edit</a></td>";
                                echo "</tr>";
                            }
                        } else {
                            echo "<tr><td colspan='5'>No advertisements found.</td></tr>";
                        }
                        ?>
                    </tbody>
                </table>
                
            </div>
            
        </div>
        
    </div>

    <script>
        document.getElementById('image-upload').addEventListener('change', function (event) {
            const preview = document.getElementById('preview');
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                preview.src = e.target.result;
                preview.style.display = 'block'; // Show the preview
            };

            if (file) {
                reader.readAsDataURL(file); // Convert the file to base64 URL
            } else {
                preview.src = '';
                preview.style.display = 'none'; // Hide the preview if no file
            }
        });
    </script>
    <?php

    // Handle the file upload and database insertion/updating
    if (isset($_POST['au_upload'])) {
        au_handle_advertisement_upload($edit_id);
    }
}






// END::AMS.COM.KH