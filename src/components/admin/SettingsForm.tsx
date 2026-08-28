"use client";

import { useState } from "react";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { PageHeader, FormCard, FormGrid, Field, Input, SaveBar, SkelTile, type SaveMessage } from "./ui";
import MediaPicker from "./MediaPicker";
import type { SiteSettings } from "@/lib/admin/settings";
import type { CategoryNode } from "@/lib/admin/categories";
import type { ProgramItem } from "@/lib/admin/programs";
import type { FeaturedConfig } from "@/lib/admin/featured";
import { saveSettings, saveFeaturedProgram } from "@/lib/admin/screen-actions";

/** Native <select>, on the shared control geometry. Kept native on purpose: the
 *  Dropdown component is a filter control that pops a menu out of the flow, and
 *  inside a form the browser's own picker is better at long lists and keyboard
 *  type-ahead. `color-scheme` on :root is what stops its popup being white in
 *  dark mode — CSS variables cannot reach native UI. */
const selectClass = css({
  width: "100%",
  height: "36px",
  padding: "0 10px",
  borderRadius: "9px",
  fontSize: "13px",
  fontFamily: "inherit",
  cursor: "pointer",
  color: "var(--colors-admin-text)",
  background: "var(--colors-admin-surface-sunken)",
  border: "1px solid var(--colors-admin-border)",
  transition: "border-color .13s ease",
  _hover: { borderColor: "var(--colors-admin-border-strong)" },
  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
});

export default function SettingsForm({
  settings,
  categories,
  programs,
  featured,
}: {
  settings: SiteSettings;
  categories: CategoryNode[];
  programs: ProgramItem[];
  featured: FeaturedConfig | null;
}) {
  const [title, setTitle] = useState(settings.title);
  const [description, setDescription] = useState(settings.description);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [defaultCategory, setDefaultCategory] = useState(String(settings.defaultCategory));
  const [postsPerPage, setPostsPerPage] = useState(String(settings.postsPerPage));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SaveMessage | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const res = await saveSettings({
      title,
      description,
      timezone,
      date_format: dateFormat,
      default_category: Number(defaultCategory) || undefined,
      posts_per_page: Number(postsPerPage) || undefined,
    });
    setBusy(false);
    setMsg(res.ok ? { kind: "ok", text: "Saved" } : { kind: "err", text: res.error ?? "Save failed." });
  };

  const mono = css({ fontFamily: "ui-monospace, monospace", fontSize: "12.5px" });

  return (
    <div className={css({ maxWidth: "760px" })}>
      <PageHeader trail={[{ label: "Site" }, { label: "Settings" }]} title="Settings" sub="Site-wide configuration." />

      <div className={css({ display: "flex", flexDirection: "column", gap: "16px", marginTop: "20px" })}>
        <FormCard title="General" sub="What the site calls itself, and the clock it keeps.">
          <div className={css({ display: "flex", flexDirection: "column", gap: "16px" })}>
            <Field label="Site title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Tagline">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <FormGrid>
              <Field label="Timezone">
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={mono} />
              </Field>
              <Field label="Date format">
                <Input value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className={mono} />
              </Field>
            </FormGrid>
          </div>
        </FormCard>

        <FormCard title="Content" sub="Defaults WordPress applies to new posts and to the archives.">
          <FormGrid>
            <Field label="Default category">
              <select value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} className={selectClass}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"— ".repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Posts per page">
              <Input type="number" min={1} max={100} value={postsPerPage} onChange={(e) => setPostsPerPage(e.target.value)} />
            </Field>
          </FormGrid>
        </FormCard>

        <FeaturedProgramCard programs={programs} featured={featured} />

        <FormCard title="Categories & tags" sub="They live with the content they organise.">
          <p className={css({ fontSize: "13px", lineHeight: 1.7, margin: 0 })} style={{ color: ac.muted }}>
            Managed under <span style={{ color: ac.text, fontWeight: 500 }}>Articles → Categories / Tags</span>.
          </p>
        </FormCard>

        <SaveBar busy={busy} onSave={() => void save()} message={msg} />
      </div>
    </div>
  );
}

// --- featured program (homepage banner) -------------------------------------

// The homepage's wide video banner: which published movie, and (optionally)
// override artwork behind it. Saves through the plugin's write endpoint
// (v1.7.4) with its own button — banner changes shouldn't ride along with
// unrelated site-settings edits. `featured` is null when the read failed
// (e.g. plugin not yet updated); the card then explains instead of guessing.
function FeaturedProgramCard({ programs, featured }: { programs: ProgramItem[]; featured: FeaturedConfig | null }) {
  const movies = programs.filter((p) => p.type === "Movie" && p.status === "publish");
  const [movieId, setMovieId] = useState(featured?.movieId ?? 0);
  const [bgId, setBgId] = useState(featured?.bgImageId ?? 0);
  const [bgThumb, setBgThumb] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SaveMessage | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const res = await saveFeaturedProgram(movieId, bgId);
    setBusy(false);
    setMsg(res.ok ? { kind: "ok", text: "Saved — homepage refreshes shortly" } : { kind: "err", text: res.error ?? "Save failed." });
  };

  const preview = bgThumb || featured?.coverUrl || "";

  return (
    <FormCard title="Featured program" sub="The wide video banner on the homepage.">
      {featured === null ? (
        <p className={css({ fontSize: "13px", lineHeight: 1.7, margin: 0 })} style={{ color: ac.muted }}>
          Couldn&rsquo;t read the current banner config — this needs plugin v1.7.4 on WordPress. Until then, set it in
          wp-admin → Settings → Featured Program.
        </p>
      ) : (
        <div className={css({ display: "flex", flexDirection: "column", gap: "16px" })}>
          <div className={css({ display: "grid", gridTemplateColumns: "1fr 220px", gap: "16px", alignItems: "start", "@media (max-width: 560px)": { gridTemplateColumns: "1fr" } })}>
            <Field label="Program" hint="Title, description and the ▶ trailer come from the movie itself — edit those in Programs.">
              <select value={String(movieId)} onChange={(e) => setMovieId(Number(e.target.value) || 0)} className={selectClass}>
                <option value="0">— none (banner hidden) —</option>
                {movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <div className={css({ fontSize: "12.5px", fontWeight: 500, marginBottom: "6px" })} style={{ color: ac.sub }}>
                Banner art
              </div>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={css({
                  width: "100%",
                  borderRadius: "9px",
                  padding: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                  background: "transparent",
                  transition: "border-color .12s",
                  _hover: { borderColor: "var(--colors-admin-border-strong)" },
                  _focusVisible: { outline: "2px solid var(--colors-admin-focus)", outlineOffset: "2px" },
                })}
                style={{ border: `1px dashed ${ac.borderStrong}`, color: ac.muted }}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail from the S3 host
                  <img src={preview} alt="" style={{ width: 96, height: 28, flex: "none", objectFit: "cover", borderRadius: 5, border: `1px solid ${ac.border}` }} />
                ) : (
                  <SkelTile radius="5px" style={{ width: 96, height: 28, flex: "none" }} />
                )}
                <span className={css({ fontSize: "11.5px", lineHeight: 1.5 })}>
                  {bgId ? `#${bgId} · replace` : "Override — else the movie's backdrop is used"}
                </span>
              </button>
            </div>
          </div>
          <SaveBar busy={busy} onSave={() => void save()} message={msg} label="Save banner" />
        </div>
      )}
      {picking ? (
        <MediaPicker
          title="Banner art (wide crop)"
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setBgId(m.id);
            setBgThumb(m.thumb);
            setPicking(false);
          }}
        />
      ) : null}
    </FormCard>
  );
}
