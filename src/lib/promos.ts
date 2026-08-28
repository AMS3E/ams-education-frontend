/** A sold display ad, delivered as a self-contained HTML creative under
 *  `public/promos/`. Rendered by `@/components/ui/AdEmbed`.
 *
 *  `width`/`height` are the creative's native pixel size — AdEmbed derives the
 *  slot's aspect ratio from them, so they must match the export.
 *
 *  Note the directory is `promos/`, not `ads/`: EasyList and most blocklists
 *  match on `/ads/` in a path and would drop the iframe outright. */
export type Promo = {
  /** Must name `index.html` outright. Next serves no directory index, and
   *  redirects the bare directory to an extensionless path that 404s. */
  src: string;
  width: number;
  height: number;
  title: string;
  /** Landing page. The creative only becomes clickable once this is set. */
  clickTag: string;
  /** Set when the creative is a FIXED-size export that does not scale itself to
   *  narrower containers (it renders at `width`px and clips). AdEmbed then scales
   *  the whole frame to fit — capped at 1× so it never upscales. The landscape
   *  creatives are internally responsive and leave this unset. */
  fixed?: boolean;
};

/** KB PRASAC Bank, portrait. Runs in the tall right/left rails of the health
 *  and obsok sections. */
export const kbPrasacPortrait: Promo = {
  src: "/promos/kb-prasac-portrait/index.html",
  width: 390,
  height: 660,
  title: "KB PRASAC Bank",
  clickTag: "",
  // This export renders at a fixed 390px and clips in a narrower column (the
  // health/obsok rails go full-width below `lg`), so it must be scaled to fit.
  fixed: true,
};

/** KB PRASAC Bank, landscape. Runs beside the lifestyle grid. This is the
 *  campaign's HALF-LANDSCAPE-SHORT cut; the taller HALF-LANDSCAPE is below. */
export const kbPrasacLandscapeShort: Promo = {
  src: "/promos/kb-prasac-landscape-short/index.html",
  width: 640,
  height: 400,
  title: "KB PRASAC Bank",
  clickTag: "",
};

/** KB PRASAC Bank, landscape. The campaign's HALF-LANDSCAPE cut — same shape as
 *  the SHORT one above but half again as large, for a wider half-width slot. It
 *  holds its 1.61 ratio at every breakpoint of the export, so it scales down
 *  cleanly. Not placed in a page yet. */
export const kbPrasacHalfLandscape: Promo = {
  src: "/promos/kb-prasac-half-landscape/index.html",
  width: 920,
  height: 570,
  title: "KB PRASAC Bank",
  clickTag: "",
};

/** KB PRASAC Bank, full-width banner. Runs across the episode page, below the
 *  player. Holds its 2.4 ratio at every one of the export's breakpoints, so it
 *  scales down to the content column cleanly. */
export const kbPrasacFullLandscape: Promo = {
  src: "/promos/kb-prasac-full-landscape/index.html",
  width: 1920,
  height: 800,
  title: "KB PRASAC Bank",
  clickTag: "",
};
