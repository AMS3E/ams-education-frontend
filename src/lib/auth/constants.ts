// Auth constants with NO server-only imports, so both the session DAL
// (next/headers) and proxy.ts (Edge/Node request context) can share them.

/** httpOnly cookie holding the WordPress /web/login token. Never read client-side. */
export const SESSION_COOKIE = "ams_session";

/** httpOnly cookie holding the login response's user payload (id/name/roles/
 *  capabilities, base64url JSON). Purely a latency cache: without it every
 *  admin navigation paid a ~4s /web/me round trip to WordPress just to learn
 *  who the cookie belongs to. The caps inside are optimistic UI hints only —
 *  WordPress re-enforces the real ones on every call, so a stale or tampered
 *  copy can mis-render buttons but never authorize anything. */
export const SESSION_USER_COOKIE = "ams_user";
