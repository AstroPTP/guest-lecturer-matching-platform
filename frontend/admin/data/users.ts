import {
  AccountStatus,
  VerificationStatus,
  type DirectoryUser,
  type UserDirectoryTab,
} from "@/types/admin";

export const initialUsers: DirectoryUser[] = [
  {
    id: "#GL-4921",
    name: "Michael Fernando",
    email: "m.fernando@university.edu",
    role: "Guest Lecturer",
    joined: "Today",
    verificationStatus: VerificationStatus.UnderReview,
    accountStatus: AccountStatus.Inactive,
  },
  {
    id: "#UC-1102",
    name: "Dr. Sarah Jenkins",
    email: "s.jenkins@faculty.io",
    role: "Unit Coordinator",
    joined: "Oct 12, 2023",
    verificationStatus: VerificationStatus.Verified,
    accountStatus: AccountStatus.Active,
  },
  {
    id: "#GL-3850",
    name: "Marcus Thorne",
    email: "m.thorne@research.net",
    role: "Guest Lecturer",
    joined: "Yesterday",
    verificationStatus: VerificationStatus.Verified,
    accountStatus: AccountStatus.Suspended,
  },
];

export const userDirectoryTabs: UserDirectoryTab[] = [
  "All",
  "Guest Lecturers",
  "Unit Coordinators",
];

export const userDirectoryTotal: number = 248;

export const userSummary = [
  { label: "Total users", value: "2,482", detail: "+12% from last month" },
  { label: "Active lecturers", value: "842" },
  { label: "Pending approvals", value: "18" },
  { label: "New registrations", value: "42" },
] as const;
