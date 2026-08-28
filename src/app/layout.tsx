import type { Metadata } from "next";
import { Battambang } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// Battambang is used for both Khmer and Latin text. It carries the full weight
// range the site uses, and its Latin subset covers English/numbers.
const battambang = Battambang({
  subsets: ["khmer", "latin"],
  weight: ["100", "300", "400", "700", "900"],
  variable: "--font-battambang",
  display: "swap",
});

export const metadata: Metadata = {
  // `metadataBase` is what lets every route below hand Next a relative canonical
  // or og:image and get an absolute URL out. Without it those fields are dropped
  // at build time, which is how articles ended up shipping no og:url at all.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    // Routes set their bare title; the suffix is applied here, once.
    template: "%s — AMS Economy",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "km_KH",
    url: "/",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

// Applies the saved theme before first paint to avoid a flash of light theme.
// "auto" follows the visitor's clock — dark 18:00–05:59 — and must stay in
// step with ThemeToggle's autoIsDark().
const themeInit = `try{var t=localStorage.getItem('ams-theme');var h=new Date().getHours();if(t==='dark'||(t==='auto'&&(h>=18||h<6))){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}`;

// The root layout is intentionally thin: it owns only <html>/<body>, the font,
// the theme-init script and global metadata. The public site's chrome (header,
// footer, page background) lives in the (site) route group's layout, and the
// admin tool provides its own chrome under /admin — so neither inherits the
// other's shell, and /admin no longer depends on the public nav API.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="km"
      suppressHydrationWarning
      className={battambang.variable}
    >
      <head>
        {/* Plain script, not next/script: this needs to run before first
            paint and next/script's beforeInteractive strategy is a client
            component for a case (dedup/load-tracking across a whole
            third-party script) this inline snippet doesn't need. */}
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInit }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
