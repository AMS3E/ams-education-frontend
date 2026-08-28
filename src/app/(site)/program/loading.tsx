import { css } from "@/styled-system/css";
import { container } from "@/components/layout/shared";

export default function ProgramsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading programs">
      <div className={css({ height: { base: "390px", md: "350px" }, background: "hero.bg", borderBottom: "1px solid", borderColor: "divider" })} />
      <div className={container}>
        <div className={css({ height: "34px", width: "220px", mt: "48px", mb: "24px", background: "skeleton.base", borderRadius: "3px" })} />
        <div className={css({ display: "grid", gridTemplateColumns: { base: "repeat(2, minmax(0,1fr))", sm: "repeat(3, minmax(0,1fr))", lg: "repeat(5, minmax(0,1fr))" }, gap: { base: "24px 14px", md: "32px 20px" } })}>
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index}>
              <div className={css({ aspectRatio: "2/3", background: "skeleton.base", borderRadius: "3px" })} />
              <div className={css({ height: "12px", width: "80%", mt: "12px", background: "skeleton.base", borderRadius: "2px" })} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
