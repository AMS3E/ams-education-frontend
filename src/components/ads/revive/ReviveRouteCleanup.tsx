"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Revive's asyncjs.php (see window.reviveAsync in its source) guards its own
// init with `if (!reviveAsync.hasOwnProperty(id))`, so re-fetching the script
// on a later client-side navigation is a silent no-op — it will NOT rescan
// the DOM for that page's <ins> tags. What it does listen for, permanently,
// is a `revive-<data-revive-id>-refresh` document event, whose handler
// (`detect()` + `apply()`) rescans for any <ins data-revive-id> that isn't
// already marked `data-revive-loaded` and fetches those zones. That's the
// supported hook for "new ad slots appeared without a page reload".
function refreshReviveZones(ins: Element) {
  const id = ins.getAttribute("data-revive-id");
  if (!id) return;
  document.dispatchEvent(new CustomEvent(`revive-${id}-refresh`));
}

const REVIVE_SELECTOR = [
  '[data-revive-zoneid]',
  'iframe[src*="ads.ams.com.kh"]',
  'img[src*="ads.ams.com.kh"]',
  '[id^="beacon_"]',
  '[id^="revive-"]',
  '[class*="revive"]',
].join(",");

function removeReviveArtifacts() {
  if (document.querySelector("[data-revive-zoneid]")) return;

  document.querySelectorAll<HTMLElement>(REVIVE_SELECTOR).forEach(node => {
    let artifact: HTMLElement = node;
    while (artifact.parentElement && artifact.parentElement !== document.body) {
      artifact = artifact.parentElement;
    }
    if (artifact.parentElement === document.body && artifact.tagName !== "SCRIPT") artifact.remove();
    else node.remove();
  });

  const siteRoot = document.querySelector("main")?.parentElement;
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement) || child === siteRoot || child.tagName === "SCRIPT") continue;
    const position = window.getComputedStyle(child).position;
    if ((position === "fixed" || position === "sticky") && child.querySelector("img, iframe, canvas, svg")) {
      child.remove();
    }
  }
}

export default function ReviveRouteCleanup() {
  const pathname = usePathname();
  const isFirstPathname = useRef(true);

  useEffect(() => {
    if (document.querySelector("[data-revive-zoneid]")) return;

    removeReviveArtifacts();
    const frame = requestAnimationFrame(removeReviveArtifacts);
    const timers = [250, 1000, 3000].map(delay => window.setTimeout(removeReviveArtifacts, delay));
    const observer = new MutationObserver(removeReviveArtifacts);
    observer.observe(document.body, { childList: true });

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(window.clearTimeout);
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (isFirstPathname.current) {
      isFirstPathname.current = false;
      return;
    }

    // The new page's <ins data-revive-zoneid> may not be in the DOM yet at
    // this exact moment — ad slots often sit inside streamed content
    // (Sidebar, RelatedColumns) that finishes rendering after the route
    // change itself. Keep checking the same way removeReviveArtifacts does,
    // and fire the reload exactly once as soon as a slot shows up.
    let fired = false;
    const tryRefresh = () => {
      if (fired) return;
      const ins = document.querySelector("[data-revive-zoneid]");
      if (!ins) return;
      fired = true;
      refreshReviveZones(ins);
    };

    tryRefresh();
    const frame = requestAnimationFrame(tryRefresh);
    const timers = [250, 1000, 3000].map(delay => window.setTimeout(tryRefresh, delay));
    const observer = new MutationObserver(tryRefresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(window.clearTimeout);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
