import Link from "next/link";
import { css } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import type { TeamMember } from "@/lib/authors";

/** ក្រុមការងារ — the newsroom, as avatar + name rows, each linking to the
 *  author's /author/<slug> archive as the live block does. */
export default function TeamList({ members }: { members: TeamMember[] }) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" })}>
      {members.map((m) => (
        <Link
          key={m.id}
          href={`/author/${m.slug}`}
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "14px",
            color: "inherit",
            textDecoration: "none",
            _hover: { "& .tm-n": { color: "brand.blue" } },
          })}
        >
          <div
            className={css({
              width: "40px",
              height: "40px",
              flex: "0 0 auto",
              position: "relative",
              borderRadius: "50%",
              overflow: "hidden",
            })}
          >
            <CoverImage src={m.avatar} sizes="40px" />
          </div>
          <span className={css({ fontSize: "15px", fontWeight: 600, color: "text", transition: "color .2s" })}>
            <span className="tm-n">{m.name}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
