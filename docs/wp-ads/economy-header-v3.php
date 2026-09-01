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
    <meta name='dailymotion-domain-verification' content='dmw4csoav141oddcv' />
    <link rel="profile" href="http://gmpg.org/xfn/11">
    <link rel="pingback" href="<?php bloginfo('pingback_url'); ?>">

    <script>
        function loadScript(a) {
            var b = document.getElementsByTagName("head")[0],
                c = document.createElement("script");
            c.type = "text/javascript", c.src = "https://tracker.metricool.com/resources/be.js", c.onreadystatechange = a, c.onload = a, b.appendChild(c)
        }
        loadScript(function() {
            beTracker.t({
                hash: "84da3744ce1eb9524c93b37a942df3c5"
            })
        });
    </script>

<!--script ads revine -->
<script async src="//ads.ams.com.kh/www/delivery/asyncjs.php"></script>

<?php if (is_single()) : ?>
    <?php
    $canonical_url = get_permalink();
    $amp_url = add_query_arg('amp', '1', $canonical_url);
    ?>
    <link rel="amphtml" href="<?php echo esc_url($amp_url); ?>">
<?php endif; ?>

    <?php wp_head(); ?>


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
        fbq('init', '694960145106572');
        fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none"
            src="https://www.facebook.com/tr?id=694960145106572&ev=PageView&noscript=1" /></noscript>
    <!-- End Meta Pixel Code -->

                <!--Pop Up-->
                <script type="text/javascript">
                    document.addEventListener('DOMContentLoaded', function() {

                        console.log("Ad script started...");

                        // Function to check if the user is on a mobile device
                        function isMobile() {
                            // console.log(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
                            return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                        }

                        const mobileRandomAd = 1;
                        const desktopRandomAd = 1;
                        const isUserMobile = isMobile();
                        const randomAd = Math.random();

                        console.log("Random ad selection:", randomAd);

                        // Note: Since mobileRandomAd and desktopRandomAd are both 1,
                        // this condition will always be true (randomAd < 1) unless randomAd is exactly 1.
                        const domreiAd = isUserMobile ?
                            randomAd < mobileRandomAd :
                            randomAd < desktopRandomAd;

                        // if (domreiAd) {
                        //     console.log("Loading Damrei Pop Up ad...");

                        //     var _ase_region = "SGP";
                        //     var _ase = window._ase || []; // Safely initialize _ase on the window object

                        //     console.log("ASE Region Set:", _ase_region);

                        //     // Load base placements for AMS Ad
                        //     _ase.push(['1725879762', '1739329474']); //

                        //     // Load mobile placements only if the user is on a mobile device
                        //     if (isMobile()) {
                        //         console.log("Mobile detected, adding mobile ad placements...");
                        //         _ase.push(['1721642224', '1729764963']);
                        //     }

                        //     console.log("Damrei ad zones:", _ase);
                        //     window._ase = _ase; // Ensure the global _ase is updated

                        //     // Dynamically insert AMS Pop-up Ad script
                        //     var amsPopupScript = document.createElement("script");
                        //     amsPopupScript.src = "//ssp-cdn.gammaplatform.com/js/ad-exchange.js";
                        //     amsPopupScript.type = "text/javascript";

                        //     // *** FIX: document.body is guaranteed to exist here ***
                        //     // This line will no longer fail because we waited for DOMContentLoaded.
                        //     if (document.body) {
                        //         document.body.appendChild(amsPopupScript);
                        //         console.log("AMS Pop-up Ad script injected successfully.");
                        //     } else {
                        //         console.error("Critical Error: document.body still null after DOMContentLoaded.");
                        //     }
                        // } else {
                        //     console.log("Loading GPas Popup ad...");

                        //     var zoneIds = []; // Array of zone IDs old 232,365,335,349,379,404,377,460, new code: 563
                        //     var randomZoneId = zoneIds[Math.floor(Math.random() * zoneIds.length)];
                        //     console.log("Selected GPas zone ID:", randomZoneId);

                        //     var m3_r = Math.floor(Math.random() * 99999999999);
                        //     var m3_u = (location.protocol == 'https:' ? 'https://adservermsa.gpas.co/www/delivery/ajs.php' : 'http://adservermsa.gpas.co/www/delivery/ajs.php');

                        //     if (!document.MAX_used) document.MAX_used = ',';
                        //     console.log("Document MAX_used:", document.MAX_used);

                        //     document.write("<scr" + "ipt type='text/javascript' src='" + m3_u);
                        //     document.write("?zoneid=" + randomZoneId);
                        //     document.write('&amp;cb=' + m3_r);
                        //     if (document.MAX_used != ',') document.write("&amp;exclude=" + document.MAX_used);

                        //     // Updated encoding method
                        //     document.write(document.charset ? '&amp;charset=' + document.charset : (document.characterSet ? '&amp;charset=' + document.characterSet : ''));
                        //     document.write("&amp;loc=" + encodeURIComponent(window.location.href));
                        //     if (document.referrer) document.write("&amp;referer=" + encodeURIComponent(document.referrer));
                        //     if (document.context) document.write("&context=" + encodeURIComponent(document.context));
                        //     document.write("'><\/scr" + "ipt>");

                        //     console.log("GPas ad script injected successfully.");
                        // }
                    });
                </script>

                    <!---->
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
                            code: "gax-inpage-async-1729764934",
                            size: [640, 1386],
                            params: {
                                siteId: "1721642224",
                                zoneId: "1729764934",
                                zoneType: "Inpage"
                            }
                        });
                        gammatag.defineZone({
                            code: "gax-inpage-async-1726823765",
                            size: [300, 250],
                            params: {
                                siteId: "1721642224",
                                zoneId: "1726823765",
                                zoneType: "Inpage"
                            }
                        });
                        /* Damrei - MR1*/
                        gammatag.defineZone({
                            code: "gax-inpage-async-1729764905",
                            size: [300, 250],
                            params: {
                                siteId: "1721642224",
                                zoneId: "1729764905",
                                zoneType: "Inpage"
                            }
                        });
            
                        /* Damrei - Underlay - 2 */
                        gammatag.defineZone({
                            code: "gax-inpage-async-1731396715",
                            size: [640, 1386],
                            params: {
                                siteId: "1721642224",
                                zoneId: "1731396715",
                                zoneType: "Inpage"
                            }
                        });
            
                        /* Damrei - Footer*/
                        gammatag.defineZone({
                            code: "gax-inpage-async-1729766383",
                            size: [720, 250],
                            params: {
                                siteId: "1721642224",
                                zoneId: "1729766383",
                                zoneType: "Inpage"
                            }
                        });
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
                        /* PTO Mobile */
                        gammatag.defineZone({code:"gax-inpage-async-1729764963",size:[282,370],params:{siteId:"1721642224",zoneId:"1729764963",zoneType:"Inpage"}});
                        
                        /* PTO Desktop */
                        gammatag.defineZone({code:"gax-inpage-async-1739329474",size:[1600,900],params:{siteId:"1725879762",zoneId:"1739329474",zoneType:"Inpage"}});
            
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
        <a href='https://adservermsa.gpas.co/www/delivery/ck.php?n=ac9942e8&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'>
            <img src='https://adservermsa.gpas.co/www/delivery/avw.php?zoneid=232&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=ac9942e8' border='0' alt='' />
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

        <?php /*add_revslider('TOP-BAR-V2-IB'); */ ?>


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

            <!--Damrei - Footer-->
            <div id="gax-inpage-async-1729766383"></div>

            <!--Damrei - Footer Desktop-->
            <div id="gax-inpage-async-1725879986"></div>

            <?php do_action('vodi_content_top'); ?>

            <div class="site-content__inner">

    
    
    <!--Pop Up Mobile-->
    <div id="gax-inpage-async-1729764963"></div>
    
    <!--Pop Up Desktop-->
    <div id="gax-inpage-async-1739329474"></div>