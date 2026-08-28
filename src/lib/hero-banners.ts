// Hero carousel banners.
//
// These reproduce the AMS "Slider Revolution" banners as real, interactive HTML
// (a themed background + real Khmer text + a real CTA button + the artwork
// cutout), instead of a flattened image. Each banner shares the same layout;
// only the content, colors, and artwork differ.
//
// NOTE: this is DUMMY data. The shape mirrors what the CMS/API will return, so
// swapping to a live fetch later is a one-line change in getHeroBanners().

export interface BannerTheme {
  /** CSS background for the whole banner (solid or gradient). */
  background: string;
  eyebrow: string;
  title: string;
  text: string;
  buttonBg: string;
  buttonText: string;
  author: string;
}

export interface HeroBanner {
  id: string;
  /** Small hashtag/category line above the headline. */
  eyebrow: string;
  /** Big headline, one entry per line. */
  title: string[];
  /** Optional secondary line under the headline. */
  subtitle?: string;
  cta: { label: string; href: string };
  author?: { prefix: string; name: string; href?: string };
  /** Right-side artwork cutout (transparent PNG / collage). */
  art: { src: string; width: number; height: number; alt: string };
  theme: BannerTheme;
}

const heroBanners: HeroBanner[] = [
  {
    id: "CVAM_INFCB071",
    eyebrow: "#តារាល្បីៗ",
    title: ["សមនឹងកេរ្តិ៍ឈ្មោះមែន!", "តារាចម្រៀង ៨ រូបនេះ"],
    subtitle: "ជាសេដ្ឋីនីសម្បូរទ្រព្យសម្បត្តិច្រើនបំផុតលើពិភពលោក",
    cta: {
      label: "ចុចអានបន្ត",
      href: "https://economy.ams.com.kh/all-report/report-business/boeung-rumpere-fish-processing-handicraft-has-the-ability-to-process-all-kinds-of-fish-and-is-promoting-more-products-to-the-market/",
    },
    author: {
      prefix: "អត្ថបទដែលបានសរសេរដោយ",
      name: "លោក សារ៉ម បុណ្យរិទ្ធ",
      href: "https://economy.ams.com.kh/author/phors-ams/",
    },
    art: {
      src: "https://s3.ams.com.kh/infotainment/2025/06/1-INFCB071_CAN_E03png.png",
      width: 757,
      height: 459,
      alt: "តារាចម្រៀងស្រីល្បីៗលើពិភពលោក",
    },
    theme: {
      background: "linear-gradient(180deg,#f7f7f7 0%,#6a0dad 100%)",
      eyebrow: "#3a2a4a",
      title: "#7a1533",
      text: "#241a2e",
      buttonBg: "#6a0dad",
      buttonText: "#ffffff",
      author: "#4a3a5a",
    },
  },
  {
    id: "CVAM_INFCB076",
    eyebrow: "#តារាល្បីៗ",
    title: ["មានហេតុផលបែបនេះ", "ទើបក្រុមហ៊ុននីមួយៗហាមប្រាមមិនឱ្យ"],
    subtitle: "តារាខេប៉ុបមានស្នេហា",
    cta: {
      label: "ចុចអានបន្ត",
      href: "https://economy.ams.com.kh/all-report/report-business/boeung-rumpere-fish-processing-handicraft-has-the-ability-to-process-all-kinds-of-fish-and-is-promoting-more-products-to-the-market/",
    },
    author: {
      prefix: "អត្ថបទដែលបានសរសេរដោយ",
      name: "លោក ស្វាយ វ៉ាន់ថន",
      href: "https://economy.ams.com.kh/author/phors-ams/",
    },
    art: {
      src: "https://s3.ams.com.kh/infotainment/2025/06/1-INFCB076_CAN_E01.png",
      width: 345,
      height: 275,
      alt: "តារាខេប៉ុប",
    },
    theme: {
      background: "#0e0e12",
      eyebrow: "#ff2d9b",
      title: "#ffffff",
      text: "#ff5cae",
      buttonBg: "#ff2d9b",
      buttonText: "#ffffff",
      author: "#c9c9d0",
    },
  },
  {
    id: "CVAM_INFLR014",
    eyebrow: "#ស្នេហានិងទំនាក់ទំនង",
    title: ["បុណ្យពីជាតិមុន!", "កូនប្រសាជួបម្ដាយក្មេកល្អ ៤ ប្រភេទនេះ"],
    subtitle: "សំណាងជាងបានដៃគូល្អក្នុងជីវិតទៅទៀត",
    cta: {
      label: "ចុចអានបន្ត",
      href: "https://economy.ams.com.kh/all-report/report-business/boeung-rumpere-fish-processing-handicraft-has-the-ability-to-process-all-kinds-of-fish-and-is-promoting-more-products-to-the-market/",
    },
    author: {
      prefix: "អត្ថបទដែលបានសរសេរដោយ",
      name: "កញ្ញា ទ្រីយ៉ា",
      href: "https://economy.ams.com.kh/author/phors-ams/",
    },
    art: {
      src: "https://s3.ams.com.kh/infotainment/2025/03/1-INFLR014_CAN_E02.png",
      width: 479,
      height: 472,
      alt: "ម្ដាយក្មេក និងកូនប្រសា",
    },
    theme: {
      background: "#f3eede",
      eyebrow: "#1e2a52",
      title: "#a41e22",
      text: "#1e2a52",
      buttonBg: "#a41e22",
      buttonText: "#ffffff",
      author: "#1e2a52",
    },
  },
  {
    id: "CVAM_INFLT010",
    eyebrow: "#បែបផែនជីវិត",
    title: ["ធ្វើជាមនុស្សឱ្យតែចេះធ្វើរឿង ៤", "យ៉ាងនេះមិនខ្វះទេ"],
    cta: {
      label: "ចុចអានបន្ត",
      href: "https://economy.ams.com.kh/category/life-tips/reports/4-ways-making-everyone-around-us-want-to-make-friend-with/",
    },
    author: {
      prefix: "អត្ថបទដែលបានសរសេរដោយ",
      name: "កញ្ញា ទ្រីយ៉ា",
      href: "https://economy.ams.com.kh/author/phors-ams/",
    },
    art: {
      src: "https://s3.ams.com.kh/infotainment/2025/03/1-INFLT010%20CAN_E02.png",
      width: 665,
      height: 726,
      alt: "ស្ត្រីធ្វើសញ្ញាបេះដូង",
    },
    theme: {
      background: "linear-gradient(90deg,#243349 0%,#2c3e59 100%)",
      eyebrow: "#c7d2e2",
      title: "#ffffff",
      text: "#dfe6f0",
      buttonBg: "#e8c98c",
      buttonText: "#243349",
      author: "#c7d2e2",
    },
  },
];

/**
 * Returns the hero banners.
 *
 * Currently returns dummy data. When the API is ready, replace the body with:
 *   const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/hero-banners`, {
 *     next: { revalidate: 300 },
 *   });
 *   return res.json(); // response must match HeroBanner[]
 */
export async function getHeroBanners(): Promise<HeroBanner[]> {
  return heroBanners;
}
