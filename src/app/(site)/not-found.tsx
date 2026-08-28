import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";

/** The 404 page. Rendered inside the root layout, so it keeps the header,
 *  footer and theme — before this existed Next served its own default: English,
 *  no chrome, and visibly not this site. */
export default function NotFound() {
  return (
    <div className={cx(container, css({ padding: "90px 0 110px", textAlign: "center" }))}>
      <div className={css({ fontSize: { base: "64px", md: "96px" }, fontWeight: 900, lineHeight: 1, color: "brand.blue" })}>
        404
      </div>
      <h1 className={css({ fontSize: { base: "18px", md: "22px" }, fontWeight: 700, marginTop: "18px" })}>
        រកមិនឃើញទំព័រនេះទេ
      </h1>
      <p className={css({ color: "muted", fontSize: "14px", marginTop: "10px", lineHeight: 1.9 })}>
        ទំព័រដែលអ្នកកំពុងស្វែងរកអាចត្រូវបានផ្លាស់ទី ឬលែងមានទៀតហើយ។
      </p>
      <Link
        href="/"
        className={css({
          display: "inline-block",
          marginTop: "26px",
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
