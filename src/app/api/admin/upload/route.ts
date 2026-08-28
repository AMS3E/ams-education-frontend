import { NextResponse } from "next/server";
import { uploadImage } from "@/lib/admin/upload";

// Media upload endpoint for the admin dashboard. A Route Handler (not a
// Server Action) on purpose: the browser posts the file as raw multipart and
// nothing re-encodes it in between — see src/lib/admin/upload.ts. Auth is the
// same httpOnly session cookie every admin call uses; WordPress enforces
// upload_files on its side regardless.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const result = await uploadImage(form.get("file"));
    return NextResponse.json(result, { status: result.ok ? 200 : result.authExpired ? 401 : 400 });
  } catch (e) {
    console.warn(`[api/admin/upload] ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ ok: false, error: "Upload failed on the server — check the server console." }, { status: 500 });
  }
}
