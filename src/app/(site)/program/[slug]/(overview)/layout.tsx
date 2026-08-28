import { notFound } from "next/navigation";
import { routedProgram } from "@/lib/programs";

// A 404 gate for the program overview — see the long note in
// src/app/(site)/article/[slug]/layout.tsx for why this is a layout and not part
// of the page. Short version: this segment has a `loading.tsx`, the status is
// committed the moment its fallback flushes, and a layout in the same segment is
// the one thing that boundary does not wrap.
//
// Free here, unlike the article gate: routedProgram reads the program registry,
// which is React-cached within the request and ISR-cached across them, so the
// page's own lookup costs nothing and the loading skeleton is unaffected.
export default async function ProgramNotFoundGate({ children, params }: LayoutProps<"/program/[slug]">) {
  const { slug } = await params;
  if (!(await routedProgram(slug))) notFound();
  return children;
}
