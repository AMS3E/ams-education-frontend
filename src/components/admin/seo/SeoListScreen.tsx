"use client";

// The SEO workbench's sweep list: every article with its search-appearance
// vitals, each row opening the Yoast-style panel (/admin/seo/[id]). Table
// anatomy copied from UsersView (the list reference) — minus the checkbox
// column, because no bulk action exists here and a checkbox would promise one.

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { css } from "@/styled-system/css";
import { ac, type Status } from "../tokens";
import { Icon } from "../icons";
import { SearchInput } from "../Dropdown";
import { Surface, PageHeader, Button, StatusPill, Table, Th, Td, Tr, TableFooter, EmptyState } from "../ui";
import type { SeoListResult } from "@/lib/admin/seo";

const PER_PAGE = 20;

function toStatus(raw: string): Status {
  return raw === "publish" ? "Published" : raw === "pending" ? "Pending" : raw === "private" ? "Private" : "Draft";
}

/** Green check + label, or a muted dash + label — status is never colour alone. */
function Vital({ ok, okLabel, missLabel, warn = false }: { ok: boolean; okLabel: string; missLabel: string; warn?: boolean }) {
  return (
    <span className={css({ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", whiteSpace: "nowrap" })} style={{ color: ok ? ac.good : warn ? ac.warn : ac.muted }}>
      <Icon name={ok ? "check" : "minus"} size={13} strokeWidth={2.2} style={{ flex: "none" }} />
      {ok ? okLabel : missLabel}
    </span>
  );
}

export default function SeoListScreen({
  result,
  query,
}: {
  /** null = the read failed (non-auth); the table shows its error state. */
  result: SeoListResult | null;
  query: { q: string; page: number };
}) {
  const router = useRouter();
  const pathname = usePathname();

  const go = (next: { q?: string; page?: number }) => {
    const q = next.q ?? query.q;
    const page = next.page ?? 1;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = new FormData(e.currentTarget).get("q");
    go({ q: typeof v === "string" ? v.trim() : "" });
  };

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const start = total === 0 ? 0 : (query.page - 1) * PER_PAGE + 1;
  const end = start === 0 ? 0 : start + items.length - 1;

  return (
    <div className={css({ maxWidth: "1440px" })}>
      <PageHeader
        trail={[{ label: "Site" }, { label: "SEO" }]}
        title="SEO"
        sub={result ? `How ${total.toLocaleString("en-US")} articles appear in Google and on shares` : "Search appearance across articles"}
      />

      <div className={css({ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", flexWrap: "wrap" })}>
        <form onSubmit={onSearch} className={css({ display: "flex" })}>
          <SearchInput placeholder="Search articles…" name="q" defaultValue={query.q} width="300px" />
        </form>
      </div>

      <Surface style={{ marginTop: "16px", overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <Th>Article</Th>
              <Th width="110px">Status</Th>
              <Th width="170px">SEO title</Th>
              <Th width="190px">Meta description</Th>
              <Th width="150px">Focus keyphrase</Th>
              <Th width="110px">Date</Th>
            </tr>
          </thead>
          <tbody>
            {result === null ? (
              <tr>
                <Td colSpan={6}>
                  <EmptyState icon="x" title="Couldn't load articles" body="WordPress didn't answer. Reload the page to try again." />
                </Td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <Td colSpan={6}>
                  <EmptyState icon="search" title="No articles match" body={query.q ? "Try clearing the search." : "There are no articles yet."} />
                </Td>
              </tr>
            ) : (
              items.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    {/* The title cell carries the link — the row is never the link. */}
                    <Link
                      href={`/admin/seo/${row.id}`}
                      className={css({ fontSize: "13.5px", fontWeight: 500, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "460px", _hover: { textDecoration: "underline" } })}
                      style={{ color: ac.text }}
                    >
                      {row.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusPill status={toStatus(row.status)} />
                  </Td>
                  <Td>
                    <Vital ok={!!row.seoTitle} okLabel="Custom" missLabel="Headline" />
                  </Td>
                  <Td>
                    {/* An absent description is a WARN when there's no excerpt
                        either — Google then improvises from the body. */}
                    <Vital ok={!!row.seoDescription} okLabel="Written" missLabel={row.hasExcerpt ? "Excerpt" : "None"} warn={!row.hasExcerpt} />
                  </Td>
                  <Td>
                    <Vital ok={!!row.focusKeyphrase} okLabel="Set" missLabel="—" />
                  </Td>
                  <Td>
                    <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap" })} style={{ color: ac.muted }}>
                      {row.date}
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
        <TableFooter>
          <span>{total === 0 ? "No results" : `${start}–${end} of ${total.toLocaleString("en-US")}`}</span>
          <span className={css({ display: "flex", gap: "6px" })}>
            <Button size="sm" icon="chevronLeft" disabled={query.page <= 1} onClick={() => go({ page: query.page - 1 })}>
              Previous
            </Button>
            <Button size="sm" iconRight="chevronRight" disabled={query.page >= totalPages} onClick={() => go({ page: query.page + 1 })}>
              Next
            </Button>
          </span>
        </TableFooter>
      </Surface>
    </div>
  );
}
