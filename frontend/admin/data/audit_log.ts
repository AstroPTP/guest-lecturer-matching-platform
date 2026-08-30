import type { AuditActorRole, AuditCategory, AuditEntry } from "@/types/admin";

export const auditEntries: AuditEntry[] = [
  { timestamp: "2026-05-31\n14:22:10", actorName: "System", actorRole: "System", action: "Match Created", target: "Jordan Lee ↔ Elena Rodriguez", targetType: "Match", category: "Match", status: "Success" },
  { timestamp: "2026-05-30\n09:10:44", actorName: "Jordan Lee", actorRole: "Unit Coordinator", action: "Event Created", target: "Industry Insights Workshop", targetType: "Event", category: "Event", status: "Success" },
  { timestamp: "2026-05-30\n09:15:02", actorName: "Jordan Lee", actorRole: "Unit Coordinator", action: "Invitation Sent", target: "Elena Rodriguez", targetType: "Invitation", category: "Invitation", status: "Success" },
  { timestamp: "2026-05-30\n16:40:12", actorName: "Elena Rodriguez", actorRole: "Guest Lecturer", action: "Invitation Accepted", target: "Industry Insights Workshop", targetType: "Invitation", category: "Invitation", status: "Success" },
  { timestamp: "2026-05-29\n13:45:02", actorName: "Sarah Miller", actorRole: "Administrator", action: "User Verified", target: "Michael Fernando", targetType: "Profile", category: "Account Management", status: "Success" },
  { timestamp: "2026-05-28\n11:02:37", actorName: "Elena Rodriguez", actorRole: "Guest Lecturer", action: "Interest Expressed", target: "Data Analytics guest lecture", targetType: "Profile", category: "Discovery", status: "Success" },
  { timestamp: "2026-05-27\n15:18:42", actorName: "Marcus Thorne", actorRole: "Guest Lecturer", action: "Invitation Declined", target: "Research Futures Workshop", targetType: "Invitation", category: "Invitation", status: "Success" },
  { timestamp: "2026-05-27\n15:20:09", actorName: "Sarah Miller", actorRole: "Administrator", action: "Event Cancelled", target: "Research Futures Workshop", targetType: "Event", category: "Event", status: "Success" },
  { timestamp: "2026-05-26\n08:52:37", actorName: "Jordan Lee", actorRole: "Unit Coordinator", action: "Event Updated", target: "Accounting Careers Panel", targetType: "Event", category: "Event", status: "Success" },
  { timestamp: "2026-05-24\n10:05:31", actorName: "Elena Rodriguez", actorRole: "Guest Lecturer", action: "Profile Dismissed", target: "Marketing Strategy opportunity", targetType: "Profile", category: "Discovery", status: "Success" },
  { timestamp: "2026-05-22\n10:18:05", actorName: "Sarah Miller", actorRole: "Administrator", action: "Account Suspended", target: "Ryan Cole", targetType: "Account", category: "Account Management", status: "Success" },
  { timestamp: "2026-05-21\n09:42:16", actorName: "Sarah Miller", actorRole: "Administrator", action: "Account Reactivated", target: "Marcus Thorne", targetType: "Account", category: "Account Management", status: "Success" },
  { timestamp: "2026-05-20\n12:14:08", actorName: "System", actorRole: "System", action: "Discovery Action Undone", target: "Elena Rodriguez discovery action", targetType: "Profile", category: "Discovery", status: "Failed" },
  { timestamp: "2026-05-19\n08:30:00", actorName: "Sarah Miller", actorRole: "Administrator", action: "Account Deactivated", target: "Former lecturer account", targetType: "Account", category: "Account Management", status: "Pending" },
];

export const auditCategories: AuditCategory[] = [
  "Discovery",
  "Match",
  "Event",
  "Invitation",
  "Account Management",
];

export const auditActorRoles: AuditActorRole[] = [
  "Guest Lecturer",
  "Unit Coordinator",
  "Administrator",
  "System",
];

export const auditDateRange = {
  start: "2026-05-01T00:00",
  end: "2026-05-31T23:59",
} as const;

export const auditMetrics = [
  { label: "Total actions", value: "2,841" },
  { label: "Sensitive actions", value: "42" },
  { label: "Active admins", value: "12" },
  { label: "Failed actions", value: "27" },
] as const;

export const auditEntryTotal = 2841;
