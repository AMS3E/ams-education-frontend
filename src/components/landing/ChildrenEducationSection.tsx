import LifestyleSection from "@/components/home/sections/LifestyleSection";
import { fetchHomeCards } from "@/lib/home-data";

/** "អប់រំសម្រាប់កុមារ" (category 639 — `report-children-education`), the same
 *  homepage block (LifestyleSection), added above ជំនាញ at the owner's
 *  request, 2026-08-27. */
export default async function ChildrenEducationSection() {
  const items = await fetchHomeCards({ pageSize: 4, categoryIds: "639" });
  return <LifestyleSection items={items} />;
}
