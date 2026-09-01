import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Emits .next/standalone — a self-contained server.js plus only the traced
  // node_modules — which is what the Docker image runs on the Dokploy host.
  // Inert on Vercel, so it is safe to leave on while both deployments exist.
  output: "standalone",
  experimental: {
    // Client router cache: revisiting a page within the window serves the
    // cached payload instantly instead of re-rendering on the server. Added
    // for the admin (WordPress REST costs ~4s per call, so tab-hopping was
    // unbearable; the sidebar's "Refresh data" and every save bypass this),
    // and harmless for the public site, whose pages are ISR-cached anyway.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
    serverActions: {
      // The 1MB default rejects an oversized action payload with an opaque
      // 500 before any of our code runs. Media uploads now bypass actions
      // entirely (/api/admin/upload Route Handler), but keep headroom so a
      // long TipTap article body can never trip the same invisible wall.
      bodySizeLimit: "15mb",
    },
  },
  images: {
    // economy.ams.com.kh (and, same reason, education.ams.com.kh) resolves to
    // 127.0.0.1/::1 in local dev (hosts file: local WordPress), which Next
    // 16's image optimizer refuses to fetch by default (SSRF guard —
    // "resolved to private ip"). Dev-only: production DNS for both is a real
    // public host, so this stays off in that build.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    // The homepage uses decorative Unsplash photos that gracefully fall back
    // to a solid color if they fail to load (see CoverImage).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // AMS media/CDN — hero banner artwork exported from Slider Revolution.
        protocol: "https",
        hostname: "s3.ams.com.kh",
      },
      {
        // WordPress uploads (ad creatives from the `advertise` endpoint, and
        // the handful of attachments never offloaded to the S3 CDN — see
        // ams-fast-api/fast.php's AMS_FAST_CDN_BASE comment: not every
        // attachment is on s3.ams.com.kh, some still serve straight from
        // wp-content/uploads). Some ad creatives are stored with a plain
        // http:// source_url, so both protocols must be allowed or next/image
        // rejects the src.
        protocol: "https",
        hostname: "economy.ams.com.kh",
      },
      {
        protocol: "http",
        hostname: "economy.ams.com.kh",
      },
      {
        // This site's own WordPress origin — missing until 2026-08-28, when a
        // category listing containing a never-offloaded image
        // (education.ams.com.kh/wp-content/uploads/...) crashed that page's
        // whole server render ("hostname is not configured under images"),
        // which silently falls back to client-only rendering with an empty
        // article list rather than a visible error.
        protocol: "https",
        hostname: "education.ams.com.kh",
      },
      {
        protocol: "http",
        hostname: "education.ams.com.kh",
      },
      {
        // Author avatars — WordPress serves them from Gravatar (ក្រុមការងារ).
        protocol: "https",
        hostname: "secure.gravatar.com",
      },
    ],
  },
};

export default nextConfig;
