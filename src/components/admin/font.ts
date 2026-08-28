import { Plus_Jakarta_Sans } from "next/font/google";

// The admin tool's UI typeface, loaded once and shared by the shell and the
// sign-in screen.
//
// WHY THE ADMIN HAS ITS OWN FONT AT ALL: the site sets Battambang on <body> for
// everything. Battambang is a KHMER typeface — its Latin subset exists so English
// and numbers don't drop to a fallback mid-sentence, not because it was drawn to
// set an interface. The admin is almost entirely small Latin text (13px nav
// labels, table headers, figures in stat tiles), which is exactly where a
// display-leaning face reads as subtly wrong.
//
// No `weight`: Plus Jakarta Sans is a variable font, so this pulls the whole
// 200–800 axis in one file — which is also the fix for a real bug. The admin
// styles text at 600 in dozens of places, 600 was never among the weights the
// root layout loads, and every one of those labels was being SYNTHESISED by the
// browser from 400. Smeared letterforms, no crispness, no obvious cause.
export const adminFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-admin",
  display: "swap",
});

/** The stack to put on the admin shell and the sign-in card.
 *
 *  Battambang is SECOND, not gone. The admin renders Khmer *data* — article
 *  titles, author names — even though there is no Khmer in the admin source, so
 *  dropping it would break real content. Browsers fall back PER GLYPH rather
 *  than per element: Latin characters take Plus Jakarta Sans and Khmer
 *  characters fall through to Battambang inside the very same sentence.
 *
 *  `--font-battambang` is declared on <html> by the root layout, so it is in
 *  scope here by inheritance. */
export const ADMIN_FONT_STACK =
  "var(--font-admin), var(--font-battambang), 'Helvetica Neue', Arial, sans-serif";
