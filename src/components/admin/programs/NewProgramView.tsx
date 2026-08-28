"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";
import { Icon } from "../icons";
import { BentoCard } from "../ui";
import ProgramDetailsForm from "./ProgramDetailsForm";
import type { Collector } from "./ProgramEditContext";
import { createProgramAction } from "@/lib/admin/program-actions";
import { startLegacyRefresh } from "../LegacySiteChip";

// The Create-Program flow: header + slug card + the shared Details form
// (registered via onCollect — create mode has no ProgramEditContext).
//
// Both buttons create the movie post only — the episode container (tv_show)
// is created on demand from the Episodes tab — matching the shape every
// existing program has. "Save draft" keeps it dashboard-only; "Create &
// publish" puts /program/<slug> on the public site immediately, via the
// dynamic registry.
//
// The slug is auto-derived from the title at create time when the title is
// Latin; Khmer titles can't transliterate, so the field is there to type one
// (the action refuses to create without a Latin slug either way).

/** Best-effort Latin slug; "" when nothing survives (e.g. a Khmer title). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewProgramView() {
  const router = useRouter();
  const collectorRef = useRef<Collector | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  const [error, setError] = useState<string | null>(null);

  const create = async (status: "draft" | "publish") => {
    const collect = collectorRef.current;
    if (!collect || busy) return;
    const payload = collect();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    const finalSlug = slug.trim() || slugify(payload.title);
    if (!finalSlug) {
      setError("Khmer titles can't auto-slug — type a Latin URL slug below.");
      return;
    }
    setBusy(status);
    setError(null);
    try {
      const res = await createProgramAction({ ...payload, slug: finalSlug, status });
      if (!res.ok || !res.id) {
        setError(res.error ?? "Couldn't create the program.");
        return;
      }
      // "Create & publish" puts a brand-new page on the legacy site, so its
      // listings (homepage, archive, landing pages) go stale the same as an
      // article publish. Fire-and-forget — survives the navigation; the chip
      // in the editor we land on picks the run up (same postId).
      if (status === "publish") startLegacyRefresh(res.id);
      router.push(`/admin/programs/${res.id}`);
    } catch {
      setError("Request failed — check the server console.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={css({ display: "flex", flexDirection: "column", flex: 1 })}>
      {/* Header */}
      <div style={{ background: ac.surface, borderBottom: `1px solid ${ac.border}` }}>
        <div className={css({ display: "flex", alignItems: "center", gap: "14px", padding: "0 24px", height: "60px" })}>
          <Link href="/admin/programs" className={css({ width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", _hover: { background: ac.surfaceSunken } })} style={{ color: ac.muted }}>
            <Icon name="back" size={16} strokeWidth={1.8} />
          </Link>
          <div className={css({ fontSize: "20px", fontWeight: 600, lineHeight: 1.4 })}>New Program</div>
          <span className={css({ fontSize: "12.5px", whiteSpace: "nowrap" })} style={{ color: error ? ac.danger : ac.faint }}>
            {busy ? "Creating… WordPress save hooks can take a minute — don't close the tab" : error ?? "Drafts stay dashboard-only — publishing puts the program on the live site"}
          </span>
          <div className={css({ flex: 1 })} />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void create("draft")}
            className={css({ height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", flex: "none", transition: "border-color .12s", _hover: { borderColor: ac.borderStrong } })}
            style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text, opacity: busy ? 0.6 : 1 }}
          >
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void create("publish")}
            className={css({ height: "34px", padding: "0 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", color: "var(--colors-admin-accent-fg)", boxShadow: ac.shadowSm, transition: "background .12s", _hover: { background: ac.accentHover } })}
            style={{ background: ac.accent, opacity: busy ? 0.7 : 1 }}
          >
            {busy === "publish" ? "Publishing…" : "Create & publish"}
          </button>
        </div>
      </div>

      <div className={css({ padding: "28px 32px 56px" })}>
        <div className={css({ maxWidth: "900px", display: "flex", flexDirection: "column", gap: "16px" })}>
          <ProgramDetailsForm create onCollect={(fn) => { collectorRef.current = fn; }} />

          <BentoCard>
            <div className={css({ padding: "14px 20px", fontSize: "13px", fontWeight: 600 })} style={{ borderBottom: `1px solid ${ac.border}` }}>
              URL slug
            </div>
            <div className={css({ padding: "18px 20px 20px" })}>
              <div className={css({ display: "flex", alignItems: "center", gap: "8px" })}>
                <span className={css({ fontSize: "13px", flex: "none" })} style={{ fontFamily: "ui-monospace, monospace", color: ac.muted }}>/program/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="auto from the title (Latin titles only)"
                  className={css({ flex: 1, height: "38px", padding: "0 12px", borderRadius: "8px", fontSize: "13.5px" })}
                  style={{ background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text, fontFamily: "ui-monospace, monospace" }}
                />
              </div>
              <div className={css({ fontSize: "11.5px", marginTop: "8px" })} style={{ color: ac.faint }}>
                Lowercase letters, digits and hyphens. A Khmer title needs one typed here — it can&rsquo;t auto-derive. This becomes the public URL, so pick it once and keep it.
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
