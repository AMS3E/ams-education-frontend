import Link from "next/link";
import { css } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import type { HomeCard } from "@/lib/home-data";
import { articleHref, cardLink, healthThumb } from "./styles";

// Panda needs statically-analyzable values, so the title's top margin is two
// fixed classes — tight when an episode line sits above it (health), looser when
// the title stands alone (obsok) — rather than one value computed at runtime.
const epLine = css({ fontSize: "11px", fontWeight: 700, color: "muted", marginTop: "7px" });
const titleAfterEp = css({ fontSize: "11px", color: "text", marginTop: "3px", lineHeight: 1.4 });
const titleAlone = css({ fontSize: "11px", color: "text", marginTop: "7px", lineHeight: 1.4 });

/** One health/obsok episode card: cover thumb, optional episode line, title.
 *  Shared by the desktop grid (HealthSection/ObsokSection) and the mobile
 *  two-row shelf (TwoRowShelf) so both render an identical card. No "use client"
 *  — it's presentational and mounts under a server grid and a client shelf alike. */
export default function ThumbCard({ item }: { item: HomeCard }) {
  return (
    <Link href={item.href ?? articleHref(item.slug)} className={cardLink}>
      <div className={healthThumb}>
        <CoverImage src={item.src} sizes="(max-width: 768px) 33vw, 150px" />
      </div>
      {item.ep && <div className={epLine}>{item.ep}</div>}
      <div className={item.ep ? titleAfterEp : titleAlone}>{item.title}</div>
    </Link>
  );
}
