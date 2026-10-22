import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/AdminShell";

// Restates the template: a plain string title here would drop it for every
// page below. The root template still wraps the default, so it is just
// "Dashboard".
export const metadata: Metadata = {
  title: { default: "Dashboard", template: "Curtin GLMP | %s" },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
