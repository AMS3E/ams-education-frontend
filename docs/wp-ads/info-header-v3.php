<?php

/**
 * The header v3 for our theme.
 *
 * Displays all of the <head> section and everything up till <div id="content">
 *
 * @package vodi
 */

?>
<!doctype html>
<html <?php language_attributes(); ?>>

<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no">
    <meta name='dailymotion-domain-verification' content='dmfou4y6pc0jkpoee' />
    <meta name="google-site-verification" content="XCaRZXVdifl36DVvqkE4p83lXWCkRf6Y8qn2vYXTbIY" />
    <link rel="profile" href="http://gmpg.org/xfn/11">
    <link rel="pingback" href="<?php bloginfo('pingback_url'); ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Battambang:wght@100;300;400;700;900&display=swap" rel="stylesheet">


    <?php if (is_single()) : ?>
        <?php
        $canonical_url = get_permalink();
        $amp_url = add_query_arg('amp', '1', $canonical_url);
        ?>
        <link rel="amphtml" href="<?php echo esc_url($amp_url); ?>">
    <?php endif; ?>

    <?php wp_head(); ?>
    <script src="https://kit.fontawesome.com/a076d05399.js"></script>

    <!-- Meta Pixel Code -->
    <script>
        ! function(f, b, e, v, n, t, s) {
            if (f.fbq) return;
            n = f.fbq = function() {
                n.callMethod ?
                    n.callMethod.apply(n, arguments) : n.queue.push(arguments)
            };
            if (!f._fbq) f._fbq = n;
            n.push = n;
            n.loaded = !0;
            n.version = '2.0';
            n.queue = [];
            t = b.createElement(e);
            t.async = !0;
            t.src = v;
            s = b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t, s)
        }(window, document, 'script',
            'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '306676681625725');
        fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none"
            src="https://www.facebook.com/tr?id=306676681625725&ev=PageView&noscript=1" /></noscript>
    <!-- End Meta Pixel Code -->
    
    <!--ads reviene script -->
    <script async src="//ads.amscloud.cc/www/delivery/asyncjs.php"></script>
  
    <script>
        function loadScript(a) {
            var b = document.getElementsByTagName("head")[0],
                c = document.createElement("script");
            c.type = "text/javascript", c.src = "https://tracker.metricool.com/resources/be.js", c.onreadystatechange = a, c.onload = a, b.appendChild(c)
        }
        loadScript(function() {
            beTracker.t({
                hash: "8b6535743a38b737e449867eac43e3c0"
            })
        });
    </script>
    <!--GPAS-->
    <script async="async" src="//ssp-cdn.gammaplatform.com/js/gaxpt.min.js"></script>
    <script type="text/javascript">
        var _ase_region = "SGP";
        var gammatag = gammatag || {};
        gammatag.cmd = gammatag.cmd || [];
    </script>
    <script>
        gammatag.cmd.push(function() {

            /* Damrei - Underlay */
            gammatag.defineZone({
                code: "gax-inpage-async-1721642630",
                size: [640, 1386],
                params: {
                    siteId: "1721642224",
                    zoneId: "1721642630",
                    zoneType: "Inpage"
                }
            });
            /* Damrei - MR1 Zone2 */
            gammatag.defineZone({
                code: "gax-inpage-async-1726823765",
                size: [300, 250],
                params: {
                    siteId: "1721642224",
                    zoneId: "1726823765",
                    zoneType: "Inpage"
                }
            });
            /* Damrei - MR1 */
            gammatag.defineZone({
                code: "gax-inpage-async-1721642412",
                size: [300, 250],
                params: {
                    siteId: "1721642224",
                    zoneId: "1721642412",
                    zoneType: "Inpage"
                }
            });
            /* Damrei - Underlay - 2 */
            gammatag.defineZone({
                code: "gax-inpage-async-1722239706",
                size: [640, 1386],
                params: {
                    siteId: "1721642224",
                    zoneId: "1722239706",
                    zoneType: "Inpage"
                }
            });
            /* Define more zone(s) here, each zone per line, if you have multiple zones on the same page. */
            /* Damrei - MR1 Desktop */
            gammatag.defineZone({
                code: "gax-inpage-async-1728357404",
                size: [300, 250],
                params: {
                    siteId: "1725879762",
                    zoneId: "1728357404",
                    zoneType: "Inpage"
                }
            });


            /* Damrei - Footer Mobile */
            gammatag.defineZone({
                code: "gax-inpage-async-1725858296",
                size: [720, 250],
                params: {
                    siteId: "1721642224",
                    zoneId: "1725858296",
                    zoneType: "Inpage"
                }
            });
            /* PTO Mobile */
            gammatag.defineZone({
                code: "gax-inpage-async-1721642896",
                size: [282, 370],
                params: {
                    siteId: "1721642224",
                    zoneId: "1721642896",
                    zoneType: "Inpage"
                }
            });

            /* PTO Desktop */
            gammatag.defineZone({
                code: "gax-inpage-async-1739240031",
                size: [1600, 900],
                params: {
                    siteId: "1725879762",
                    zoneId: "1739240031",
                    zoneType: "Inpage"
                }
            });

            gammatag.sendRequest();
        });
    </script>


    <script>
        document.addEventListener("DOMContentLoaded", function() {
            function loadGammaTagForScreenSize() {
                var screenWidth = window.innerWidth;

                if (screenWidth > 500) {
                    gammatag.defineZone({
                        code: "gax-inpage-async-1725879986",
                        size: [728, 90],
                        params: {
                            siteId: "1725879762",
                            zoneId: "1725879986",
                            zoneType: "Inpage"
                        }
                    });
                    
                }
            }

            loadGammaTagForScreenSize();

        });
    </script>




    <noscript>
        <!-- Fallback for noscript -->
        <a href='https://adservermsa.gpas.co/www/delivery/ck.php?n=ad774e22&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'>
            <img src='https://adservermsa.gpas.co/www/delivery/avw.php?zoneid=228&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=ad774e22' border='0' alt='' />
        </a>
    </noscript>

</head>

<body style="background:<?php echo $_COOKIE['bgColor']; ?>" <?php body_class(); ?>>
    <?php wp_body_open(); ?>
    <script>
        var request = "https://tag.gammaplatform.com/adx/request/?wid=1721642224&zid=1752035314&content_page_url=__page-url__&cb=__random-number__&player_width=__player-width__&player_height=__player-height__&device_id=__device-id__";
        var inview = {}

        function _0x45a9() {
            var _0x38efce = ['1838835vTPQKP', '260px,146px', 'createElement', 'script', '5265021HVfKFx', '3293470TNuVFp', '6815sLarff', 'getElementsByTagName', 'text', '4016356nRcLOg', 'insertAdjacentElement', 'childNodes', 'https://damreicdn.b-cdn.net/libs/Asycn-Script/video-inview/v1.0.4/damrei-video-inview-ad-format.min.js?ver=2022', '11jFKVnp', 'Damrei Video Inview Error: ', '7nQkXru', 'body', '3672798TefXXQ', 'VAST', 'then', 'src', '8iocSdq', '51153450QSbNjH', 'parseFromString', '2ostnSN', 'log'];
            _0x45a9 = function() {
                return _0x38efce;
            };
            return _0x45a9();
        }
        var _0x5575e9 = _0x3f32;

        function _0x3f32(_0x291524, _0x3294f1) {
            var _0x45a921 = _0x45a9();
            return _0x3f32 = function(_0x3f3205, _0x1fd65b) {
                _0x3f3205 = _0x3f3205 - 0x97;
                var _0x340eb6 = _0x45a921[_0x3f3205];
                return _0x340eb6;
            }, _0x3f32(_0x291524, _0x3294f1);
        }(function(_0x5baf9b, _0x2078fe) {
            var _0x7ff4de = _0x3f32,
                _0x54b15d = _0x5baf9b();
            while (!![]) {
                try {
                    var _0x20b444 = parseInt(_0x7ff4de(0xa8)) / 1 + parseInt(_0x7ff4de(0xa0)) / 2 * (-parseInt(_0x7ff4de(0xa6)) / 3) + -parseInt(_0x7ff4de(0xab)) / 4 + -parseInt(_0x7ff4de(0xa7)) / 5 + parseInt(_0x7ff4de(0x99)) / 6 * (-parseInt(_0x7ff4de(0x97)) / 7) + -parseInt(_0x7ff4de(0x9d)) / 8 * (parseInt(_0x7ff4de(0xa2)) / 9) + -parseInt(_0x7ff4de(0x9e)) / 10 * (-parseInt(_0x7ff4de(0xaf)) / 11);
                    if (_0x20b444 === _0x2078fe) break;
                    else _0x54b15d.push(_0x54b15d.shift());
                } catch (_0x4f8629) {
                    _0x54b15d.push(_0x54b15d.shift());
                }
            }
        }(_0x45a9, 0xd8c72), fetch(request).then(_0x32f30b => _0x32f30b.text()).then(_0x1acd03 => new window.DOMParser().parseFromString(_0x1acd03, 'text/xml')).then(_0x5c1d72 => {
            var _0x4f2b9b = _0x5575e9;
            try {
                if (_0x5c1d72[_0x4f2b9b(0xa9)](_0x4f2b9b(0x9a))[0].childNodes.length != 0) {
                    inview = {
                        container: _0x4f2b9b(0xa3),
                        timer: [false, 'display: none;'],
                        vidData: _0x5c1d72,
                        zoneID: Math.floor(Math.random() * 999)
                    };
                    var _0x300a9f = document.createElement('script');
                    _0x300a9f.src = _0x4f2b9b(0xae);
                    document.body.insertAdjacentElement('beforeend', _0x300a9f);
                }
            } catch (_0x98ef03) {
                console.log(_0x4f2b9b(0xb0), _0x98ef03);
            }
        }));
    </script>

    <?php do_action('vodi_before_site'); ?>

    <div id="page" class="hfeed site">


        <?php do_action('vodi_before_header'); ?>

        <!--Slider Shortcode-->


        <header id="site-header" class="site-header header-v3 desktop-header stick-this" role="banner" style="<?php vodi_header_styles(); ?>">


            <?php
            /**
             * Functions hooked into vodi_header_v3 action
             *
             */
            do_action('vodi_header_v3'); ?>

        </header><!-- #site-header -->

        <?php
        /**
         * Functions hooked in to vodi_before_content
         *
         * @hooked vodi_header_widget_region - 10
         * @hooked woocommerce_breadcrumb - 10
         */
        do_action('vodi_before_content');
        ?>

        <div id="content" class="site-content" tabindex="-1">


            <!--Damrei - Footer Mobile-->
            <div id="gax-inpage-async-1725858296"></div>


            <!--Damrei - Footer Desktop-->
            <div id="gax-inpage-async-1725879986"></div>

            <?php do_action('vodi_content_top'); ?>

            <div class="site-content__inner">
                <!--pop-up-->
                <script type="text/javascript">
                    // console.log("Initializing Ad Script...");

                    // Function to check if the user is on a mobile device
                    function isMobile() {
                        return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                    }
                    const mobileRandomAd = 1;
                    const desktopRandomAd = 1;
                    const isUserMobile = isMobile();
                    const randomAd = Math.random();
                    // Randomly choose which ad to display (0 or 1)
                    //var randomAd = Math.floor(Math.random() * 2); // 0 or 1
                    const domreiAd = isUserMobile ?
                        randomAd < mobileRandomAd :
                        randomAd < desktopRandomAd;


                    // console.log("Random Ad Choice:", randomAd);

                    // if (domreiAd) {
                        // console.log("Loading AMS Ad (SGP)... Domrei");

                        // Define _ase and _ase_region using var instead of window
                        // var _ase_region = "SGP";
                        // var _ase = _ase || [];

                        // console.log("ASE Region Set:", _ase_region);

                        // Load base placements for AMS Ad
                        // _ase.push(['1725879762', '1739240031']);

                        // Load mobile-specific ads only if the user is on a mobile device
                        // if (isMobile()) {
                        //     console.log("Mobile detected, adding mobile ad placements...");
                        //     _ase.push(['1721642224', '1721642896']);
                        // }

                        // console.log("ASE Push:", _ase);

                        // Dynamically insert AMS Ad script
                        // var amsScript = document.createElement("script");
                        // amsScript.src = "//ssp-cdn.gammaplatform.com/js/ad-exchange.js";
                        // amsScript.type = "text/javascript";
                        // document.body.appendChild(amsScript);
                    // }
                    // else {
                    //     console.log("Loading GPAS Ad...");

                    //     var zoneIds = []; //old code ads 323,367,336,350,406,379,462, new 565 
                    //     var randomZoneId = zoneIds[Math.floor(Math.random() * zoneIds.length)];
                    //     console.log("Selected GPAS Zone ID:", randomZoneId);

                    //     var m3_r = Math.floor(Math.random() * 99999999999);
                    //     var m3_u = (location.protocol === 'https:' ? 'https://adservermsa.gpas.co/www/delivery/ajs.php' : 'http://adservermsa.gpas.co/www/delivery/ajs.php');

                    //     if (!document.MAX_used) var MAX_used = ',';

                    //     document.write("<scr" + "ipt type='text/javascript' src='" + m3_u);
                    //     document.write("?zoneid=" + randomZoneId);
                    //     document.write('&amp;cb=' + m3_r);
                    //     if (MAX_used != ',') document.write("&amp;exclude=" + MAX_used);
                    //     document.write(document.charset ? '&amp;charset=' + document.charset : (document.characterSet ? '&amp;charset=' + document.characterSet : ''));
                    //     document.write("&amp;loc=" + escape(window.location));
                    //     if (document.referrer) document.write("&amp;referer=" + escape(document.referrer));
                    //     if (document.context) document.write("&context=" + escape(document.context));
                    //     document.write("'><\/scr" + "ipt>");
                    // }
                </script>



                <!--Pop Up Mobile-->
                <div id="gax-inpage-async-1721642896"></div>

                <!--Pop Up Desktop-->
                <div id="gax-inpage-async-1739240031"></div>