import { AccountStatus, VerificationStatus } from "@/types/admin";

export const verificationStatusOptions: readonly VerificationStatus[] = [
  VerificationStatus.UnderReview,
  VerificationStatus.Verified,
];

export const accountStatusOptions: readonly AccountStatus[] = [
  AccountStatus.Active,
  AccountStatus.Suspended,
];

export const statusColors: Record<VerificationStatus | AccountStatus, string> = {
  [VerificationStatus.UnderReview]: "#d97706",
  [VerificationStatus.Verified]: "#15803d",
  [AccountStatus.Active]: "#2563eb",
  [AccountStatus.Suspended]: "#dc2626",
  [AccountStatus.Inactive]: "#6b7280",
};
