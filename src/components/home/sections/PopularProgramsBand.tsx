import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import { container } from "@/components/layout/shared";
import type { FeaturedProgram } from "@/lib/navigation";
import { rowLink } from "./styles";
import { programHref } from "@/lib/programs";

/** Full-width dark band: a "popular movies" ranking on the left and the
 *  "AMS Infotainment special programs" grid on the right.
 *
 *  Two lists, not one: live runs 9 in the ranking and 8 in the grid. */
export default function PopularProgramsBand({
  popular,
  special,
}: {
  popular: FeaturedProgram[];
  special: FeaturedProgram[];
}) {
  return (
    // Dark in both themes — re-scope the theme tokens so the poster placeholders
    // inside don't resolve to their light-mode grays.
    <div data-theme='dark' className={css({ background: "#111219", width: "100%", padding: "40px 0" })}>
      <div
        className={cx(
          container,
          css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", md: "1fr 1fr" },
            gap: "48px",
          }),
        )}>
        {/* ranking */}
        <div>
          <div
            className={css({
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.02)",
              padding: "16px 36px",
            })}>
            <h2
              className={css({
                padding: "13px 20px",
                fontSize: "22px",
                color: "#fff",
                borderBottom: "1px solid rgba(255,255,255,.08)",
              })}>
              ភាពយន្តពេញនិយម
            </h2>
            {popular.map((p, i) => (
              <Link key={p.slug} href={programHref(p.slug)} className={rowLink}>
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                    padding: "13px 20px",
                    borderBottom: "1px solid rgba(255,255,255,.08)",
                    transition: "background .2s",
                    _hover: { background: "rgba(255,255,255,.04)" },
                  })}>
                  <span
                    className={css({
                      fontSize: "30px",
                      fontWeight: 900,
                      color: "#5a5b66",
                      minWidth: "30px",
                      textAlign: "center",
                    })}>
                    {i + 1}
                  </span>
                  <div>
                    <div className={css({ color: "#8a8b94", fontSize: "11px" })}>{p.year}</div>
                    <div className={css({ color: "#e6e7ec", fontSize: "16px", fontWeight: 500, marginTop: "2px" })}>
                      {p.title}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        {/* new programs */}
        <div>
          <h2 className={css({ margin: "0 0 16px", fontSize: "22px", color: "#fff" })}>កម្មវិធីពិសេសរបស់ AMS INFOTAINMENT</h2>
          <div
            className={css({
              position: "relative",
              display: "grid",
              gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
              columnGap: "48px",
            })}>
            <div
              className={css({
                display: { base: "none", sm: "block" },
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: "1px",
                background: "rgba(255,255,255,.1)",
              })}
            />
            {special.map(p => (
              <Link key={p.slug} href={programHref(p.slug)} className={rowLink}>
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "14px 0",
                    borderBottom: "1px solid rgba(255,255,255,.08)",
                  })}>
                  <div
                    className={css({
                      width: "66px",
                      height: "98px",
                      overflow: "hidden",
                      flex: "0 0 auto",
                      position: "relative",
                    })}>
                    <CoverImage src={p.image} sizes='65px' />
                  </div>
                  <div>
                    <div className={css({ color: "#8a8b94", fontSize: "11px" })}>{p.year}</div>
                    <div
                      className={css({
                        color: "#e6e7ec",
                        fontSize: "14px",
                        fontWeight: 600,
                        lineHeight: 1.4,
                        marginTop: "2px",
                      })}>
                      {p.title}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
