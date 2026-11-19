import { ReactNode } from "react";

export interface DashboardMenuItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Listed only while that feature is on. Ranked matching is off until an administrator switches it on. */
  feature?: "suggestions";
}
