// Sample data for the admin UI while there is no API wiring yet. Everything here
// is real content pulled from the live WordPress site (titles, categories,
// bylines, program names, episode titles), so the layouts get stress-tested
// against genuine Khmer text lengths rather than lorem ipsum. When API
// integration starts, screens should stop importing this module — swapping the
// data source is then contained to one place.
import type { Status } from "./tokens";

export const ARTICLE_TITLES = [
  "លោក​ជំទាវ ពេជ ចន្ទមុន្នី ហ៊ុនម៉ាណែត ផ្ដល់អនុសាសន៍បំផុសគំនិតលើកស្ទួយមង្គលការខ្មែរ",
  "ប្រជាជនជប៉ុនពិចារណាទិញ “ផ្ទះមានខ្មោច” ក្នុងពេលទីផ្សារអចលនទ្រព្យឡើងថ្លៃ",
  "Julia Russell បវរកញ្ញាកូនកាត់ខ្មែរ-អង់គ្លេស មានទាំងចំណេះដឹង និងរូបសម្រស់",
  "Angelina Jolie បង្ហាញអារម្មណ៍ក្ដុកក្ដួលចំពោះប្រជាជនកម្ពុជា",
  "មូលនិធិម៉ាដក្សរបស់ Angelina Jolie ជួយប្រជាជនសំឡូតអស់ពេលជាង ២៣ ឆ្នាំ",
  "ពលរដ្ឋ​ប្រទះ​ឃើញ​កំពូល​ប្រាសាទបុរាណ​​ធ្លាក់កណ្ដាល​ព្រៃ​លើភ្នំត្បែង ខេត្តព្រះវិហារ",
  "ហេតុផលគួរឱ្យភ្ញាក់ផ្អើលដែល Madonna, Shakira, BTS និង Justin Bieber មិនទទួលបានប្រាក់ឈ្នួល",
  "ច្រក​ផ្លូវ​តូចៗ​នៅ​តំបន់​អូរឫស្សី​ទាក់ទាញ​ទេសចរ​ទាំង​ខ្មែរ-បរទេស",
  "តារាចម្រៀង វណ្ណដា បញ្ចេញបទថ្មី ទាក់ទាញអ្នកទស្សនាជាងមួយលាននាក់ក្នុង ២៤ ម៉ោង",
  "រដូវភ្ជុំបិណ្ឌឆ្នាំនេះ ការធ្វើដំណើរកម្សាន្តកើនឡើងខ្ពស់នៅខេត្តសៀមរាប",
];

export const CATEGORIES = [
  "បំណិនជីវិត",
  "ព័ត៌មានកម្សាន្ត",
  "សង្គមសិល្បៈ",
  "ព័ត៌មានរសនិយម",
  "ទេសចរណ៍",
  "ភាពយន្តនិងតន្រ្តី",
  "ព្រឹត្តិការណ៍",
  "សុខភាពនិងសម្រស់",
];

export interface DashboardStat {
  label: string;
  value: string;
}

export const DASHBOARD_STATS: DashboardStat[] = [
  { label: "My Articles", value: "342" },
  { label: "Published", value: "318" },
  { label: "Drafts", value: "21" },
  { label: "Pending Review", value: "3" },
];

export interface TopArticle {
  title: string;
  views: string;
  up: boolean;
}

export const TOP_ARTICLES: TopArticle[] = [
  { title: ARTICLE_TITLES[8], views: "45,231", up: true },
  { title: ARTICLE_TITLES[5], views: "31,562", up: true },
  { title: ARTICLE_TITLES[4], views: "24,890", up: false },
  { title: ARTICLE_TITLES[0], views: "12,483", up: true },
  { title: ARTICLE_TITLES[1], views: "9,871", up: false },
];

export interface ActivityRow {
  title: string;
  status: Status;
  time: string;
}

export const RECENT_ACTIVITY: ActivityRow[] = [
  { title: ARTICLE_TITLES[3], status: "Draft", time: "2m ago" },
  { title: ARTICLE_TITLES[0], status: "Published", time: "3h ago" },
  { title: ARTICLE_TITLES[2], status: "Pending", time: "5h ago" },
  { title: ARTICLE_TITLES[8], status: "Published", time: "1d ago" },
  { title: ARTICLE_TITLES[9], status: "Draft", time: "1d ago" },
  { title: ARTICLE_TITLES[4], status: "Published", time: "2d ago" },
];

// Real bylines from the site (fixes the earlier mock's invented names).
export const AUTHORS = ["Pheat Sophat", "Chhunlin San", "Soksinith Sin", "Peou Sochakriya"];

export interface ArticleRow {
  title: string;
  category: string;
  author: string;
  date: string;
  status: Status;
  /** Display string; drafts/pending show an em dash (no views yet). */
  views: string;
}

export const ARTICLES: ArticleRow[] = [
  { title: ARTICLE_TITLES[0], category: "សង្គមសិល្បៈ", author: "Pheat Sophat", date: "Jul 24, 2026", status: "Published", views: "12,483" },
  { title: ARTICLE_TITLES[1], category: "បំណិនជីវិត", author: "Chhunlin San", date: "Jul 24, 2026", status: "Published", views: "9,871" },
  { title: ARTICLE_TITLES[2], category: "ព័ត៌មានកម្សាន្ត", author: "Soksinith Sin", date: "Jul 24, 2026", status: "Pending", views: "—" },
  { title: ARTICLE_TITLES[3], category: "ព័ត៌មានកម្សាន្ត", author: "Pheat Sophat", date: "Jul 24, 2026", status: "Draft", views: "—" },
  { title: ARTICLE_TITLES[4], category: "ព័ត៌មានកម្សាន្ត", author: "Pheat Sophat", date: "Jul 23, 2026", status: "Published", views: "24,890" },
  { title: ARTICLE_TITLES[5], category: "ព្រឹត្តិការណ៍", author: "Peou Sochakriya", date: "Jul 23, 2026", status: "Published", views: "31,562" },
  { title: ARTICLE_TITLES[6], category: "ភាពយន្តនិងតន្រ្តី", author: "Pheat Sophat", date: "Jul 23, 2026", status: "Pending", views: "—" },
  { title: ARTICLE_TITLES[7], category: "ទេសចរណ៍", author: "Chhunlin San", date: "Jul 22, 2026", status: "Published", views: "8,104" },
  { title: ARTICLE_TITLES[8], category: "ភាពយន្តនិងតន្រ្តី", author: "Pheat Sophat", date: "Jul 22, 2026", status: "Published", views: "45,231" },
  { title: ARTICLE_TITLES[9], category: "ទេសចរណ៍", author: "Soksinith Sin", date: "Jul 21, 2026", status: "Draft", views: "—" },
];

export interface ProgramCard {
  title: string;
  episodes: number;
  status: Status;
  /** Khmer titles render larger in the site font; Latin ones a touch smaller. */
  khmer: boolean;
  type: "Movie" | "TV Show";
}

// Real AMS programs. Note 18 of 19 are MasVideos `movie` posts; vanna-yeatra is
// the lone `tv_show`. The editor targets the movie (the program itself) and
// treats its linked TV show only as the source of the episode list.
export const PROGRAMS: ProgramCard[] = [
  { title: "Learn The World", episodes: 120, status: "Published", khmer: false, type: "Movie" },
  { title: "វនយាត្រា", episodes: 42, status: "Published", khmer: true, type: "TV Show" },
  { title: "បើកសោជីវិត", episodes: 96, status: "Published", khmer: true, type: "Movie" },
  { title: "ចង់ដឹងរឿងគេ", episodes: 74, status: "Published", khmer: true, type: "Movie" },
  { title: "ព្រះនាងកង្កែប", episodes: 8, status: "Draft", khmer: true, type: "Movie" },
  { title: "Cicada Agent", episodes: 12, status: "Pending", khmer: false, type: "Movie" },
  { title: "ជ្រុងមួយនៃភ្នំពេញ", episodes: 58, status: "Published", khmer: true, type: "Movie" },
  { title: "អាថ៌កំបាំងក្រោមមេឃ", episodes: 31, status: "Published", khmer: true, type: "Movie" },
  { title: "តាមចិត្ត MoMo", episodes: 26, status: "Published", khmer: true, type: "Movie" },
  { title: "Studio 11", episodes: 64, status: "Published", khmer: false, type: "Movie" },
  { title: "អផ្សុក", episodes: 19, status: "Pending", khmer: true, type: "Movie" },
  { title: "ប្រអប់បៃតង", episodes: 45, status: "Published", khmer: true, type: "Movie" },
  { title: "១នាទីដើម្បីសុខភាព", episodes: 210, status: "Published", khmer: true, type: "Movie" },
];


export interface MediaItem {
  name: string;
  dims: string;
  date: string;
  type: "image" | "video" | "audio";
  size: string;
  by: string;
  duration?: string;
}

// Real S3-style filenames from the site's media library.
export const MEDIA: MediaItem[] = [
  { name: "04_Vanayatra-profile.jpg", dims: "346 × 600", date: "Jul 24, 2026", type: "image", size: "184 KB", by: "Chhunlin San" },
  { name: "01_VANNA_YEATRA_COVER_4447px.jpg", dims: "2560 × 576", date: "Jul 24, 2026", type: "image", size: "1.2 MB", by: "Chhunlin San" },
  { name: "learn-the-world-poster.jpg", dims: "1000 × 1500", date: "Jul 23, 2026", type: "image", size: "412 KB", by: "LACH SREYKA" },
  { name: "cicada-agent-banner.png", dims: "2560 × 576", date: "Jul 23, 2026", type: "image", size: "860 KB", by: "Pheat Sophat" },
  { name: "obsok-thumb.jpg", dims: "1280 × 720", date: "Jul 23, 2026", type: "image", size: "206 KB", by: "Soksinith Sin" },
  { name: "ep112-blackberry-teaser.mp4", dims: "1920 × 1080", date: "Jul 22, 2026", type: "video", size: "48.3 MB", by: "Ravuth Sak", duration: "02:14" },
  { name: "bopksor-jivit-key-art.jpg", dims: "1000 × 1500", date: "Jul 22, 2026", type: "image", size: "388 KB", by: "LACH SREYKA" },
  { name: "momo-set-photo-03.jpg", dims: "2048 × 1365", date: "Jul 22, 2026", type: "image", size: "742 KB", by: "Peou Sochakriya" },
  { name: "studio11-stage-wide.jpg", dims: "2560 × 1440", date: "Jul 21, 2026", type: "image", size: "1.1 MB", by: "Channa Nou" },
  { name: "prohbaibaten-logo-mark.png", dims: "512 × 512", date: "Jul 21, 2026", type: "image", size: "38 KB", by: "Sreylai Art" },
  { name: "jrung-muoy-phnompenh-01.jpg", dims: "1280 × 720", date: "Jul 21, 2026", type: "image", size: "244 KB", by: "Ratana Chhim" },
  { name: "1-nateay-health-promo.mp4", dims: "1280 × 720", date: "Jul 20, 2026", type: "video", size: "22.7 MB", by: "Soksinith Sin", duration: "00:48" },
  { name: "chang-deng-roeung-ke-cover.jpg", dims: "1000 × 1500", date: "Jul 20, 2026", type: "image", size: "401 KB", by: "Chhunlin San" },
  { name: "preah-neang-kangkeb-still.jpg", dims: "2048 × 1152", date: "Jul 20, 2026", type: "image", size: "688 KB", by: "Peou Sochakriya" },
  { name: "art-kombang-krom-mekh-bg.jpg", dims: "2560 × 1440", date: "Jul 19, 2026", type: "image", size: "1.4 MB", by: "Ravuth Sak" },
  { name: "ams-studio-mic-detail.jpg", dims: "1280 × 853", date: "Jul 19, 2026", type: "image", size: "212 KB", by: "Channa Nou" },
  { name: "wikipedia-ep-thumb-v2.jpg", dims: "1280 × 720", date: "Jul 19, 2026", type: "image", size: "198 KB", by: "Sreylai Art" },
  { name: "canva-episode-cover.jpg", dims: "1280 × 720", date: "Jul 18, 2026", type: "image", size: "221 KB", by: "Ratana Chhim" },
];

// The REAL post-category tree (from live WordPress). 3 levels deep, ordered
// format → section → topic. Flat list in tree order; `depth` drives indentation.
// ⚠ Leaf NAMES repeat across the news and report branches (e.g. សង្គមសិល្បៈ,
// ទេសចរណ៍, បំណិនជីវិត each appear twice) — they are DIFFERENT categories with
// different ids/slugs. Identity is by id, never by name (see [[query-by-id]]).
// Used by both the Categories manager and the article editor's category picker.
export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  count: number;
  depth: number;
}

export const CATEGORY_TREE: CategoryNode[] = [
  { id: 6913, name: "ព្រឹត្តិការណ៍", slug: "all-news", count: 821, depth: 0 },
  { id: 957, name: "ព័ត៌មានកម្សាន្ត", slug: "entertainment-news", count: 7668, depth: 1 },
  { id: 959, name: "សង្គមសិល្បៈ", slug: "entertainment-celebrity-news", count: 5979, depth: 2 },
  { id: 960, name: "ភាពយន្តនិងតន្រ្តី", slug: "entertainment-movie-and-music-news", count: 1122, depth: 2 },
  { id: 963, name: "ព័ត៌មានកម្សាន្តប្លែកៗ", slug: "entertainment-strange-news", count: 602, depth: 2 },
  { id: 6915, name: "វប្បធម៌ ប្រពៃណី", slug: "entertainment-culture-news", count: 27, depth: 2 },
  { id: 958, name: "ព័ត៌មានរសនិយម", slug: "life-style-news", count: 2391, depth: 1 },
  { id: 956, name: "បំណិនជីវិត", slug: "life-style-life-tips-news", count: 9497, depth: 2 },
  { id: 970, name: "ទេសចរណ៍", slug: "life-style-travel-news", count: 1175, depth: 2 },
  { id: 967, name: "សុខភាពនិងសម្រស់", slug: "life-style-health-and-beauty-news", count: 555, depth: 2 },
  { id: 969, name: "ស្នេហានិងទំនាក់ទំនង", slug: "life-style-love-and-relation-news", count: 430, depth: 2 },
  { id: 6911, name: "ស្ថាបត្យកម្ម", slug: "life-style-architecture-news", count: 28, depth: 2 },
  { id: 971, name: "បទយកការណ៍", slug: "reports", count: 171, depth: 0 },
  { id: 972, name: "របាយការណ៍ព័ត៌មានកម្សាន្ត", slug: "entertainment-reports", count: 114, depth: 1 },
  { id: 980, name: "សង្គមសិល្បៈ", slug: "entertainment-celebrity-reports", count: 80, depth: 2 },
  { id: 984, name: "ព័ត៌មានកម្សាន្តប្លែកៗ", slug: "strange-reports", count: 15, depth: 2 },
  { id: 981, name: "ភាពយន្តនិងតន្រ្តី", slug: "movie-and-music-reports", count: 8, depth: 2 },
  { id: 6914, name: "វប្បធម៌ប្រពៃណី", slug: "entertainment-culture-reports", count: 0, depth: 2 },
  { id: 973, name: "របាយការណ៍រសនិយម", slug: "life-style-reports", count: 54, depth: 1 },
  { id: 986, name: "ទេសចរណ៍", slug: "life-style-travel-reports", count: 25, depth: 2 },
  { id: 987, name: "ស្នេហានិងទំនាក់ទំនង", slug: "life-style-love-and-relation-reports", count: 17, depth: 2 },
  { id: 991, name: "បំណិនជីវិត", slug: "life-style-life-tips-reports", count: 13, depth: 2 },
  { id: 989, name: "សុខភាពនិងសម្រស់", slug: "life-style-health-and-beauty-reports", count: 12, depth: 2 },
  { id: 6916, name: "ស្ថាបត្យកម្ម", slug: "life-style-architecture-reports", count: 0, depth: 2 },
  { id: 6621, name: "ព័ត៌មានទាន់ហេតុការណ៍", slug: "hot-news", count: 20, depth: 0 },
  { id: 1, name: "uncategories", slug: "uncategories", count: 11, depth: 0 },
];

// A sample article opened in the editor (the Angelina Jolie piece).
export const SAMPLE_ARTICLE = {
  title: "Angelina Jolie បង្ហាញអារម្មណ៍ក្ដុកក្ដួលចំពោះប្រជាជនកម្ពុជា",
  excerpt: "Angelina Jolie រំលឹកទំនាក់ទំនង ២៦ ឆ្នាំ ជាមួយប្រជាជនកម្ពុជា ក្នុងបទសម្ភាសន៍ថ្មី។",
  paragraphs: [
    "តារាភាពយន្តហូលីវូដដ៏ល្បីល្បាញ Angelina Jolie បានបង្ហាញអារម្មណ៍ក្ដុកក្ដួល នៅពេលដែលនាងបាននិយាយអំពីទំនាក់ទំនងដ៏ជិតស្និទ្ធរបស់នាងជាមួយប្រជាជនកម្ពុជា ក្នុងបទសម្ភាសន៍ថ្មីមួយកាលពីសប្ដាហ៍មុន។",
    "នាងបានលើកឡើងថា ប្រទេសកម្ពុជាបានផ្លាស់ប្ដូរជីវិតរបស់នាងទាំងស្រុង ចាប់តាំងពីនាងបានមកថតភាពយន្ត Tomb Raider នៅប្រាសាទអង្គរ ក្នុងឆ្នាំ ២០០០។",
  ],
  quote: "«កម្ពុជាបានបើកភ្នែកខ្ញុំឱ្យឃើញពិភពលោក។ ខ្ញុំនឹងមិនអាចបំភ្លេចសេចក្ដីសប្បុរសរបស់ប្រជាជនខ្មែរបានឡើយ»",
  seoTitle: "Angelina Jolie បង្ហាញអារម្មណ៍ចំពោះប្រជាជនកម្ពុជា",
  metaDescription: "Angelina Jolie រំលឹកទំនាក់ទំនងជិត ២៦ ឆ្នាំ ជាមួយកម្ពុជា និងការងារមូលនិធិរបស់នាងនៅសំឡូត។",
  tags: ["អង់ជេលីណា ចូលី", "ហូលីវូដ", "មូលនិធិ MJP"],
};

export interface UserRow {
  name: string;
  email: string;
  role: string;
  articles: number;
  active: string;
}

// Real team members with their actual roles and article counts.
export const USERS: UserRow[] = [
  { name: "Pheat Sophat", email: "p•••••t@amsinfotainment.com", role: "Administrator", articles: 275, active: "4 minutes ago" },
  { name: "Chhunlin San", email: "c•••••n@amsinfotainment.com", role: "Editor", articles: 280, active: "22 minutes ago" },
  { name: "LACH SREYKA", email: "l•••••a@amsinfotainment.com", role: "Editor", articles: 269, active: "1 hour ago" },
  { name: "Ponleu Heng Penh", email: "p•••••h@amsinfotainment.com", role: "SEO Manager", articles: 283, active: "35 minutes ago" },
  { name: "Soksinith Sin", email: "s•••••h@amsinfotainment.com", role: "Author", articles: 118, active: "3 hours ago" },
  { name: "Peou Sochakriya", email: "p•••••a@amsinfotainment.com", role: "Author", articles: 113, active: "Yesterday" },
  { name: "Channa Nou", email: "c•••••u@gmail.com", role: "Contributor", articles: 114, active: "Yesterday" },
  { name: "Sreylai Art", email: "s•••••t@gmail.com", role: "Author", articles: 31, active: "2 days ago" },
  { name: "Ravuth Sak", email: "r•••••k@amsinfotainment.com", role: "Author", articles: 29, active: "3 days ago" },
  { name: "Ratana Chhim", email: "r•••••m@gmail.com", role: "Contributor", articles: 13, active: "Jul 12, 2026" },
];

export const ROLE_OPTIONS = ["Administrator", "Editor", "Author", "Contributor", "SEO Manager", "SEO Editor", "Subscriber"];

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Top post tags for the tag manager (real names + counts; there are 5,571).
export const MANAGED_TAGS = [
  { name: "តារាជាតិ", count: 2927 },
  { name: "តារាកូរ៉េ", count: 2192 },
  { name: "តារាល្បីៗ", count: 1839 },
  { name: "សិល្បករ", count: 1610 },
  { name: "ចម្រៀង", count: 1204 },
  { name: "ខ្សែភាពយន្ត", count: 1088 },
  { name: "ម៉ូដ", count: 964 },
  { name: "សម្រស់", count: 902 },
  { name: "ស្នេហា", count: 848 },
  { name: "ហូលីវូដ", count: 771 },
  { name: "កូរ៉េ", count: 690 },
  { name: "ចិន", count: 655 },
];

// The signed-in user for the prototype. Drives the sidebar identity and greeting
// until auth is wired.
export const CURRENT_USER = {
  name: "Sophat Pheat",
  initials: "SP",
  role: "Administrator" as const,
};
