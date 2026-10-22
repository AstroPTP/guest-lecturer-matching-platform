import { AccountStatus, VerificationStatus } from "@/types/admin";

export const verificationStatusOptions: readonly VerificationStatus[] = [
  VerificationStatus.UnderReview,
  VerificationStatus.Verified,
];

export const accountStatusOptions: readonly AccountStatus[] = [
  AccountStatus.Active,
  AccountStatus.Suspended,
];

/** CSS tokens, so the status colours follow the light and dark themes. */
export const statusColors: Record<VerificationStatus | AccountStatus, string> = {
  [VerificationStatus.UnderReview]: "var(--c-d97706)",
  [VerificationStatus.Verified]: "var(--c-15803d)",
  [AccountStatus.Active]: "var(--c-2563eb)",
  [AccountStatus.Suspended]: "var(--c-dc2626)",
  [AccountStatus.Inactive]: "var(--c-6b7280)",
};
