# syntax=docker/dockerfile:1
#
# Production image for the Dokploy host. Three stages so the runtime image
# carries neither the toolchain nor the dev dependencies.
#
# bookworm-slim, not alpine: `sharp` (next's optional dependency, and what
# next/image uses to optimize the WP and S3 artwork) ships glibc prebuilds that
# install without drama. On musl it is a recurring source of "image optimization
# silently 500s in production only".

# ---- deps -------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# panda.config.ts ships alongside the manifests because `npm ci` runs the
# `prepare` script, which is `panda codegen` — it exits 1 without a config, and
# npm treats that as a failed install. The config imports nothing from src/, so
# these three files are the whole requirement.
COPY package.json package-lock.json panda.config.ts ./
# Dev dependencies are REQUIRED: that same `prepare` script writes
# src/styled-system (gitignored, so absent from the build context). Without it
# every `styled-system/*` import fails to resolve.
RUN npm ci

# ---- builder ----------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# EVERY ARG BELOW MUST KEEP A NON-EMPTY DEFAULT. Each consumer reads its value
# as `process.env.X ?? "<fallback>"`, and `??` only catches null/undefined — an
# empty string WINS and silently produces `fetch("")` or a canonical of "".
# An unset build arg therefore has to arrive as the real value, not as "".
#
# NEXT_PUBLIC_* are inlined into the client bundle by `next build`, so they must
# be correct HERE; setting them only in Dokploy's runtime env does nothing.
ARG NEXT_PUBLIC_SITE_URL=https://edu.amscloud.cc
ARG NEXT_PUBLIC_WP_ORIGIN=https://education.ams.com.kh
# Server-only, but the build's prerender pass reads it too when
# PRERENDER_PUBLIC=1 (every prebuilt public page is rendered at build time
# against the live WordPress).
ARG API_BASE_URL=https://education.ams.com.kh/wp-json
# Off by default: see src/lib/prerender.ts. A next build with this on hammers
# WordPress from every render worker at once, which starved this box before
# (shared, memory-tight) even on fast-path-only routes. Set to "1" only once
# a cheap enough article read exists to afford it (project-context.md §6).
ARG PRERENDER_PUBLIC=0

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WP_ORIGIN=$NEXT_PUBLIC_WP_ORIGIN \
    API_BASE_URL=$API_BASE_URL \
    PRERENDER_PUBLIC=$PRERENDER_PUBLIC \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ---- runner -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# .next must exist and be writable BEFORE the copies: the ISR cache is written
# under .next/cache at runtime, by this unprivileged user.
RUN mkdir .next && chown nextjs:nodejs .next

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# The standalone server. `next start` is not available here — node_modules/.bin
# is not part of the traced output.
CMD ["node", "server.js"]
