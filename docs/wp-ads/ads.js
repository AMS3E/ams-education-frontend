/**
 * Responsive Revive Adserver banners.
 *
 * Revive async delivery (asyncjs.php) fills each <ins data-revive-zoneid>
 * placeholder with a FIXED-SIZE <iframe> (its width/height attributes are the
 * banner's native pixel size). The creative lives inside that iframe, so it
 * cannot be shrunk with max-width:100% — that only clips the iframe. The only
 * reliable fix is a CSS transform: scale() on the iframe, while the wrapper
 * reserves the scaled height so the page doesn't jump.
 *
 * Revive also does parentNode.replaceChild() — it swaps the original <ins> for
 * a clone that contains the iframe. So we wrap each <ins> in a container we own
 * and observe the WRAPPER (not the <ins>) for the injected iframe.
 */
(function () {
  "use strict";

  var SELECTOR = "ins[data-revive-zoneid]";
  var WRAP_CLASS = "revive-responsive";

  // Scale the iframe inside a wrapper to fit the available width.
  function fit(wrapper) {
    var iframe = wrapper.querySelector("iframe");
    if (!iframe) return;

    var nativeW = parseInt(iframe.getAttribute("width"), 10) || iframe.offsetWidth;
    var nativeH = parseInt(iframe.getAttribute("height"), 10) || iframe.offsetHeight;
    if (!nativeW || !nativeH) return;

    var avail = wrapper.clientWidth;
    if (!avail) return; // not laid out yet (hidden / detached)

    // Never upscale past the banner's native size.
    var scale = Math.min(1, avail / nativeW);

    // Keep the iframe at its native size; only the visual transform changes.
    iframe.style.width = nativeW + "px";
    iframe.style.height = nativeH + "px";
    iframe.style.maxWidth = "none";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.transformOrigin = "top left";

    // Center on wide screens; offset is 0 on mobile (scaled width == avail).
    var offset = Math.max(0, (avail - nativeW * scale) / 2);
    iframe.style.transform = "translateX(" + offset + "px) scale(" + scale + ")";

    // Reserve the right amount of vertical space (transforms don't affect layout).
    wrapper.style.height = Math.round(nativeH * scale) + "px";
  }

  function watch(wrapper) {
    fit(wrapper); // in case the iframe was already injected before we wrapped

    var mo = new MutationObserver(function () {
      fit(wrapper);
    });
    mo.observe(wrapper, {
      childList: true, // iframe / replaced <ins> added
      subtree: true,
      attributes: true, // iframe width/height set after insertion, or ad refresh
      attributeFilter: ["width", "height"],
    });
  }

  // Wrap every Revive placeholder in a container we control, then watch it.
  function wrapAll() {
    var inses = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < inses.length; i++) {
      var ins = inses[i];
      var parent = ins.parentNode;
      if (!parent) continue;
      if (parent.classList && parent.classList.contains(WRAP_CLASS)) continue; // already wrapped

      var wrapper = document.createElement("div");
      wrapper.className = WRAP_CLASS;
      parent.insertBefore(wrapper, ins);
      wrapper.appendChild(ins);
      watch(wrapper);
    }
  }

  function refitAll() {
    var wraps = document.querySelectorAll("." + WRAP_CLASS);
    for (var i = 0; i < wraps.length; i++) fit(wraps[i]);
  }

  function init() {
    wrapAll();

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refitAll, 150);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
