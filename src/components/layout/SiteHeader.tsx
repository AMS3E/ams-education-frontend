import type { CSSProperties } from "react";
import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import ThemeToggle from "./ThemeToggle";
import ProgramIconStrip from "./ProgramIconStrip";
import MobileNav from "./MobileNav";
import { ChevronDownIcon, SearchIcon, UserIcon } from "@/components/icons";
import { getNavPills, getProgramIcons, PROGRAM_ICON_LABEL } from "@/lib/navigation";
import { getNavMenu } from "@/lib/categories";
import { container } from "./shared";

// The category menu. It opens on hover and on keyboard focus, so it needs no
// client JS — this component stays a Server Component. (The program-icon strip
// below it is the one exception: it highlights the program you are on, which
// means reading the pathname, which means a hook. See ProgramIconStrip.)
//
// The top bar is white in both themes (econome.kh's live masthead, verified in
// global.css — not Infotainment's dark bar this component started as), so these
// colors are literal rather than tokens; a themed surface here would fight the
// site's own always-white header.
//
// The nav stretches to the bar's full height so a section's hover target is the
// whole 64px, not just its text — which is also what puts the panel's top edge at
// the bar's bottom edge (`top: 100%`) instead of floating in the middle of it.
// Switches at `xl` (1280px), not `lg` (1024px): six section links plus a
// chevron each, plus the four colored pills further right, don't fit an
// unbreakable row below that — see MobileNav's hamburger, which switches at
// the same breakpoint so the two can never show at once.
const navRoot = css({
  display: { base: "none", xl: "flex" },
  alignSelf: "stretch",
  alignItems: "stretch",
  gap: "26px",
});

const navItem = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  "& > .ams-submenu": { display: "none" },
  _hover: { "& > .ams-submenu": { display: "block" } },
  _focusWithin: { "& > .ams-submenu": { display: "block" } },
});

const navTrigger = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  color: "#282828",
  fontSize: "15px",
  fontWeight: 500,
  whiteSpace: "nowrap",
  cursor: "pointer",
  transition: "color .2s",
  // `#menu-ams-economy .menu-item a:hover` on the live site — a muted
  // blue-gray, not black.
  _hover: { color: "#949cb0" },
});

// Colors come from data (per-pill), so they're CSS custom properties rather
// than literal `css()` values — Panda compiles atomic classes at build time,
// but that leaves `_hover` free to override both background AND (inherited)
// text color, which a plain inline `style` on the Link could not do. Matches
// the live site's pill hover exactly: `#menu-ams-economy-secondary .menu-item
// a:hover{background-color:#000;color:#fff}` — every pill goes solid black on
// hover regardless of its own color, not just a filter/brightness tweak.
const pillLink = css({
  transform: "skewX(-18deg)",
  marginLeft: "-1px",
  display: "flex",
  alignItems: "center",
  px: "26px",
  cursor: "pointer",
  textDecoration: "none",
  background: "var(--pill-bg)",
  color: "var(--pill-color)",
  transition: "background-color .2s, color .2s",
  _hover: { background: "#000000", color: "#ffffff" },
});

// White in both themes, like the live menu — it hangs off a bar that is always
// dark, so a themed surface would only ever be right half the time.
const panel = {
  position: "absolute",
  zIndex: 40,
  py: "8px",
  background: "#fff",
  borderRadius: "3px",
  boxShadow: "0 10px 34px rgba(0,0,0,.22)",
} as const;

// The caret is drawn as a bare CSS triangle sitting ON the bar, above the panel's
// own top edge — so the panel needs no border, which a border would have to be
// mitred around.
const submenu = css({
  ...panel,
  top: "100%",
  left: 0,
  minWidth: "234px",
  _before: {
    content: '""',
    position: "absolute",
    top: "-8px",
    left: "22px",
    width: 0,
    height: 0,
    borderLeft: "9px solid transparent",
    borderRight: "9px solid transparent",
    borderBottom: "9px solid #fff",
  },
});

const row = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  px: "20px",
  py: "10px",
  color: "#2b2c33",
  fontSize: "15px",
  whiteSpace: "nowrap",
  transition: "background .15s, color .15s",
  _hover: { background: "#f1f2f4", color: "#000" },
});

// A topic row (see NavSection.topics) opens its own flyout to the right of the
// section's, so it needs the same hover-reveal wiring as navItem above, one
// level deeper.
const topicItem = css({
  position: "relative",
  "& > .ams-submenu": { display: "none" },
  _hover: { "& > .ams-submenu": { display: "block" } },
  _focusWithin: { "& > .ams-submenu": { display: "block" } },
});

const topicChevron = css({ transform: "rotate(-90deg)", opacity: 0.6, flex: "0 0 auto" });

const nestedSubmenu = css({
  ...panel,
  top: 0,
  left: "100%",
  minWidth: "200px",
});

/** Shared top bar + program-icons row (used on every page via the layout). */
export default async function SiteHeader() {
  const [pills, progIcons, menu] = await Promise.all([getNavPills(), getProgramIcons(), getNavMenu()]);

  return (
    // `.site-header.header-v3` in vodi-style.css — the shadow belongs to the
    // WHOLE header (masthead + icons row as one unit), not just the icon row;
    // an earlier pass had it on the icon row alone, then dropped it entirely
    // when that turned out wrong. It's real, just on the outer element.
    <header className={css({ boxShadow: "0 4px 2px -2px rgba(0, 0, 0, 0.3)" })}>
      {/* ===== TOP BAR ===== */}
      {/* Ground truth from econome.kh's `#site-header .masthead` (global.css):
          pure white, plus a 4px red gradient rendered ONLY on the top edge via
          border-image (border-image-width's other three sides are 0). */}
      <div
        className={css({
          background: "#ffffff",
          width: "100%",
          borderTop: "4px solid transparent",
          borderImage: "linear-gradient(90deg, rgba(201,15,15,1) 0%, rgba(136,1,1,1) 100%)",
          borderImageSlice: 1,
          borderImageWidth: "4px 0px 0px 0px",
        })}
      >
        <div className={cx(container, css({ height: "64px", display: "flex", alignItems: "center", gap: { base: "14px", lg: "30px" } }))}>
          {/* Hamburger + drawer — mobile only. Fed the same data as the hover nav
              below so the two can never drift. It renders nothing on desktop. */}
          <MobileNav menu={menu} pills={pills} progIcons={progIcons} />
          <Link href="/" className={css({ display: "inline-flex", alignItems: "center", flex: "0 0 auto" })}>
            {/* Official AMS Economy brand logo (SVG on the site's CDN, `economy` bucket). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://s3.ams.com.kh/economy/2022/09/AMS-COLOUR-FULL-H28.svg" width={79} height={28} alt="AMS Economy" />
          </Link>
          {/* Section -> {news, reports}, mostly flat — 4 of the 6 sections have
              no topic tier, so the submenu lists their two leaves directly.
              The other 2 (section.topics) open a further flyout per topic,
              each with its own news/reports pair — see NavSection.topics and
              NAV_SECTIONS in categories.ts. */}
          <nav className={navRoot} aria-label="ប្រភេទអត្ថបទ">
            {menu.map((section) => (
              <div key={section.href} className={navItem}>
                <Link href={section.href} className={navTrigger}>
                  {section.label}
                  <ChevronDownIcon size={14} className={css({ opacity: 0.7 })} />
                </Link>

                <div className={cx(submenu, "ams-submenu")}>
                  {section.topics
                    ? section.topics.map((topic) => (
                        <div key={topic.href} className={topicItem}>
                          <Link href={topic.href} className={row}>
                            <span>{topic.label}</span>
                            <ChevronDownIcon size={14} className={topicChevron} />
                          </Link>
                          <div className={cx(nestedSubmenu, "ams-submenu")}>
                            {topic.leaves.map((leaf) => (
                              <Link key={leaf.href} href={leaf.href} className={row}>
                                {leaf.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))
                    : section.leaves.map((leaf) => (
                        <Link key={leaf.href} href={leaf.href} className={row}>
                          {leaf.label}
                        </Link>
                      ))}
                </div>
              </div>
            ))}
          </nav>
          <div className={css({ flex: "1" })} />
          {/* skewed colored ribbon — same `xl` switch as navRoot above */}
          <div
            className={css({
              display: { base: "none", xl: "flex" },
              alignItems: "stretch",
              height: "64px",
            })}
          >
            {pills.map((p) => (
              <Link
                key={p.slug}
                href={p.href}
                className={pillLink}
                style={{ "--pill-bg": p.background, "--pill-color": p.color } as CSSProperties}
              >
                <span
                  className={css({
                    fontSize: "15px",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  })}
                >
                  {p.label}
                </span>
              </Link>
            ))}
          </div>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "18px",
              marginLeft: "18px",
            })}
          >
            <span className={css({ display: "inline-flex", color: "#595959", cursor: "pointer", _hover: { color: "#000" } })}>
              <SearchIcon size={20} />
            </span>
            <ThemeToggle />
            <span
              className={css({
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "#d9d9df",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#555",
                cursor: "pointer",
              })}
            >
              <UserIcon size={20} />
            </span>
          </div>
        </div>
      </div>

      {/* ===== PROGRAM ICONS ROW ===== */}
      {/* Ground truth from `#site-header .vodi-navigation-v3` (global.css): a
          faint black wash over the page background, not a solid dark fill. */}
      <div
        className={css({
          display: { base: "none", xl: "block" },
          background: "rgba(0, 0, 0, 0.07)",
          width: "100%",
          paddingTop: "4px",
          paddingBottom: "4px",
          borderTopWidth: "1px",
          borderTopColor: "#bdc3c7",
          borderTopStyle: "solid",
        })}
      >
        <div
          className={cx(
            container,
            css({
              // No fixed height on the live `.site_header__secondary-nav-v3`
              // (`display:flex;align-items:center;` only) — height comes from
              // content (~48px: the link's own padding + the 26px icon), not
              // a hardcoded box. The 64px this used to carry left extra empty
              // space top/bottom the real row never has.
              display: "flex",
              alignItems: "center",
              // `.site_header__secondary-nav-v3{padding-right:10% !important}`
              // on education.ams.com.kh's own live page (2026-08-26) — pulls
              // the whole row in from the right edge, but that's a DESKTOP
              // rule: applied unconditionally it reserves ~10% of the row for
              // nothing and right-packs the icons against it, which below
              // `xl` (where there's much less width to spare) leaves a dead
              // gap on the left instead of the strip starting flush and
              // scrolling. Below `xl` it reads left-to-right like any other
              // swipeable row.
              justifyContent: { base: "flex-start", xl: "flex-end" },
              gap: "18px",
              paddingRight: { base: 0, xl: "10%" },
              overflowX: "auto",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
            }),
          )}
        >
          {/* Dropped below `sm` — at phone width it eats space the icon strip
              needs more, and the icons are self-explanatory without it. */}
          <span
            className={css({
              display: { base: "none", sm: "inline" },
              color: "#8e8e8e",
              fontSize: "17px",
              whiteSpace: "nowrap",
              marginRight: "4px",
            })}
          >
            {PROGRAM_ICON_LABEL}
          </span>
          <ProgramIconStrip icons={progIcons} />
        </div>
      </div>
    </header>
  );
}
