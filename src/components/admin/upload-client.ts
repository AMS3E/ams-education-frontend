"use client";

// Client side of the media upload: posts the file to /api/admin/upload (a
// Route Handler — raw multipart, no Server Action re-encoding; see
// src/lib/admin/upload.ts) and normalizes every failure into a message the
// button can show. Never throws.

import type { UploadResult } from "@/lib/admin/upload";

export type { UploadResult };

export async function uploadImageFile(file: File): Promise<UploadResult> {
  try {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as UploadResult | null;
    if (data) return data;
    return { ok: false, error: `Upload failed (${res.status}) — check the server console.` };
  } catch {
    return { ok: false, error: "Upload didn't reach the server — check the connection and try again." };
  }
}
