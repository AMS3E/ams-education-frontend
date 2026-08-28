import HomeView from "@/components/home/HomeView";

// ISR, matching the category listings and the landing pages. This route reads
// NO request-time API — the ព្រឹត្តិការណ៍ប្រចាំថ្ងៃ pager lives at /page/[n] — so
// it prerenders, and a WordPress outage serves the last good copy instead of a
// 500. See the note in HomeView for why the pager had to leave the query string.
export const revalidate = 3600;

export default function Home() {
  return <HomeView page={1} />;
}
