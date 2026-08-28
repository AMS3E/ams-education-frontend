"use server";

// Server Actions for the login form and the sidebar logout. These run only on
// the server, so credentials never touch client JS and the cookie is set/cleared
// server-side. Everything else lives in ./session (kept out of "use server" so
// its non-action exports aren't turned into RPC endpoints).

import { redirect } from "next/navigation";
import { login, setSessionCookie, clearSessionCookie } from "./session";

export interface LoginFormState {
  error?: string;
}

/**
 * useActionState-compatible: returns { error } to re-render the form on failure,
 * and redirects to /admin on success (redirect throws, so it never "returns").
 */
export async function loginAction(
  _prev: LoginFormState | undefined,
  formData: FormData,
): Promise<LoginFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password." };
  }

  const result = await login(username, password);
  if (!result.ok) {
    return { error: result.message };
  }

  await setSessionCookie(result.token, result.expiresAt, result.user);
  // Cookie is attached to this action's response; the redirect carries it.
  redirect("/admin");
}

/** Drop the session cookie and return to the login screen (stateless logout —
 *  the WordPress token simply expires within 12h, there is nothing to revoke). */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
