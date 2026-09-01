"use client";

import { useEffect, useState, type ReactNode } from "react";
import { css } from "@/styled-system/css";
import { ac } from "../tokens";
import { BentoCard } from "../ui";
import { useProgramEdit, type Collector } from "./ProgramEditContext";
import type { ProgramPayload } from "@/lib/admin/program-actions";
import MediaPicker from "../MediaPicker";

// The "Details" tab body: what the program IS (metadata + artwork). In edit
// mode the fields are controlled state seeded from the real program in
// ProgramEditContext; the form registers a collector so the top bar's Save
// (which lives in the persistent [id] layout) can snapshot it. In `create`
// mode there is no provider — the page passes `onCollect` instead and the
// empty form registers through that (see NewProgramView).
//
// Cut on the owner's request (2026-08-27), alongside the fields listed in
// docs/session-log.md S47: the Video source card (editors never touch it —
// episodes carry the videos; the meta stays in WP, just not editable here)
// and the read-only "WordPress page layout" view of post_content. Save has
// never written post_content and now never writes the _movie_* video meta
// either, so both survive unharmed in WordPress.

function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <BentoCard>
      <div className={css({ padding: "14px 20px", fontSize: "13px", fontWeight: 600 })} style={{ borderBottom: `1px solid ${ac.border}` }}>
        {title}
      </div>
      <div className={css({ padding: "18px 20px 20px" })}>{children}</div>
    </BentoCard>
  );
}

const label = css({ fontSize: "12px", marginBottom: "6px" });
const hint = css({ fontSize: "11.5px", marginTop: "6px" });

export default function ProgramDetailsForm({
  create = false,
  onCollect,
}: {
  create?: boolean;
  /** Create mode's stand-in for the context's setCollector. */
  onCollect?: (fn: Collector | null) => void;
}) {
  const edit = useProgramEdit();
  const program = create ? null : edit?.program ?? null;

  const [title, setTitle] = useState(program?.title ?? "");
  const [desc, setDesc] = useState(program?.description ?? "");
  const [release, setRelease] = useState(program?.releaseDate ?? "");
  const [schedule, setSchedule] = useState(program?.schedule ?? "");

  // Artwork via the media picker. The backdrop has no thumb on load (it isn't
  // the featured image), so its preview starts empty and fills once picked.
  const [posterId, setPosterId] = useState(program?.posterId ?? 0);
  const [posterThumb, setPosterThumb] = useState(program?.posterThumb ?? "");
  const [backdropId, setBackdropId] = useState(program?.backdropId ?? 0);
  const [backdropThumb, setBackdropThumb] = useState("");
  const [picking, setPicking] = useState<"poster" | "backdrop" | null>(null);

  // Register a fresh snapshot with the top bar's Save on every render; drop it
  // on unmount so the Episodes tab can't save a stale form. Create mode has no
  // context — its page supplies the sink via onCollect instead.
  const setCollector = edit?.setCollector ?? onCollect;
  useEffect(() => {
    if (!setCollector || (!create && !program)) return;
    const collect: Collector = () => {
      if (!title.trim()) return "Give the program a title first.";
      const payload: ProgramPayload = { title, description: desc, releaseDate: release, schedule, posterId, backdropId };
      return payload;
    };
    setCollector(collect);
  });
  useEffect(() => {
    if (!setCollector) return;
    return () => setCollector(null);
  }, [setCollector]);

  const fieldStyle = { background: ac.surface, border: `1px solid ${ac.border}`, color: ac.text };

  return (
    <>
      <FormCard title="Details">
        <div className={css({ display: "flex", flexDirection: "column", gap: "16px" })}>
          <div>
            <div className={label} style={{ color: ac.muted }}>Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Program name" className={css({ width: "100%", height: "38px", padding: "0 12px", borderRadius: "8px", fontSize: "13.5px" })} style={fieldStyle} />
          </div>
          <div>
            <div className={label} style={{ color: ac.muted }}>Description</div>
            <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this program about?" className={css({ width: "100%", padding: "10px 12px", borderRadius: "8px", fontSize: "15px", lineHeight: 1.8, resize: "vertical" })} style={fieldStyle} />
            <div className={hint} style={{ color: ac.faint }}>Shown on the public program page — WordPress&apos;s &ldquo;Movie short description&rdquo;. Plain text; a blank line starts a new paragraph.</div>
          </div>
          <div className={css({ display: "grid", gridTemplateColumns: "200px 1fr", gap: "16px", alignItems: "start" })}>
            <div>
              <div className={label} style={{ color: ac.muted }}>Release date</div>
              <input value={release} onChange={(e) => setRelease(e.target.value)} placeholder="YYYY-MM-DD" className={css({ width: "100%", height: "38px", padding: "0 12px", borderRadius: "8px", fontSize: "13.5px", fontVariantNumeric: "tabular-nums" })} style={fieldStyle} />
            </div>
            <div>
              <div className={label} style={{ color: ac.muted }}>Broadcast schedule</div>
              <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="e.g. Sundays 8:30am" className={css({ width: "100%", height: "38px", padding: "0 12px", borderRadius: "8px", fontSize: "16px" })} style={fieldStyle} />
              <div className={hint} style={{ color: ac.faint }}>When it airs — free text, not a duration.</div>
            </div>
          </div>
          <div className={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" })}>
            <div>
              <div className={label} style={{ color: ac.muted }}>Poster</div>
              <div className={css({ display: "flex", gap: "12px", alignItems: "stretch" })}>
                {posterThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
                  <img src={posterThumb} alt="" style={{ width: 72, flex: "none", aspectRatio: "2/3", objectFit: "cover", borderRadius: 8, border: `1px solid ${ac.border}` }} />
                ) : (
                  <div style={{ width: 72, flex: "none", aspectRatio: "2/3", borderRadius: 8, background: ac.skeleton, border: `1px solid ${ac.border}` }} />
                )}
                <button type="button" onClick={() => setPicking("poster")} className={css({ flex: 1, borderRadius: "8px", padding: "12px", fontSize: "12px", lineHeight: 1.5, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "left", background: "transparent", transition: "border-color .12s, color .12s", _hover: { borderColor: ac.borderStrong, color: ac.text } })} style={{ border: `1px dashed ${ac.borderStrong}`, color: ac.muted }}>
                  {posterThumb ? "Replace" : "Choose or upload"} — saved with the program.
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: ac.faint, marginTop: 3 }}>2:3 · 1000 × 1500</div>
                </button>
              </div>
            </div>
            <div>
              <div className={label} style={{ color: ac.muted }}>Backdrop</div>
              <button type="button" onClick={() => setPicking("backdrop")} className={css({ width: "100%", borderRadius: "8px", padding: "10px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", textAlign: "left", background: "transparent", transition: "border-color .12s, color .12s", _hover: { borderColor: ac.borderStrong, color: ac.text } })} style={{ border: `1px dashed ${ac.borderStrong}`, color: ac.muted }}>
                {backdropThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; next/image needs remotePatterns for the S3 host
                  <img src={backdropThumb} alt="" style={{ width: 80, height: 45, flex: "none", objectFit: "cover", borderRadius: 6, border: `1px solid ${ac.border}` }} />
                ) : (
                  <div style={{ width: 80, height: 45, flex: "none", borderRadius: 6, background: ac.skeleton, border: `1px solid ${ac.border}` }} />
                )}
                <span className={css({ fontSize: "12px", lineHeight: 1.5 })}>
                  {backdropId ? `Attachment #${backdropId} — click to replace` : "Choose or upload"}
                  <span style={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: ac.faint, marginTop: 2 }}>16:9 · 2560 × 1440</span>
                </span>
              </button>
            </div>
          </div>
          {picking ? (
            <MediaPicker
              title={picking === "poster" ? "Program poster" : "Program backdrop"}
              onClose={() => setPicking(null)}
              onPick={(m) => {
                if (picking === "poster") {
                  setPosterId(m.id);
                  setPosterThumb(m.thumb);
                } else {
                  setBackdropId(m.id);
                  setBackdropThumb(m.thumb);
                }
                setPicking(null);
              }}
            />
          ) : null}
        </div>
      </FormCard>
    </>
  );
}
