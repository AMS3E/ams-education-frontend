import Link from "next/link";
import { css } from "@/styled-system/css";

// Root-level fallback 404. In practice the public site's own not-found
// (src/app/(site)/not-found.tsx) handles every unknown public URL — its
// catch-all route calls notFound() and keeps the site chrome. This one only
// backstops paths that match no route group at all, so it renders inside the
// thin root layout and must be fully self-contained (no header/footer).
export default function NotFound() {
  return (
    <div
      className={css({
        background: "page.bg",
        color: "text",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "18px",
        textAlign: "center",
        padding: "0 24px",
      })}
    >
      <div className={css({ fontSize: "72px", fontWeight: 900, lineHeight: 1, color: "brand.blue" })}>
        404
      </div>
      <h1 className={css({ fontSize: "20px", fontWeight: 700 })}>រកមិនឃើញទំព័រនេះទេ</h1>
      <Link
        href="/"
        className={css({
          padding: "12px 34px",
          fontSize: "14px",
          fontWeight: 600,
          color: "#fff",
          background: "brand.blue",
          textDecoration: "none",
          borderRadius: "4px",
          transition: "opacity .2s",
          _hover: { opacity: 0.85 },
        })}
      >
        ត្រឡប់ទៅទំព័រដើម
      </Link>
    </div>
  );
}
