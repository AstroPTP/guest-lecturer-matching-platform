import type { Metadata } from "next";

// The template is restated because this segment has a page below it.
export const metadata: Metadata = {
  title: { default: "Users", template: "Curtin GLMP | %s" },
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
