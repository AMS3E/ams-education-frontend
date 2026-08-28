import Link from "next/link";
import { css } from "@/styled-system/css";
import CoverImage from "@/components/ui/CoverImage";
import { container } from "@/components/layout/shared";
import { programHref } from "@/lib/programs";
import type { FeaturedProgram } from "@/lib/navigation";

const flow = [
  { number: "១", title: "ជ្រើសរើសកម្មវិធី", copy: "Choose a program" },
  { number: "២", title: "ជ្រើសរើសវគ្គ", copy: "Choose an episode" },
  { number: "៣", title: "ទស្សនាវីដេអូ", copy: "Watch the video" },
];

export default function ProgramIndex({ programs }: { programs: FeaturedProgram[] }) {
  return (
    <main>
      <section className={css({ background: "hero.bg", borderBottom: "1px solid", borderColor: "divider" })}>
        <div className={css({ maxWidth: "1100px", mx: "auto", px: { base: "18px", md: "24px" }, py: { base: "42px", md: "58px" }, textAlign: "center" })}>
          <p className={css({ m: 0, color: "brand.red", fontSize: "12px", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase" })}>
            AMS Programs
          </p>
          <h1 className={css({ m: "8px 0 0", color: "text", fontSize: { base: "30px", md: "42px" }, fontWeight: 600, lineHeight: 1.35 })}>
            កម្មវិធីទាំងអស់
          </h1>
          <p className={css({ maxWidth: "610px", mx: "auto", mt: "12px", color: "muted", fontSize: { base: "13px", md: "15px" }, lineHeight: 1.8 })}>
            ជ្រើសរើសកម្មវិធីដែលអ្នកចូលចិត្ត រួចជ្រើសរើសវគ្គ និងទស្សនាវីដេអូ។
          </p>

          <ol className={css({ listStyle: "none", m: { base: "30px 0 0", md: "38px 0 0" }, p: 0, display: "grid", gridTemplateColumns: { base: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: { base: "10px", md: "18px" } })}>
            {flow.map((step, index) => (
              <li key={step.number} className={css({ position: "relative", display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: "12px", alignItems: "center", p: "14px", textAlign: "left", background: "page.bg", border: "1px solid", borderColor: "divider", borderRadius: "4px", boxShadow: "0 6px 20px rgba(0,0,0,.05)" })}>
                <span className={css({ width: "42px", height: "42px", display: "grid", placeItems: "center", borderRadius: "50%", background: "brand.red", color: "white", fontSize: "17px", fontWeight: 700 })}>
                  {step.number}
                </span>
                <span>
                  <strong className={css({ display: "block", color: "text", fontSize: "14px", fontWeight: 600 })}>{step.title}</strong>
                  <span className={css({ display: "block", mt: "2px", color: "muted", fontSize: "11px" })}>{step.copy}</span>
                </span>
                {index < flow.length - 1 && (
                  <span aria-hidden className={css({ display: { base: "none", md: "block" }, position: "absolute", zIndex: 2, right: "-15px", top: "50%", transform: "translateY(-50%)", color: "muted", fontSize: "18px" })}>→</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={css({ py: { base: "34px", md: "50px" } })}>
        <div className={container}>
          <div className={css({ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "20px", mb: "24px" })}>
            <div>
              <h2 className={css({ m: 0, color: "text", fontSize: { base: "22px", md: "28px" }, fontWeight: 600 })}>ជ្រើសរើសកម្មវិធី</h2>
              <p className={css({ m: "5px 0 0", color: "muted", fontSize: "12px" })}>{programs.length} កម្មវិធី</p>
            </div>
          </div>

          <div className={css({ display: "grid", gridTemplateColumns: { base: "repeat(2, minmax(0,1fr))", sm: "repeat(3, minmax(0,1fr))", lg: "repeat(5, minmax(0,1fr))" }, gap: { base: "24px 14px", md: "32px 20px" } })}>
            {programs.map(program => (
              <Link key={program.slug} href={programHref(program.slug)} className={css({ display: "block", color: "inherit", textDecoration: "none", _hover: { "& img": { transform: "scale(1.05)" }, "& h3": { color: "brand.red" } } })}>
                <div className={css({ position: "relative", aspectRatio: "2/3", overflow: "hidden", background: "skeleton.base", borderRadius: "3px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", "& img": { transition: "transform .4s ease" } })}>
                  <CoverImage src={program.image} alt={program.title} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 210px" />
                </div>
                <div className={css({ pt: "11px" })}>
                  {program.year && <p className={css({ m: 0, color: "muted", fontSize: "11px" })}>{program.year}</p>}
                  <h3 className={css({ m: "3px 0 0", color: "text", fontSize: "13px", fontWeight: 600, lineHeight: 1.5, transition: "color .2s" })}>{program.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
