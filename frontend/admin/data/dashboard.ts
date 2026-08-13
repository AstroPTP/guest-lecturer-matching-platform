import { VerificationStatus } from "@/types/admin";

export const dashboardSummary = [
  { key: "users", label: "Total users", value: "142", detail: "+12% from last month" },
  { key: "approvals", label: "Pending approvals", value: "14", detail: "Awaiting verification" },
  { key: "matches", label: "Active matches", value: "38", detail: "Currently processing" },
  { key: "events", label: "Upcoming events", value: "9", detail: "Scheduled in the next 7 days" },
] as const;

export const recentRegistrations: ReadonlyArray<{
  name: string;
  date: string;
  verificationStatus: VerificationStatus;
}> = [
  { name: "Michael Don", date: "Registered 2h ago", verificationStatus: VerificationStatus.Verified },
  { name: "Dr. S. Mitchell", date: "Registered 5h ago", verificationStatus: VerificationStatus.UnderReview },
  { name: "Elena Rodriguez", date: "Registered yesterday", verificationStatus: VerificationStatus.Verified },
];

export const weeklyRegistrations = [
  { label: "Mon", value: 8, height: 36, color: "#93c5fd" },
  { label: "Tue", value: 11, height: 50, color: "#60a5fa" },
  { label: "Wed", value: 15, height: 68, color: "#38bdf8" },
  { label: "Thu", value: 20, height: 88, color: "#2563eb" },
  { label: "Fri", value: 14, height: 62, color: "#2dd4bf" },
  { label: "Sat", value: 12, height: 55, color: "#818cf8" },
  { label: "Sun", value: 9, height: 41, color: "#a78bfa" },
] as const;

export const dashboardMonthlyRegistrations = [
  { label: "Feb", value: 46, height: 52, color: "#93c5fd" },
  { label: "Mar", value: 58, height: 65, color: "#60a5fa" },
  { label: "Apr", value: 51, height: 58, color: "#38bdf8" },
  { label: "May", value: 73, height: 82, color: "#2dd4bf" },
  { label: "Jun", value: 68, height: 76, color: "#818cf8" },
  { label: "Jul", value: 89, height: 100, color: "#2563eb" },
] as const;
