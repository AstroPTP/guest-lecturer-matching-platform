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
  | "Report Resolved"
  | "Details Requested"
  | "Request Replied"
  | "Request Closed"
  | "Request Reopened";
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

// ---------------------------------------------------------------------------
// System analytics: /admin/system and /admin/system/security
// ---------------------------------------------------------------------------

/**
 * How one measurement or the system as a whole is doing.
 *
 * "unknown" is not a fault: it means the figure could not be worked out (the
 * host does not report it, or nothing is configured to measure it), and the
 * check's message says which.
 */
export type CheckStatus = "healthy" | "warning" | "unavailable" | "unknown";

export type SystemCheckKey =
  | "api"
  | "database"
  | "database_size"
  | "disk"
  | "memory"
  | "cpu"
  | "error_rate"
  | "retention";

export interface SystemCheck {
  key: SystemCheckKey;
  label: string;
  status: CheckStatus;
  value: number | null;
  unit: string | null;
  threshold: { warning: number | null; critical: number | null } | null;
  message: string;
  checkedAt: string;
}

export interface SystemSnapshot {
  checkedAt: string;
  overall: CheckStatus;
  uptimeSeconds: number;
  checks: SystemCheck[];
  storage: {
    databaseBytes: number | null;
    databaseLimitBytes: number | null;
    photosBytes: number | null;
    largestTables: { table: string; rows: number; bytes: number }[];
    disk: { path: string; totalBytes: number; freeBytes: number } | null;
    memory: { totalBytes: number; freeBytes: number; processRssBytes: number };
  };
  usage: {
    activeUsers24h: number | null;
    activeUsers7d: number | null;
    newAccounts7d: number | null;
    matchRequests7d: number | null;
    messages7d: number | null;
    photosStored: number | null;
  };
  alerts: { key: string; status: "warning" | "unavailable"; message: string }[];
}

export type SecurityCategory =
  | "auth_failure"
  | "admin_forbidden"
  | "rate_limited"
  | "server_error";

export interface SecurityCounts {
  authFailures: number;
  adminForbidden: number;
  rateLimited: number;
  serverErrors: number;
}

export interface SecurityEvent {
  at: string;
  category: SecurityCategory;
  method: string;
  path: string;
  status: number;
  userId: number | null;
}

export interface SecuritySignals {
  startedAt: string;
  windowMinutes: number;
  counts: SecurityCounts;
  countsSinceStart: SecurityCounts;
  alerts: { key: string; status: "warning"; message: string }[];
  recent: SecurityEvent[];
  authProviderNote: string;
}
