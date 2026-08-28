import type { Metadata } from "next";
import ProgramIndex from "@/components/program/ProgramIndex";
import { getFeaturedPrograms, POSTER_COUNT } from "@/lib/navigation";

export const revalidate = false;

export const metadata: Metadata = {
  title: "កម្មវិធីទាំងអស់",
  description: "ជ្រើសរើសកម្មវិធី និងវគ្គវីដេអូរបស់ AMS Infotainment។",
};

export default async function ProgramsPage() {
  const programs = await getFeaturedPrograms(POSTER_COUNT.articleStrip);
  return <ProgramIndex programs={programs} />;
}
