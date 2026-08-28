"use client";

import { css } from "@/styled-system/css";
import SocialIcon from "@/components/ui/SocialIcon";
import { SITE_URL, SOCIALS } from "@/lib/site";

/**
 * The share row under an article body.
 *
 * This was seven `<span role="button">`s in a server component — no href, no
 * onClick, and no `"use client"`, so no handler could ever have attached. The
 * labels were copied from the live site, so it was always meant to work.
 *
 * The five networks below are the share intents live itself uses. Instagram is
 * the odd one out: it has NO web share endpoint (live doesn't emit one either),
 * so rather than leave a button that can't do the thing its icon promises, it
 * links to the AMS account — a real destination, and honest about what it is.
 */
const shareBtn = css({
  color: "text",
  fontSize: "20px",
  cursor: "pointer",
  display: "inline-flex",
  background: "none",
  border: "none",
  padding: 0,
  transition: "opacity .2s, transform .2s",
  _hover: { opacity: 0.55, transform: "translateY(-2px)" },
});

const INSTAGRAM = SOCIALS.find((s) => s.name === "Instagram")!.href;

/** Share targets, in display order — the same list the live article renders. */
function shareTargets(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  return [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "Twitter", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { label: "Instagram", href: INSTAGRAM },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "Telegram", href: `https://telegram.me/share/url?url=${u}&text=${t}` },
    { label: "WhatsApp", href: `https://api.whatsapp.com/send?text=${t}%20${u}` },
  ];
}

export default function ShareRow({ slug, title }: { slug: string; title: string }) {
  // Absolute, because the receiving network has to resolve it — and it must be
  // OUR canonical URL, which is what the og:* tags on this page describe.
  const url = `${SITE_URL}/article/${slug}`;

  return (
    <div
      className={css({
        display: "flex",
        flexWrap: "wrap",
        gap: "22px",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        marginTop: "30px",
        marginBottom: "30px",
      })}>
      {shareTargets(url, title).map(({ label, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share on ${label}`}
          className={shareBtn}>
          <SocialIcon name={label} />
        </a>
      ))}

      <button type="button" onClick={() => window.print()} aria-label="Print" className={shareBtn}>
        <SocialIcon name="Print" />
      </button>
    </div>
  );
}
