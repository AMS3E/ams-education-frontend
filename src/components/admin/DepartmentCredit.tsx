"use client";

import { useEffect, useRef, useState } from "react";
import { css, cx } from "@/styled-system/css";
import { ac } from "./tokens";
import { Icon } from "./icons";

type Person = {
  honorific: "Mr." | "Ms.";
  name: string;
  role: string;
  detail?: string;
  photo: string;
};

const HEAD: Person = { honorific: "Mr.", name: "SAY Prumny", role: "Deputy Head of Digital", photo: "/team/say-prumny.webp" };
const LEAD: Person = {
  honorific: "Mr.",
  name: "CHHIN Pov",
  role: "Lead Web Developer",
  detail: "(Economy + Education Admin Dashboard Developer)",
  photo: "/team/chhin-pov.webp",
};
const SENIOR: Person = {
  honorific: "Mr.",
  name: "SOTH Kimleng",
  role: "Full-stack Developer",
  detail: "(Infotainment Admin Dashboard Developer)",
  photo: "/team/soth-kimleng.webp",
};
const TEAM: Person[] = [
  { honorific: "Ms.", name: "HENG PenhPonleu", role: "Junior Web Developer", photo: "/team/heng-penhponleu.webp" },
  { honorific: "Mr.", name: "KEA Daron", role: "Junior Full-stack Developer", photo: "/team/kea-daron.webp" },
  { honorific: "Mr.", name: "SOEURN Visal", role: "Junior Full-stack Developer", photo: "/team/soeurn-visal.webp" },
];

const INK = "#F5F5F7";
const INK_SUB = "rgba(245,245,247,0.62)";
const INK_FAINT = "rgba(245,245,247,0.40)";
const GROUND = "#0B0B0E";
// Education logo palette: deep royal blue through its sky-blue highlight.
const BLUE_DEEP = "#182DA0";
const BLUE_MID = "#1765C2";
const BLUE_SKY = "#1AA3E2";
const RING = `conic-gradient(from 210deg, ${BLUE_DEEP}, ${BLUE_MID} 30%, ${BLUE_SKY} 55%, ${BLUE_MID} 80%, ${BLUE_DEEP})`;
const LINE_V = `linear-gradient(180deg, ${BLUE_SKY}, ${BLUE_MID})`;
const LINE_H = `linear-gradient(90deg, ${BLUE_MID}, ${BLUE_SKY} 50%, ${BLUE_MID})`;
const LINE_GLOW = "0 0 14px rgba(26,163,226,0.38)";
const ease = "cubic-bezier(0.2, 0.7, 0.2, 1)";

const overlay = css({
  position: "fixed", inset: 0, zIndex: 1000050, display: "flex", overflowY: "auto",
  padding: { base: "16px", sm: "32px" }, background: "rgba(4,4,6,0.78)", backdropFilter: "blur(8px)",
  animation: "adminFadeIn 240ms ease both", _motionReduce: { animation: "none" },
});
const panel = css({
  margin: "auto", position: "relative", width: "min(680px, 100%)", borderRadius: "24px",
  padding: { base: "28px 20px 32px", sm: "40px 44px 44px" }, overflow: "hidden",
  animation: `adminZoomIn 380ms ${ease} both`, _motionReduce: { animation: "none" },
});
const closeBtn = css({
  position: "absolute", top: "16px", right: "16px", width: "36px", height: "36px", borderRadius: "999px",
  display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  transition: "background .13s ease, border-color .13s ease", _hover: { background: "rgba(255,255,255,0.10)" },
  _focusVisible: { outline: "2px solid rgba(255,255,255,0.85)", outlineOffset: "2px" },
});
const eyebrow = css({ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" });
const title = css({ fontSize: { base: "26px", sm: "34px" }, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: "10px" });
const rule = css({ height: "1px", marginTop: "26px", marginBottom: "30px" });
const tier = css({
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  animation: `adminRise 560ms ${ease} both`, _motionReduce: { animation: "none" },
});
const ring = css({ display: "block", borderRadius: "50%", padding: "4px", flex: "none" });
const photo = css({ display: "block", width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--dept-ground)" });
const SIZE = {
  head: css({ width: { base: "124px", sm: "156px" }, height: { base: "124px", sm: "156px" } }),
  lead: css({ width: { base: "104px", sm: "122px" }, height: { base: "104px", sm: "122px" } }),
  senior: css({ width: { base: "92px", sm: "108px" }, height: { base: "92px", sm: "108px" } }),
  member: css({ width: { base: "76px", sm: "92px" }, height: { base: "76px", sm: "92px" } }),
} as const;
const GLOW = {
  head: "0 0 0 1px rgba(255,255,255,0.06), 0 0 56px rgba(23,101,194,0.58), 0 18px 40px rgba(0,0,0,0.6)",
  lead: "0 0 0 1px rgba(255,255,255,0.06), 0 0 40px rgba(23,101,194,0.46), 0 14px 32px rgba(0,0,0,0.55)",
  senior: "0 0 0 1px rgba(255,255,255,0.06), 0 0 32px rgba(23,101,194,0.40), 0 12px 28px rgba(0,0,0,0.5)",
  member: "0 0 0 1px rgba(255,255,255,0.06), 0 0 24px rgba(23,101,194,0.34), 0 10px 24px rgba(0,0,0,0.5)",
} as const;
const caption = css({ marginTop: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" });
const honorificCls = css({ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" });
const NAME = {
  head: css({ fontSize: { base: "17px", sm: "19px" }, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2 }),
  lead: css({ fontSize: { base: "15px", sm: "16.5px" }, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2 }),
  senior: css({ fontSize: { base: "14.5px", sm: "15.5px" }, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2 }),
  member: css({ fontSize: { base: "12.5px", sm: "13.5px" }, fontWeight: 800, letterSpacing: "-0.005em", lineHeight: 1.25 }),
} as const;
const roleCls = css({ fontSize: { base: "9.5px", sm: "10.5px" }, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1.4, marginTop: "2px" });
const detailCls = css({ fontSize: { base: "12.5px", sm: "13.5px" }, fontWeight: 500, lineHeight: 1.45, marginTop: "2px", maxWidth: "52ch" });
const spine = css({ display: "flex", flexDirection: "column", alignItems: "center" });
const spineLine = css({ width: "2px", height: "26px" });
const fan = css({ position: "relative", width: "100%", marginTop: 0 });
const fanBar = css({ position: "absolute", top: 0, left: "calc(100% / 6)", right: "calc(100% / 6)", height: "2px" });
const teamGrid = css({ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: { base: "6px", sm: "16px" } });
const teamCol = css({ display: "flex", flexDirection: "column", alignItems: "center" });
const stub = css({ width: "2px", height: "26px" });

function Portrait({ person, level, delay }: { person: Person; level: keyof typeof SIZE; delay: number }) {
  return (
    <figure className={tier} style={{ animationDelay: `${delay}ms`, margin: 0 }}>
      <span className={cx(ring, SIZE[level])} style={{ background: RING, boxShadow: GLOW[level] }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static local portrait assets */}
        <img src={person.photo} alt={`${person.honorific} ${person.name}`} width={512} height={512} decoding="async" className={photo} />
      </span>
      <figcaption className={caption}>
        <span className={honorificCls} style={{ color: INK_FAINT }}>{person.honorific}</span>
        <span className={NAME[level]} style={{ color: INK }}>{person.name}</span>
        <span className={roleCls} style={{ color: BLUE_SKY }}>{person.role}</span>
        {person.detail ? <span className={detailCls} style={{ color: INK_SUB }}>{person.detail}</span> : null}
      </figcaption>
    </figure>
  );
}

function Spine({ delay }: { delay: number }) {
  return <div className={cx(spine, tier)} style={{ animationDelay: `${delay}ms` }}><span className={spineLine} style={{ background: LINE_V, boxShadow: LINE_GLOW }} /></div>;
}

function DepartmentChart({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <div className={overlay} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="dept-title" onClick={(event) => event.stopPropagation()} className={panel}
        style={{
          ["--dept-ground" as string]: GROUND,
          color: INK,
          background: `radial-gradient(70% 42% at 50% -6%, rgba(26,163,226,0.30), transparent 70%), radial-gradient(46% 30% at 50% 104%, rgba(24,45,160,0.42), transparent 70%), ${GROUND}`,
          border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.6)",
        }}>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={closeBtn}
          style={{ color: INK, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <Icon name="x" size={16} strokeWidth={2} />
        </button>
        <div className={eyebrow} style={{ color: BLUE_SKY }}>Apsara Media Services</div>
        <h2 id="dept-title" className={title} style={{ color: INK }}>Digital Department</h2>
        <div className={rule} style={{ background: `linear-gradient(90deg, transparent, ${BLUE_MID} 30%, ${BLUE_SKY} 50%, ${BLUE_MID} 70%, transparent)` }} />
        <Portrait person={HEAD} level="head" delay={60} />
        <Spine delay={180} />
        <Portrait person={LEAD} level="lead" delay={260} />
        <Spine delay={360} />
        <Portrait person={SENIOR} level="senior" delay={420} />
        <Spine delay={520} />
        <div className={fan}>
          <div className={cx(fanBar, tier)} style={{ background: LINE_H, boxShadow: LINE_GLOW, animationDelay: "560ms" }} />
          <div className={teamGrid}>
            {TEAM.map((person, index) => (
              <div key={person.name} className={teamCol}>
                <span className={cx(stub, tier)} style={{ background: LINE_V, boxShadow: LINE_GLOW, animationDelay: `${600 + index * 70}ms` }} />
                <Portrait person={person} level="member" delay={640 + index * 70} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const credit = css({ fontSize: "12px", lineHeight: 1.6, textAlign: "center", margin: 0 });
const linkBtn = css({
  background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 600, cursor: "pointer", borderRadius: "3px",
  color: { base: "#1840AB", _dark: "#48B8F0" },
  textDecoration: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px", textDecorationColor: "transparent",
  transition: "text-decoration-color .13s ease", _hover: { textDecorationColor: "currentColor" },
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px", textDecorationColor: "currentColor" },
});

export default function DepartmentCredit() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  return (
    <>
      <p className={credit} style={{ color: ac.muted }}>
        Developed by{" "}
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={linkBtn}>
          Digital Department
        </button>
      </p>
      {open ? <DepartmentChart onClose={close} /> : null}
    </>
  );
}
