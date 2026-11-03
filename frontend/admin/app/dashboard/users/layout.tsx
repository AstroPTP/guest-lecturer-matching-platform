import type { Metadata } from "next";
import { BRAND_NAME } from "@/components/brand/BrandLogo";

// The template is restated because this segment has a page below it.
export const metadata: Metadata = {
  title: { default: "Users", template: `${BRAND_NAME} | %s` },
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
