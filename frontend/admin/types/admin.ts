export enum VerificationStatus {
  UnderReview = "Under Review",
  Verified = "Verified",
}

export enum AccountStatus {
  Active = "Active",
  Suspended = "Deactivated",
  Inactive = "Inactive",
}
export type UserRole = "Guest Lecturer" | "Unit Coordinator";

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  joined: string;
  verificationStatus: VerificationStatus;
  accountStatus: AccountStatus;
}

export type UserDirectoryTab =
  | "All"
  | "Guest Lecturers"
  | "Unit Coordinators";

export type AuditCategory =
  | "Discovery"
  | "Match"
  | "Event"
  | "Invitation"
  | "Account Management";
export type AuditAction =
  | "Interest Expressed"
  | "Profile Dismissed"
  | "Discovery Action Undone"
  | "Match Created"
  | "Event Created"
  | "Event Updated"
  | "Event Cancelled"
  | "Invitation Sent"
  | "Invitation Accepted"
  | "Invitation Declined"
  | "User Reported"
  | "User Verified"
  | "Account Suspended"
  | "Account Reactivated"
  | "Account Deactivated"
  | "Profile Approved"
  | "Settings Changed"
  | "Report Resolved";
export type AuditStatus = "Success" | "Failed" | "Pending";
export type AuditActorRole =
  | "Administrator"
  | "System"
  | "Unit Coordinator"
  | "Guest Lecturer";

export interface AuditEntry {
  timestamp: string;
  actorName: string;
  actorRole: AuditActorRole;
  action: AuditAction;
  target: string;
  targetType: "Profile" | "Match" | "Event" | "Invitation" | "Account";
  category: AuditCategory;
  status: AuditStatus;
}

export type NotificationType = "Matching" | "User" | "Security" | "Event";
export type NotificationGroup = "Today" | "Yesterday" | "Earlier";

export interface AdminNotification {
  id: number;
  title: string;
  description: string;
  time: string;
  group: NotificationGroup;
  type: NotificationType;
  actionLabel: string;
  href: string;
  read: boolean;
}

export interface AdminConfiguration {
  systemName: string;
  supportEmail: string;
  universityLogo: string | null;
  registration: {
    enabled: boolean;
    requireEmailVerification: boolean;
    requireAdminApproval: boolean;
    allowGuestLecturer: boolean;
    allowUnitCoordinator: boolean;
    deadline: string;
  };
  notifications: {
    email: boolean;
    matches: boolean;
    eventReminders: boolean;
    systemAnnouncements: boolean;
  };
}
