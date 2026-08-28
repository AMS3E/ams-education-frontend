"use client";

import { useSyncExternalStore } from "react";
import { Segmented } from "./ui";

/* -------------------------------------------------------------------------- *
 * Theme control. Lived in AdminTopBar until that bar was removed; it now sits
 * in the sidebar foot, and is a segmented switcher rather than a cycling icon
 * button — three visible options beat one button whose next state you have to
 * remember.
 *
 * This reuses the SITE's existing mechanism rather than adding a second one:
 * the root layout already ships a pre-paint script that reads `ams-theme` from
 * localStorage and stamps `data-theme` on <html>, and the public header's
 * ThemeToggle already writes that key. Two mechanisms would fight over the same
 * attribute. `auto` therefore means what it means on the public site — the
 * visitor's CLOCK, dark from 18:00 to 06:00 — and autoIsDark() below must stay
 * in step with the copy in src/app/layout.tsx.
 * -------------------------------------------------------------------------- */

type Mode = "light" | "dark" | "auto";

const autoIsDark = () => {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
};

function applyTheme(mode: Mode) {
  const dark = mode === "auto" ? autoIsDark() : mode === "dark";
  const root = document.documentElement;
  if (dark) root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

/* The stored mode is EXTERNAL state — it lives in localStorage, is written by
 * the public site's toggle as well as this one, and is applied before React
 * ever runs by the root layout's pre-paint script. So it is read with
 * useSyncExternalStore rather than mirrored into component state in an effect,
 * which is both what the repo's React-compiler lint requires and the reason it
 * requires it: the effect version renders once with the wrong value and then
 * corrects itself.
 *
 * `storage` only fires in OTHER documents, so same-tab writes notify through
 * our own listener set. */
let listeners: (() => void)[] = [];

function subscribeTheme(cb: () => void) {
  listeners.push(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners = listeners.filter(l => l !== cb);
    window.removeEventListener("storage", cb);
  };
}

function readMode(): Mode {
  try {
    const v = localStorage.getItem("ams-theme");
    return v === "dark" || v === "auto" ? v : "light";
  } catch {
    return "light";
  }
}

/** The server has no localStorage, and the pre-paint script has not run yet at
 *  render time — so both sides agree on "light" and the script's stamp on
 *  <html> is what actually paints. No hydration mismatch, no flash. */
const serverMode = (): Mode => "light";

function writeMode(mode: Mode) {
  try {
    localStorage.setItem("ams-theme", mode);
  } catch {
    // private mode / storage disabled — the attribute still applies for now
  }
  applyTheme(mode);
  listeners.forEach(l => l());
}

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto" },
];

export default function ThemeControl() {
  const mode = useSyncExternalStore(subscribeTheme, readMode, serverMode);

  return <Segmented<Mode> value={mode} options={OPTIONS} onChange={writeMode} size="sm" stretch ariaLabel="Colour theme" />;
}
