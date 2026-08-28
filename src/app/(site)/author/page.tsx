import type { Metadata } from "next";
import Link from "next/link";
import { css, cx } from "@/styled-system/css";
import { container } from "@/components/layout/shared";
import { fetchAuthors } from "@/lib/authors";

// The /author index — where the landing pages' ក្រុមការងារ "see all" points.
//
// NOT a clone of live's /author: that page is six hand-grouped team sections
// with portraits from Simple Author Box user meta, and neither the groupings
// nor the photos are exposed by any endpoint (see src/lib/authors.ts). Until
// WordPress exposes them, this renders the honest thing the API does have:
// every author with published work, linking to their /author/<slug> archives.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "ក្រុមការងារ",
  alternates: { canonical: "/author" },
};

const card = css({
  display: "block",
  padding: "18px 20px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "divider",
  borderRadius: "6px",
  color: "inherit",
  textDecoration: "none",
  transition: "border-color .2s, background .2s",
  _hover: { borderColor: "brand.blue", "& .au-n": { color: "brand.blue" } },
});

export default async function AuthorIndexPage() {
  // fetchAuthors, not getAuthors: the list IS this page, so a failed read must
  // not be written into a static page as "couldn't fetch" and served for an
  // hour. It throws, the last good copy keeps serving, and the empty state below
  // now means only what it says. See the note in lib/api/client.ts.
  const authors = await fetchAuthors();

  return (
    <div className={cx(container, css({ marginTop: "34px", marginBottom: "56px" }))}>
      <h1 className={css({ fontSize: { base: "24px", md: "30px" }, fontWeight: 700, marginBottom: "22px" })}>
        ក្រុមការងារ
      </h1>

      {authors.length === 0 ? (
        <p className={css({ color: "muted", fontSize: "14px", padding: "48px 0", textAlign: "center" })}>
          មិនទាន់មានអ្នកនិពន្ធទេ។
        </p>
      ) : (
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", sm: "repeat(2,1fr)", lg: "repeat(3,1fr)" },
            gap: "16px",
          })}
        >
          {authors.map((a) => (
            <Link key={a.id} href={`/author/${a.slug}`} className={card}>
              <div className={cx("au-n", css({ fontSize: "16px", fontWeight: 600, transition: "color .2s" }))}>
                {a.name}
              </div>
              {a.description && (
                <div className={css({ fontSize: "12.5px", color: "muted", marginTop: "6px", lineClamp: "2" })}>
                  {a.description}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
