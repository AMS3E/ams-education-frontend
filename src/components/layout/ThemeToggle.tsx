"use client";

import { useEffect, useState } from "react";
import { css } from "@/styled-system/css";
import { SunIcon, MoonIcon, ClockIcon } from "@/components/icons";

/**
 * Cycles the page through light → dark → auto by flipping `data-theme` on
 * <html>. The colors live in Panda semantic tokens (see panda.config.ts), which
 * emit CSS variables scoped to `[data-theme="dark"]`.
 *
 * Three modes, matching the live site's toggle: light, dark, and follow the
 * time of day — auto goes dark from 18:00 to 06:00 on the visitor's clock (it
 * resolves once per visit, not on a timer). The preference persists to
 * localStorage and is applied before paint by a script in the layout, which
 * must agree with autoIsDark() below on what "night" means.
 */
type Mode = "light" | "dark" | "auto";

const ORDER: Mode[] = ["light", "dark", "auto"];

/** 18:00–05:59 is night. Duplicated in the layout's pre-paint script. */
const autoIsDark = () => {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
};

const isDark = (mode: Mode) => (mode === "auto" ? autoIsDark() : mode === "dark");

function apply(mode: Mode) {
  const root = document.documentElement;
  if (isDark(mode)) {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("light");

  // Sync with whatever the pre-paint script applied.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ams-theme");
      if (saved === "dark" || saved === "auto") setMode(saved);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  function toggle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    apply(next);
    try {
      localStorage.setItem("ams-theme", next);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  const label =
    mode === "light" ? "Theme: light. Switch to dark" : mode === "dark" ? "Theme: dark. Switch to auto (time of day)" : "Theme: auto (time of day). Switch to light";

  return (
    <span
      onClick={toggle}
      role="button"
      aria-label={label}
      title={label}
      className={css({
        display: "inline-flex",
        color: "#595959",
        cursor: "pointer",
        userSelect: "none",
        transition: "color .2s",
        _hover: { color: "#000" },
      })}
    >
      {mode === "light" ? <MoonIcon size={19} /> : mode === "dark" ? <ClockIcon size={19} /> : <SunIcon size={19} />}
    </span>
  );
}
