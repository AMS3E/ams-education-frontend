// Shared style helpers for the homepage sections. Extracted verbatim from the
// old monolithic page.tsx so the sections render pixel-for-pixel the same.
// Panda needs statically-analyzable values, hence one class per aspect ratio.
import { css } from "@/styled-system/css";

const thumbBase = {
  position: "relative",
  width: "100%",
  overflow: "hidden",
  cursor: "pointer",
  "& img": { transition: "transform .45s ease" },
  _hover: { "& img": { transform: "scale(1.06)" } },
} as const;

export const thumb16x11 = css({ ...thumbBase, aspectRatio: "16/11" });

// Health/obsok cards: 3:4 on mobile, but on desktop the thumb grows to fill its
// cell so the two rows line up with the full height of the tall ad beside them.
export const healthThumb = css({
  ...thumbBase,
  aspectRatio: { base: "3/4", lg: "auto" },
  flex: { base: "0 0 auto", lg: "1 1 0" },
  minHeight: { lg: 0 },
});

export const cardLink = css({ display: "flex", flexDirection: "column", color: "inherit", textDecoration: "none" });
export const rowLink = css({ display: "block", color: "inherit", textDecoration: "none" });

// Health/obsok layout. The dense 6×2 grid is a desktop-only affair: below `lg` a
// two-row swipe shelf (TwoRowShelf) takes its place, so the grid hides and the
// shelf shows at the same breakpoint. On desktop the grid fills its flex column
// so its two rows line up with the tall ad beside it.
export const episodeGrid = css({
  display: { base: "none", lg: "grid" },
  gridTemplateColumns: "repeat(6,1fr)",
  gridAutoRows: "1fr",
  gap: "10px",
  flex: "1",
  minHeight: 0,
});
export const belowLg = css({ display: { base: "block", lg: "none" } });

export const cardTitle = css({ fontSize: "12.5px", fontWeight: 600, color: "text", marginTop: "9px", lineHeight: 1.5 });
export const cardTag = css({ fontSize: "11px", color: "muted", marginTop: "5px" });

export const cta = css({
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "filter .2s, opacity .2s",
  _hover: { filter: "brightness(1.08)" },
});

export const articleHref = (slug: string) => `/article/${slug}`;
