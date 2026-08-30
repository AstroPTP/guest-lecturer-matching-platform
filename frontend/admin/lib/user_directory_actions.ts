import { AccountStatus, VerificationStatus } from "@/types/admin";

export interface UserDirectoryAction {
  label: "Review" | "View Profile";
  href: string;
}

export type ProfileManagementAction =
  | "verify"
  | "suspend"
  | "request-verification"
  | "activate"
  | "reactivate";

const directoryActionLabels: Record<
  VerificationStatus,
  Record<AccountStatus, UserDirectoryAction["label"]>
> = {
  [VerificationStatus.UnderReview]: {
    [AccountStatus.Active]: "Review",
    [AccountStatus.Suspended]: "Review",
    [AccountStatus.Inactive]: "Review",
  },
  [VerificationStatus.Verified]: {
    [AccountStatus.Active]: "View Profile",
    [AccountStatus.Suspended]: "View Profile",
    [AccountStatus.Inactive]: "View Profile",
  },
};

export function getUserDirectoryAction(
  verificationStatus: VerificationStatus,
  accountStatus: AccountStatus,
  userId: string,
): UserDirectoryAction {
  return {
    label: directoryActionLabels[verificationStatus][accountStatus],
    href: "/dashboard/users/" + encodeURIComponent(userId),
  };
}

export function getProfileManagementActions(
  verificationStatus: VerificationStatus,
  accountStatus: AccountStatus,
): ProfileManagementAction[] {
  if (verificationStatus === VerificationStatus.UnderReview) {
    return ["verify", "suspend", "request-verification"];
  }

  if (accountStatus === AccountStatus.Suspended) return ["reactivate"];
  if (accountStatus === AccountStatus.Inactive) return ["activate"];
  return ["suspend"];
}
