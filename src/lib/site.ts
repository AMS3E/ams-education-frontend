// Site-wide identity: the things a share card, a canonical URL or a JSON-LD
// block needs and that no API returns.

/**
 * The origin this app is served from.
 *
 * It is what every canonical and og:url is built against, so it must be the
 * origin the PUBLIC hits, not the WordPress backend we read from — set
 * NEXT_PUBLIC_SITE_URL in the deploy environment. The default is the domain this
 * app is replacing, which is right once it is serving that domain and harmless
 * before then: a wrong canonical only misleads a crawler, and no crawler sees a
 * preview build.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://education.ams.com.kh").replace(/\/+$/, "");

/** og:site_name, and the publisher in JSON-LD. Capitalised as the CMS has it. */
export const SITE_NAME = "AMS EDUCATION";

export const SITE_DESCRIPTION = "ព័ត៌មានអប់រំ៖ ជំនាញ អាហារូបករណ៍ អប់រំកុមារតូច និងការយល់ដឹងអំពីយុវជន";

export const SITE_LOGO = "/assets/Logo-Footer.svg";

/** The AMS social accounts, in the order the footer lists them. `name` keys into
 *  SocialIcon.tsx for the glyph; `color` is each platform's brand colour, unused
 *  by the footer (it renders monochrome) but kept for theming. */
export const SOCIALS = [
  { name: "Facebook", color: "#1877f2", href: "https://www.facebook.com/amsinfotainment" },
  { name: "Twitter", color: "#1da1f2", href: "https://twitter.com/InfotainmentAms" },
  { name: "Instagram", color: "#e1306c", href: "https://www.instagram.com/amsinfotainment/" },
  { name: "TikTok", color: "#000000", href: "https://www.tiktok.com/@ams_infotainment" },
  { name: "Telegram", color: "#229ed9", href: "https://t.me/ams_infotainment" },
  { name: "YouTube", color: "#ff0000", href: "https://www.youtube.com/channel/UCWvKOoS8D7ugdTfciCYYswg" },
] as const;
