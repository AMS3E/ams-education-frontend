<!-- BEGIN:nextjs-agent-rules -->
# Start here

`docs/project-context.md` — the backend, the endpoints that lie, the writes
that lie, the host's traps, and this project's working agreements. Read it
before touching WordPress or deploying anything. Session-by-session detail is
in `docs/session-log.md` (newest entry first — admin AND public site).

`docs/admin-design-system.md` — the admin tool's visual language: the validated
light/dark palette, the primitives in `ui.tsx`, the layout patterns and the
chart rules. **Read it before styling any admin screen.**

`docs/caching.md` — the ISR model, cache tags, the WordPress publish webhook,
and prebuild coverage per route. **Read it before adding a cached fetch, a new
route, or a WordPress-side invalidation hook.**

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
