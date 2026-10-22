import type { Metadata } from "next";

export const metadata: Metadata = { title: "Guest lecturers" };

export default function LecturersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
