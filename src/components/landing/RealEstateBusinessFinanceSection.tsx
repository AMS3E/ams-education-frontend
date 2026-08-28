import RealEstateFinanceSection from "@/components/home/sections/RealEstateFinanceSection";
import { categoryRefsByIds } from "@/lib/articles";

/** Homepage-style scholarship/award/talent card rows beside national-news
 *  stories — the same recirculation block the homepage runs (see
 *  home-data.ts), reused at the tail of every landing page. Was fetching the
 *  dead Economy slugs (news-realestate/news-business/news-finance), silently
 *  empty everywhere. ទេពកោសល្យ (255) added below ពានរង្វាន់ at the owner's
 *  request, 2026-08-27. */
export default async function RealEstateBusinessFinanceSection() {
  const [scholarships, awards, talent, nationalNews] = await Promise.all([
    categoryRefsByIds("251", 3),
    categoryRefsByIds("253", 3),
    categoryRefsByIds("255", 3),
    categoryRefsByIds("723", 5),
  ]);

  return <RealEstateFinanceSection scholarships={scholarships} awards={awards} talent={talent} nationalNews={nationalNews} />;
}
