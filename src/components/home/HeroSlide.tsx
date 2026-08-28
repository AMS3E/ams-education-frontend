import Image from "next/image";
import { css } from "@/styled-system/css";
import type { HeroBanner } from "@/lib/hero-banners";

const root = css({
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  minHeight: { base: "500px", md: "440px" },
});

const inner = css({
  width: "100%",
  maxWidth: "1440px",
  mx: "auto",
  px: { base: "18px", md: "40px" },
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "1.05fr 0.95fr" },
  gap: "20px",
  alignItems: "center",
});

const textCol = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  py: "28px",
  zIndex: 1,
});

const eyebrow = css({ fontSize: { base: "13px", md: "16px" }, fontWeight: 700, marginBottom: "14px" });

const title = css({
  fontSize: { base: "26px", md: "42px" },
  fontWeight: 900,
  lineHeight: 1.15,
});

const subtitle = css({ fontSize: { base: "15px", md: "18px" }, marginTop: "10px", lineHeight: 1.5 });

const ctaBtn = css({
  display: "inline-flex",
  alignItems: "center",
  marginTop: "22px",
  padding: "12px 30px",
  borderRadius: "4px",
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  transition: "filter .2s, transform .2s",
  _hover: { filter: "brightness(1.08)", transform: "translateY(-2px)" },
  _active: { transform: "translateY(0)" },
});

const artCol = css({
  display: "flex",
  justifyContent: { base: "center", md: "flex-end" },
  alignItems: "flex-end",
  alignSelf: "stretch",
});

const artImg = css({
  width: "auto",
  height: "auto",
  maxWidth: "100%",
  maxHeight: { base: "230px", md: "400px" },
  objectFit: "contain",
  display: "block",
});

/** A single slide of the hero carousel: themed background + headline + CTA + artwork. */
export default function HeroSlide({
  banner,
  priority = false,
}: {
  banner: HeroBanner;
  priority?: boolean;
}) {
  const t = banner.theme;
  return (
    <div className={root} style={{ background: t.background }}>
      <div className={inner}>
        <div className={textCol}>
          <div className={eyebrow} style={{ color: t.eyebrow }}>
            {banner.eyebrow}
          </div>
          <div>
            {banner.title.map((line, i) => (
              <div key={i} className={title} style={{ color: t.title }}>
                {line}
              </div>
            ))}
          </div>
          {banner.subtitle && (
            <div className={subtitle} style={{ color: t.text }}>
              {banner.subtitle}
            </div>
          )}
          <a
            href={banner.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            className={ctaBtn}
            style={{ background: t.buttonBg, color: t.buttonText }}
          >
            {banner.cta.label}
          </a>
        </div>

        <div className={artCol}>
          <Image
            src={banner.art.src}
            alt={banner.art.alt}
            width={banner.art.width}
            height={banner.art.height}
            priority={priority}
            sizes="(max-width: 768px) 70vw, 40vw"
            className={artImg}
          />
        </div>
      </div>
    </div>
  );
}
