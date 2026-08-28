"use client";

import Link from "next/link";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { ac, type Status } from "../tokens";
import { Icon } from "../icons";
import { SearchInput } from "../Dropdown";
import {
  Surface,
  PageHeader,
  Badge,
  Button,
  buttonClass,
  Segmented,
  StatusPill,
  Table,
  Th,
  Td,
  Tr,
  TableFooter,
  EmptyState,
} from "../ui";
import { Bar, SkeletonKeyframes } from "../Skeleton";
import RefreshButton from "../RefreshButton";
import type { ProgramItem } from "@/lib/admin/programs";

function statusDisplay(raw: string): Status {
  if (raw === "publish") return "Published";
  if (raw === "pending") return "Pending";
  return "Draft";
}

const isKhmer = (s: string) => /[ក-៿]/.test(s);

export default function ProgramsView({
  programs,
  loading,
  error,
  fetchedAt,
  refreshing,
  onRefresh,
}: {
  programs: ProgramItem[];
  loading: boolean;
  error: boolean;
  fetchedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  // Case-insensitive: Khmer has no case, but half these titles are Latin and a
  // case-sensitive contains() made "Studio" and "studio" different searches.
  const q = search.trim().toLowerCase();
  const list = programs.filter((p) => !q || p.title.toLowerCase().includes(q));

  const sub = loading
    ? "Loading…"
    : q
      ? `${list.length.toLocaleString("en-US")} of ${programs.length.toLocaleString("en-US")} programs`
      : `${programs.length.toLocaleString("en-US")} programs`;

  // Movie vs TV Show is only worth a column when the library actually holds
  // both. Today every one of the 23 is a Movie, so a "Movie" badge on 23 of 23
  // rows would be decoration — and the design system's rule is that colour and
  // chrome inform or they don't ship. It comes back on its own the day a
  // tv_show appears.
  const mixedTypes = new Set(programs.map((p) => p.type)).size > 1;

  const body = loading ? (
    view === "grid" ? (
      <div className={gridClass} aria-busy>
        {Array.from({ length: 8 }, (_, i) => (
          // Square like the real cards, or the corners round off mid-load.
          <Surface key={i} style={{ overflow: "hidden", borderRadius: 0 }}>
            <div className={css({ aspectRatio: "1/1" })} style={{ background: ac.skeleton, borderBottom: `1px solid ${ac.border}` }} />
            <div className={css({ padding: "12px 14px 14px" })}>
              <Bar w={i % 2 ? "80%" : "60%"} h={14} />
              <div style={{ marginTop: 10 }}>
                <Bar w={90} h={12} />
              </div>
            </div>
          </Surface>
        ))}
        <SkeletonKeyframes />
      </div>
    ) : (
      <Surface style={{ overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <Th width="140px" />
              <Th>Title</Th>
              <Th width="120px">Status</Th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }, (_, i) => (
              <tr key={i} aria-busy>
                <Td><Bar w={96} h={54} r={8} /></Td>
                <Td><Bar w={i % 2 ? "62%" : "44%"} h={15} /></Td>
                <Td><Bar w={78} h={20} r={99} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <SkeletonKeyframes />
      </Surface>
    )
  ) : error ? (
    <Surface>
      <EmptyState icon="x" title="Couldn't load programs" body="WordPress didn't answer. Use Refresh to try again." />
    </Surface>
  ) : list.length === 0 ? (
    <Surface>
      <EmptyState
        icon="programs"
        title="No programs match"
        body={q ? "Try a shorter search term." : "No movies or shows exist yet."}
        action={
          q ? (
            <Button onClick={() => setSearch("")}>Clear search</Button>
          ) : (
            <Link href="/admin/programs/new" className={buttonClass("primary")}>
              <Icon name="plus" size={14} strokeWidth={2} />
              New program
            </Link>
          )
        }
      />
    </Surface>
  ) : view === "grid" ? (
    <div className={gridClass}>
      {list.map((p) => (
        // SQUARE, unlike every other Surface (owner's call for this grid):
        // poster art reads as media, not as a control, and the radius was
        // shaving the artwork's corners. The inline 0 beats surfaceBase's 14px.
        <Surface key={p.id} hover style={{ overflow: "hidden", borderRadius: 0 }}>
          {/* The card IS the link, so the whole tile is one keyboard stop and
              one hit target — the grid's rows have no other action. */}
          <Link href={`/admin/programs/${p.id}`} className={cardLinkClass}>
            {p.poster ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
              <img src={p.poster} alt="" className={css({ width: "100%", display: "block" })} style={{ aspectRatio: "1/1", objectFit: "cover", borderBottom: `1px solid ${ac.border}` }} />
            ) : (
              <div className={css({ aspectRatio: "1/1" })} style={{ background: ac.skeleton, borderBottom: `1px solid ${ac.border}` }} />
            )}
            <div className={css({ padding: "12px 14px 14px" })}>
              {/* No reserved two-line minHeight: most titles are one line, and
                  the empty second line read as a gulf between title and pill.
                  The pill follows the title; row heights still equalise via
                  the grid's stretch. */}
              <div className={css({ lineHeight: 1.5, fontWeight: 500, lineClamp: 2 })} style={{ fontSize: isKhmer(p.title) ? "15px" : "14px" }}>
                {p.title}
              </div>
              <div className={css({ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", flexWrap: "wrap" })}>
                <StatusPill status={statusDisplay(p.status)} />
                {mixedTypes ? <Badge>{p.type}</Badge> : null}
              </div>
            </div>
          </Link>
        </Surface>
      ))}
    </div>
  ) : (
    <Surface style={{ overflow: "hidden" }}>
      <Table>
        <thead>
          <tr>
            {/* 96px art + the Td's 22px-a-side padding. At the old 66px the
                cell left ~22px of content room, and the global img max-width
                reset squeezed every poster into a portrait sliver no matter
                what size the <img> itself asked for. */}
            <Th width="140px" />
            <Th>Title</Th>
            {mixedTypes ? <Th width="120px">Type</Th> : null}
            <Th width="120px">Status</Th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <Tr key={p.id} className={css({ "&:hover [data-thumb]": { borderColor: "var(--colors-admin-border-strong)" } })}>
              <Td>
                {/* Same 16:9 window the grid card uses — the posters are wide
                    logo art, and the old 38×56 portrait crop reduced them to
                    unrecognizable slivers. */}
                {p.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
                  <img data-thumb src={p.poster} alt="" style={{ width: 96, height: 54, objectFit: "cover", borderRadius: 8, border: `1px solid ${ac.border}`, transition: "border-color .12s", display: "block" }} />
                ) : (
                  <div data-thumb style={{ width: 96, height: 54, borderRadius: 8, background: ac.skeleton, border: `1px solid ${ac.border}`, transition: "border-color .12s" }} />
                )}
              </Td>
              <Td>
                {/* The ROW is not the link — a <tr> cannot be an anchor. The
                    title carries it, as on Articles, which also gives keyboard
                    users one stop per row instead of one per cell. */}
                <Link href={`/admin/programs/${p.id}`} className={css({ fontSize: "15.5px", lineHeight: 1.5, lineClamp: 2, display: "block", _hover: { textDecoration: "underline" } })}>
                  {p.title}
                </Link>
              </Td>
              {mixedTypes ? <Td><Badge>{p.type}</Badge></Td> : null}
              <Td><StatusPill status={statusDisplay(p.status)} /></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <TableFooter>
        <span>
          {list.length === programs.length
            ? `${programs.length.toLocaleString("en-US")} programs`
            : `${list.length.toLocaleString("en-US")} of ${programs.length.toLocaleString("en-US")}`}
        </span>
        {/* Both read paths return every program in one call — there is no page
            to turn, so the footer carries the count alone rather than dead
            pager buttons. */}
        <span />
      </TableFooter>
    </Surface>
  );

  return (
    <div>
      <PageHeader
        title="Programs"
        sub={sub}
        actions={
          <>
            <RefreshButton fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} />
            <Link href="/admin/programs/new" className={buttonClass("primary")}>
              <Icon name="plus" size={14} strokeWidth={2} />
              New program
            </Link>
          </>
        }
      />

      <Surface className={css({ display: "flex", alignItems: "center", gap: "10px", padding: "12px 22px", flexWrap: "wrap" })} style={{ borderBottom: `1px solid ${ac.border}` }}>
        <form onSubmit={(e) => e.preventDefault()} className={css({ display: "flex" })}>
          <SearchInput placeholder="Search programs…" value={search} onValueChange={setSearch} width="300px" />
        </form>
        <div className={css({ flex: 1 })} />
        <Segmented
          ariaLabel="Layout"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
        />
      </Surface>

      {body}
    </div>
  );
}

const gridClass = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
  gap: "16px",
  padding: "16px 22px",
});

/** The anchor fills the card so the hover lift and the hit target are the same
 *  rectangle; the ring is drawn by the anchor rather than the Surface, because
 *  the anchor is what actually takes focus. */
const cardLinkClass = css({
  display: "block",
  // Square to match the card (see the grid's Surface note) — a rounded focus
  // ring on a square tile would trace a shape that isn't there.
  borderRadius: 0,
  overflow: "hidden",
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
});
