// Server-side session layer for the admin dashboard.
//
// The WordPress token IS the session — our plugin's POST /wp/v2/web/login mints
// a 12h signed token (docs/wordpress/ams-frontend-api.php), we hold it in an
// httpOnly cookie, and replay it as X-AMS-Token on every WordPress call. WP is
// the real authorization boundary: it enforces the user's capabilities natively
// and 401s an expired/forged token regardless of what our cookie claims. The
// `capabilities` we surface here are therefore only optimistic UI hints — they
// decide which buttons render, never whether a write is allowed.
//
// This module reads next/headers and calls the network, so it must only be
// imported from Server Components, Server Actions, or Route Handlers — never a
// Client Component (see AdminSidebar, which takes the session as props instead).

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_USER_COOKIE } from "./constants";

const BASE = process.env.API_BASE_URL ?? "https://economy.ams.com.kh/wp-json";

/** Curated cap→bool map from /web/login and /web/me (see ams_afa_login_caps). */
export type Capabilities = Record<string, boolean>;

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  roles: string[];
  capabilities: Capabilities;
}

export interface Session {
  token: string;
  user: SessionUser;
}

interface LoginOk {
  ok: true;
  token: string;
  /** Unix seconds (WordPress clock) — used verbatim as the cookie expiry. */
  expiresAt: number;
  user: SessionUser;
}
interface LoginErr {
  ok: false;
  status: number;
  message: string;
}
export type LoginResult = LoginOk | LoginErr;

/** Turn WordPress's login error contract into a message safe to show. */
function loginMessage(status: number, code?: string): string {
  switch (code) {
    case "invalid_login":
      return "Invalid username or password.";
    case "no_access":
      return "This account doesn't have dashboard access.";
    case "too_many_attempts":
      return "Too many attempts. Please wait 15 minutes and try again.";
    case "insecure":
      return "Login requires a secure (HTTPS) connection.";
    case "bad_request":
      return "Enter your username and password.";
  }

  switch (status) {
    case 401:
      return "Invalid username or password.";
    case 403:
      return "This account doesn't have dashboard access.";
    case 429:
      return "Too many attempts. Please wait a few minutes and try again.";
    case 400:
      return "Login requires a secure (HTTPS) connection.";
    // The current host replaces upstream 4xx responses with an HTML 404 page.
    // Keep old plugin deployments actionable until the host-safe JSON error
    // envelope from AMS Frontend API 1.9.2 is installed.
    case 404:
      return "Sign-in was rejected. Check your username, password, and dashboard access; after several attempts, wait 15 minutes.";
    default:
      return "The login service returned an unexpected response. Please wait 15 minutes, then verify your WordPress username and dashboard access.";
  }
}

/**
 * Authenticate a username/password against WordPress. Never throws — a network
 * failure or any non-2xx comes back as { ok: false } with a display message, so
 * the Server Action can hand it straight to the form.
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/wp/v2/web/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection." };
  }

  const json = (await res.json().catch(() => null)) as
    | {
        status?: string;
        code?: string;
        message?: string;
        http_status?: number;
        token?: string;
        expires_at?: number;
        user?: SessionUser;
      }
    | null;

  if (!res.ok || json?.status === "error" || !json?.token || !json.user) {
    const status = Number(json?.http_status) || res.status;
    return { ok: false, status, message: loginMessage(status, json?.code) };
  }
  return {
    ok: true,
    token: json.token,
    expiresAt: Number(json.expires_at) || Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    user: json.user,
  };
}

/** Resolve who a token is, fresh from WordPress. Returns null if it's invalid/expired. */
async function fetchMe(token: string): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${BASE}/wp/v2/web/me`, {
      headers: { accept: "application/json", "X-AMS-Token": token },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { user?: SessionUser } | null;
    return json?.user ?? null;
  } catch {
    return null;
  }
}

/** Parse the cached user cookie; null on anything malformed (old sessions,
 *  hand-edited cookies) — the caller then falls back to /web/me. */
function parseUserCookie(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  try {
    const user = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionUser;
    if (typeof user?.id !== "number" || typeof user.name !== "string" || typeof user.capabilities !== "object" || user.capabilities === null) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

/**
 * The current session, or null. Memoized per request with React `cache()`.
 *
 * The user payload is read from the cookie set at login, NOT fetched from
 * WordPress — /web/me cost a ~4s WP round trip on EVERY admin navigation,
 * serial before any page data that needed the user id. The trade-off: a WP
 * role change now applies at the next login rather than the next request.
 * That's safe because these capabilities are optimistic UI only — WordPress
 * enforces the real ones on every call, and a revoked/expired token still
 * 401s (AdminAuthError → /login) the moment any real request is made. The
 * /web/me fallback covers sessions from before the user cookie existed.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const cached = parseUserCookie(store.get(SESSION_USER_COOKIE)?.value);
  if (cached) return { token, user: cached };
  const user = await fetchMe(token);
  if (!user) return null;
  return { token, user };
});

/** Session or bust: redirects to /login when there is none. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Optimistic UI check — the authoritative check is WordPress's own on each call. */
export function can(user: SessionUser, capability: string): boolean {
  return user.capabilities[capability] === true;
}

// --- cookie mutation (only valid inside Server Actions / Route Handlers) ---

export async function setSessionCookie(token: string, expiresAtUnix: number, user: SessionUser): Promise<void> {
  const store = await cookies();
  const opts = {
    httpOnly: true,
    // Dev runs on http://localhost; only force Secure in production.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAtUnix * 1000),
  } as const;
  store.set(SESSION_COOKIE, token, opts);
  // The user payload rides its own cookie with the same lifetime, so both
  // expire together — see SESSION_USER_COOKIE for why it exists.
  store.set(SESSION_USER_COOKIE, Buffer.from(JSON.stringify(user)).toString("base64url"), opts);
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SESSION_USER_COOKIE);
}
