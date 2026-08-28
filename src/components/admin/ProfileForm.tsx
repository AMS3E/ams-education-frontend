"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { css } from "@/styled-system/css";
import { ac } from "./tokens";
import { MY_AVATAR_QUERY_KEY } from "./AccountMenu";
import { PageHeader, FormCard, FormGrid, Field, Input, Textarea, Badge, Button, SaveBar, type SaveMessage } from "./ui";
import type { Profile, ProfileAvatar } from "@/lib/admin/settings";
import { saveProfile } from "@/lib/admin/screen-actions";
import { uploadImageFile } from "./upload-client";

export default function ProfileForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email);
  const [bio, setBio] = useState(profile.description);
  const [url, setUrl] = useState(profile.url);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SaveMessage | null>(null);

  // The picture is STAGED like every other field: uploading parks the file in
  // the media library and previews it here, but the account only points at it
  // once Save writes ams_avatar (see ProfileWrite). avatarDirty is what keeps
  // an untouched avatar out of the patch — { id: 0 } would clear it.
  const [avatar, setAvatar] = useState<ProfileAvatar | null>(profile.avatar);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const pickAvatar = async (file: File) => {
    setAvatarBusy(true);
    setMsg(null);
    const res = await uploadImageFile(file); // never throws
    setAvatarBusy(false);
    if (!res.ok || !res.id) {
      setMsg({ kind: "err", text: res.error ?? "Couldn't upload the picture." });
      return;
    }
    setAvatar({ id: res.id, url: res.thumb || res.url || "" });
    setAvatarDirty(true);
  };

  const save = async () => {
    if (newPass && newPass !== confirmPass) {
      setMsg({ kind: "err", text: "The new passwords don't match." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await saveProfile({
      name,
      first_name: firstName,
      last_name: lastName,
      email,
      description: bio,
      url,
      ...(newPass ? { password: newPass } : {}),
      ...(avatarDirty ? { ams_avatar: { id: avatar?.id ?? 0 } } : {}),
    });
    setBusy(false);
    if (res.ok) {
      setNewPass("");
      setConfirmPass("");
      if (avatarDirty) {
        // Tell the sidebar chip right away. The staged URL is the upload's
        // thumbnail — the plugin stores its own resolved rendition, so the
        // next hard load may swap in an equivalent URL; visually identical.
        queryClient.setQueryData(MY_AVATAR_QUERY_KEY, { url: avatar?.url ?? null });
      }
      setAvatarDirty(false);
      setMsg({ kind: "ok", text: "Saved" });
    } else {
      setMsg({ kind: "err", text: res.error ?? "Save failed." });
    }
  };

  return (
    <div className={css({ maxWidth: "760px" })}>
      <PageHeader trail={[{ label: "Account" }, { label: "Profile" }]} title="Profile" sub="How you appear across the site." />

      <div className={css({ display: "flex", flexDirection: "column", gap: "16px", marginTop: "20px" })}>
        <FormCard title="Account" sub="Your byline and the details on your author page.">
          <div className={css({ display: "flex", flexDirection: "column", gap: "16px" })}>
            <div className={css({ display: "flex", alignItems: "center", gap: "16px" })}>
              {avatar?.url ? (
                // WP media URLs aren't in next/image's remotePatterns; a 56px
                // avatar gains nothing from the optimizer anyway.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar.url}
                  alt=""
                  className={css({ width: "56px", height: "56px", borderRadius: "16px", objectFit: "cover", flex: "none" })}
                  style={{ border: `1px solid ${ac.border}`, background: ac.surfaceSunken }}
                />
              ) : (
                <div
                  className={css({ width: "56px", height: "56px", borderRadius: "16px", display: "grid", placeItems: "center", fontSize: "18px", fontWeight: 600, flex: "none" })}
                  style={{ background: ac.surfaceSunken, border: `1px solid ${ac.border}`, color: ac.muted }}
                >
                  {profile.initials}
                </div>
              )}
              <div className={css({ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 })}>
                <div className={css({ display: "flex", gap: "8px", flexWrap: "wrap" })}>
                  <Button size="sm" disabled={avatarBusy || busy} onClick={() => fileRef.current?.click()}>
                    {avatarBusy ? "Uploading…" : avatar ? "Change picture" : "Upload picture"}
                  </Button>
                  {avatar ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={avatarBusy || busy}
                      onClick={() => {
                        setAvatar(null);
                        setAvatarDirty(true);
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className={css({ fontSize: "12.5px" })} style={{ color: ac.muted }}>
                  Square images look best — it&#39;s shown small. Applied when you save.
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className={css({ display: "none" })}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Reset so picking the same file again still fires onChange.
                  e.target.value = "";
                  if (f) void pickAvatar(f);
                }}
              />
            </div>

            <Field label="Display name" hint="The byline readers see.">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <FormGrid>
              <Field label="First name">
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Last name">
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </FormGrid>

            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>

            <Field label="Bio" hint="Shown on your author page.">
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="A short introduction…" />
            </Field>

            <Field label="Website">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className={css({ fontFamily: "ui-monospace, monospace", fontSize: "12.5px" })}
              />
            </Field>
          </div>
        </FormCard>

        <FormCard title="Account details" sub="Set in WordPress — shown here so you know which account you are signed in as.">
          <div className={css({ display: "flex", flexDirection: "column", gap: "12px" })}>
            <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" })}>
              <span className={css({ fontSize: "12.5px" })} style={{ color: ac.muted }}>
                Username
              </span>
              <span className={css({ fontSize: "12.5px" })} style={{ fontFamily: "ui-monospace, monospace" }}>
                {profile.username}
              </span>
            </div>
            <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" })}>
              <span className={css({ fontSize: "12.5px" })} style={{ color: ac.muted }}>
                Role
              </span>
              <Badge>{profile.roleLabel}</Badge>
            </div>
          </div>
        </FormCard>

        <FormCard title="Password" sub="Leave both blank to keep your current password.">
          <FormGrid>
            <Field label="New password">
              <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} autoComplete="new-password" />
            </Field>
          </FormGrid>
        </FormCard>

        <SaveBar busy={busy} onSave={() => void save()} message={msg} />
      </div>
    </div>
  );
}
