import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // Panda's baseline CSS reset.
  preflight: true,

  // Where to look for style usage (css(), patterns, recipes, jsx).
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],

  // Enables the styled() JSX factory + prop typings.
  jsxFramework: "react",

  // Our dark mode is driven by a `data-theme` attribute on <html> (set by
  // ThemeToggle), so point Panda's `_dark` condition at that selector instead
  // of the default `.dark &`.
  conditions: {
    extend: {
      dark: '[data-theme="dark"] &',
      light: '[data-theme="light"] &',
    },
  },

  theme: {
    extend: {
      // Sweeps the `sheen` band of CoverImage's placeholder gradient across the
      // tile, left to right. Paired with `backgroundSize: 200% 100%`, so 100% ->
      // 0% moves the highlight the full width of the element exactly once.
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "0% 0" },
        },
      },

      tokens: {
        colors: {
          // Fixed brand colors used across the site.
          brand: {
            blue: { value: "#1a5fd0" },
            orange: { value: "#e0533e" },
            pink: { value: "#e0264f" },
            green: { value: "#0f9d58" },
            red: { value: "#dd1111" },
          },
        },
      },
      semanticTokens: {
        // Elevation. Dark mode does not just reuse the light shadows — on a
        // near-black canvas a 5%-black shadow is invisible, so depth there comes
        // from a deeper, wider shadow plus the lighter surface step.
        shadows: {
          adminSm: {
            value: {
              base: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)",
              _dark: "0 1px 2px rgba(0,0,0,0.40)",
            },
          },
          adminMd: {
            value: {
              base: "0 8px 24px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.05)",
              _dark: "0 12px 28px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.40)",
            },
          },
        },
        colors: {
          // Theme-aware tokens (light default / dark override). These generate
          // CSS variables that flip based on the `data-theme` attribute.
          page: {
            bg: { value: { base: "#ffffff", _dark: "#0e0e12" } },
          },
          text: { value: { base: "#1a1a22", _dark: "#ececed" } },
          muted: { value: { base: "#8a8a93", _dark: "#8b8c95" } },
          hero: {
            bg: { value: { base: "#eef0f3", _dark: "#1a1b22" } },
            sub: { value: { base: "#555555", _dark: "#b8b9c0" } },
          },
          divider: { value: { base: "#e6e7ea", _dark: "rgba(255,255,255,0.1)" } },

          // Image placeholder surface (see CoverImage). `base` is the resting
          // color — also the whole of the empty/broken state — and `sheen` is the
          // brighter band the shimmer sweeps across while an image loads.
          //
          // Sections painted dark in *both* themes (PosterBand, PopularProgramsBand,
          // VideoFeatureStrip) carry their own `data-theme="dark"`, which is what
          // makes these resolve to the dark values there even in light mode.
          skeleton: {
            base: { value: { base: "#e9eaee", _dark: "#20212a" } },
            sheen: { value: { base: "#f4f5f7", _dark: "#2c2d38" } },
          },

          // Floating controls that sit ON another surface (carousel arrows), so
          // they can't inherit `page.bg` — inside a dark band that would make
          // them invisible. They stay one step lighter than whatever is behind.
          control: {
            bg: { value: { base: "#ffffff", _dark: "#20212a" } },
            fg: { value: { base: "#15161d", _dark: "#ececed" } },
          },

          // The program page's cinematic hero band, read top-to-bottom as a
          // radial gradient. Dark values are the design's; light values fade the
          // same shape into the page so the title still reads.
          programHero: {
            from: { value: { base: "#f2f3f6", _dark: "#2a2d33" } },
            mid: { value: { base: "#e9ebef", _dark: "#14161a" } },
            to: { value: { base: "#ffffff", _dark: "#0a0a0a" } },
          },

          /* ================================================================
           * ADMIN — the dashboard tool's palette.
           * ----------------------------------------------------------------
           * Kept in Panda semantic tokens (rather than the plain literal map
           * `ac` used to be) for ONE reason: dark mode. `ac` is consumed
           * through inline `style` in dozens of places, and an inline literal
           * hex cannot respond to a theme. As CSS variables those same call
           * sites keep working untouched and simply resolve per theme — see
           * src/components/admin/tokens.ts.
           *
           * The dark column is SELECTED, not an inversion: its own steps
           * against the dark surface.
           *
           * MEASURED, not eyeballed (2026-08-05):
           *  - The four categorical hues pass the dataviz validator on ALL
           *    pairs in both modes — lightness band, chroma floor, CVD
           *    separation, normal-vision floor and contrast vs surface.
           *    Four is the ceiling: six failed all-pairs CVD, and past four
           *    the rule is to facet or fold into "Other", never add a hue.
           *  - Every text and status role clears WCAG AA (4.5:1) against
           *    surface, canvas AND sunken; `faint` and the focus ring clear
           *    3:1. Hairlines are deliberately below that — a row separator
           *    carries no information a control's border would.
           * ================================================================ */
          admin: {
            // Surfaces. NEUTRAL — no hue cast in either direction (saturation
            // ~0.06, which is as close to grey as 8-bit hex gets).
            //
            // This palette has now been cool slate, then warm cream, and landed
            // here. Both of the first two were wrong for the same underlying
            // reason: a tinted neutral takes a position relative to the logo, and
            // the AMS mark spans violet → crimson → gold, so ANY cast either
            // fights part of it (cool slate against the warm end) or muddies
            // against it (cream reading as beige). A true neutral takes no
            // position at all, which is exactly what you want under a
            // multi-hue mark — the logo supplies the colour, the shell supplies
            // the quiet. Do not re-tint these.
            canvas: { value: { base: "#F7F7F8", _dark: "#0C0C0E" } },
            surface: { value: { base: "#FFFFFF", _dark: "#151518" } },
            surfaceHover: { value: { base: "#F3F3F5", _dark: "#1E1E22" } },
            surfaceSunken: { value: { base: "#EEEEF0", _dark: "#09090B" } },
            rowLine: { value: { base: "#EEEEF0", _dark: "#252528" } },
            border: { value: { base: "#E3E3E6", _dark: "#2C2C30" } },
            borderStrong: { value: { base: "#C7C7CC", _dark: "#46464C" } },

            // Ink — neutral greys, measured against ALL FOUR surfaces above, not
            // just one. `faint` is decorative/placeholder, but it also carries
            // chart axis labels, so it clears 3:1; #888892 rather than a lighter
            // step because anything lighter drops to 2.91 on `surfaceSunken`.
            text: { value: { base: "#18181B", _dark: "#F4F4F5" } },
            sub: { value: { base: "#52525B", _dark: "#C0C0C6" } },
            muted: { value: { base: "#6B6B75", _dark: "#96969E" } },
            faint: { value: { base: "#888892", _dark: "#75757D" } },

            // TEAL — one accent again, for fills, selection AND clickable text.
            //
            // The history is worth keeping, because each step was a real answer
            // to a real problem and the next one only makes sense against it:
            // AMS red (collided with `danger`), then Strapi violet, then a split
            // of neutral fills with violet ink. The split existed because a
            // NEUTRAL accent renders link text at 1.00:1 against body text —
            // pixel-identical, undiscoverable, a WCAG 1.4.1 failure. A coloured
            // accent does not have that problem, so the split is unnecessary
            // here and the palette collapses back to one hue.
            //
            // Teal, specifically, because it is the complement of a mark that
            // runs violet → crimson → gold. It is the one strong hue that cannot
            // be mistaken for brand chrome, and it stays clear of `warn` (amber)
            // and `danger` (red), so an action never reads as a warning.
            //
            // `accentText` is a DEEPER step than the fill: #0E7C7B as text drops
            // to 4.35 on `surfaceSunken`, which misses AA. The fill does not care
            // — it is measured against the white on top of it, not the page.
            accent: { value: { base: "#0E7C7B", _dark: "#17A8A4" } },
            accentHover: { value: { base: "#0A6160", _dark: "#22C3BE" } },
            // Theme-aware: white on the light fill, near-black on the brighter
            // dark fill. Never hardcode white in its place.
            accentFg: { value: { base: "#FFFFFF", _dark: "#0B0A0C" } },
            accentText: { value: { base: "#0B6664", _dark: "#5EEAD4" } },
            accentTint: { value: { base: "rgba(14,124,123,0.08)", _dark: "rgba(23,168,164,0.16)" } },

            // Status. Colour INFORMS; it is never the only channel — every use
            // ships with a label, and usually an icon.
            good: { value: { base: "#15803D", _dark: "#4ADE80" } },
            goodTint: { value: { base: "rgba(21,128,61,0.09)", _dark: "rgba(74,222,128,0.14)" } },
            warn: { value: { base: "#B45309", _dark: "#FBBF24" } },
            warnTint: { value: { base: "rgba(180,83,9,0.10)", _dark: "rgba(251,191,36,0.14)" } },
            danger: { value: { base: "#B42318", _dark: "#FF7B72" } },
            dangerTint: { value: { base: "rgba(180,35,24,0.08)", _dark: "rgba(255,123,114,0.13)" } },
            // Destructive BUTTON fill, which needs white on it at 4.5:1 — the
            // dark `danger` above is a text step and is far too light for that.
            dangerFill: { value: { base: "#B42318", _dark: "#C4362E" } },
            neutralTint: { value: { base: "rgba(107,107,117,0.08)", _dark: "rgba(192,192,198,0.12)" } },

            // Data. Slot 1 deliberately sits in the SAME teal family as the
            // accent — one cool hue for the whole tool rather than an accent and
            // an unrelated chart colour arguing with each other. It is a step
            // deeper and less green than the old #0D9488: on cool slate that
            // read as a minty wash, which is most of why the charts felt
            // generic. The hue was never really the problem — a cool mint on a
            // cool grey ground was.
            //
            // Warm hues were considered for this and rejected: amber already
            // means `warn` and red already means `danger`, so a chart drawn in
            // the brand's own orange stops being readable as data.
            data: { value: { base: "#0E7C7B", _dark: "#2FB8B2" } },
            dataSoft: { value: { base: "rgba(14,124,123,0.12)", _dark: "rgba(47,184,178,0.18)" } },
            cat2: { value: { base: "#2563EB", _dark: "#2563EB" } },
            cat3: { value: { base: "#D97706", _dark: "#D97706" } },
            cat4: { value: { base: "#A21CAF", _dark: "#AE2ABE" } },

            // Tracks `accentText`, so focus is unmistakably the interaction
            // colour. Clears the 3:1 WCAG 1.4.11 asks of a non-text indicator
            // against surface, canvas and sunken in both themes.
            focus: { value: { base: "#0B6664", _dark: "#5EEAD4" } },
            overlay: { value: { base: "rgba(24,24,27,0.45)", _dark: "rgba(0,0,0,0.62)" } },
            skeletonBase: { value: { base: "#EEEEF0", _dark: "#1E1E22" } },
            skeletonSheen: { value: { base: "#F7F7F8", _dark: "#28282D" } },
          },
        },
      },
    },
  },

  // Emit under src/ so it resolves through the existing `@/*` path alias.
  outdir: "src/styled-system",
});
