"use server";

// Submitting a comment. Anonymous commenting is ON for the site (live's form
// shows name/email fields to logged-out visitors), but WordPress REST blocks
// anonymous `POST /wp/v2/comments` unless the site opts in — our plugin adds
// that filter in v1.5.0. Until it is deployed, the REST call answers 401
// (`rest_comment_login_required`) and this falls back to the classic
// `wp-comments-post.php` endpoint, which is exactly what the live theme's own
// form posts to. Both paths end in the same place: the comment lands in
// WordPress, usually held for moderation.

import { revalidateTag } from "next/cache";

const BASE = process.env.API_BASE_URL ?? "https://education.ams.com.kh/wp-json";
const WP_ORIGIN = (process.env.NEXT_PUBLIC_WP_ORIGIN ?? "https://education.ams.com.kh").replace(/\/+$/, "");

export interface CommentFormState {
  ok: boolean;
  /** Khmer, shown under the form. "" until the first submit. */
  message: string;
}

/** True once the comment is in WordPress, whether approved or held. */
async function postViaRest(post: number, author: string, email: string, text: string): Promise<"created" | "login-required" | "failed"> {
  try {
    const res = await fetch(`${BASE}/wp/v2/comments`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ post, author_name: author, author_email: email, content: text }),
    });
    if (res.status === 201) return "created";
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    return body?.code === "rest_comment_login_required" ? "login-required" : "failed";
  } catch {
    return "failed";
  }
}

/** The classic comment endpoint answers a 302 to the comment's permalink on
 *  success (and on "held for moderation"); anything else is a rejection. */
async function postViaForm(post: number, author: string, email: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${WP_ORIGIN}/wp-comments-post.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ comment_post_ID: String(post), author, email, comment: text }),
      redirect: "manual",
    });
    return res.status >= 300 && res.status < 400;
  } catch {
    return false;
  }
}

export async function submitComment(_prev: CommentFormState, formData: FormData): Promise<CommentFormState> {
  const post = Number(formData.get("post"));
  const author = String(formData.get("author") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const text = String(formData.get("comment") ?? "").trim();

  if (!Number.isInteger(post) || post <= 0) return { ok: false, message: "មានបញ្ហាបច្ចេកទេស សូមព្យាយាមម្ដងទៀត។" };
  if (!author || !text) return { ok: false, message: "សូមបំពេញឈ្មោះ និងមតិយោបល់របស់អ្នក។" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "សូមបំពេញអ៊ីមែលឱ្យបានត្រឹមត្រូវ។" };

  const rest = await postViaRest(post, author, email, text);
  const created = rest === "created" || (rest === "login-required" && (await postViaForm(post, author, email, text)));

  if (!created) return { ok: false, message: "មិនអាចផ្ញើមតិយោបល់បានទេ សូមព្យាយាមម្ដងទៀត។" };

  // New comments usually sit in moderation, but if one was auto-approved this
  // is what makes it show up without waiting out the ISR window.
  revalidateTag(`comments:${post}`, "max");
  return { ok: true, message: "មតិយោបល់របស់អ្នកត្រូវបានផ្ញើ ហើយនឹងបង្ហាញនៅពេលអ្នកគ្រប់គ្រងអនុម័ត។" };
}
