import type { AdminConfiguration } from "@/types/admin";

export const defaultAdminConfiguration: AdminConfiguration = {
  systemName: "Guest Lecturer Matching System",
  supportEmail: "support@curtin.edu.au",
  universityLogo: null,
  registration: {
    enabled: true,
    requireEmailVerification: true,
    requireAdminApproval: true,
    allowGuestLecturer: true,
    allowUnitCoordinator: true,
    deadline: "2026-08-14",
  },
  notifications: {
    email: true,
    matches: true,
    eventReminders: true,
    systemAnnouncements: true,
  },
};

export const registrationSettingDefinitions = [
  {
    key: "enabled",
    label: "Registration Status",
    description: "Enable or disable new account registrations across the platform.",
  },
  {
    key: "requireEmailVerification",
    label: "Require Email Verification",
    description: "Users must verify their email address before accessing the system.",
  },
  {
    key: "requireAdminApproval",
    label: "Require Admin Approval",
    description: "Administrators must approve newly registered accounts before activation.",
  },
  {
    key: "allowGuestLecturer",
    label: "Allow Guest Lecturer Registration",
    description: "Enable or disable registration for Guest Lecturer accounts.",
  },
  {
    key: "allowUnitCoordinator",
    label: "Allow Unit Coordinator Registration",
    description: "Enable or disable registration for Unit Coordinator accounts.",
  },
] as const;

export const notificationSettingDefinitions = [
  {
    key: "email",
    label: "Email Notifications",
    description: "Send platform notifications to users through their registered email address.",
  },
  {
    key: "matches",
    label: "Match Notifications",
    description: "Notify users when matches are created, updated or confirmed.",
  },
  {
    key: "eventReminders",
    label: "Event Reminders",
    description: "Send reminders before scheduled guest lecturer events.",
  },
  {
    key: "systemAnnouncements",
    label: "System Announcements",
    description: "Notify users about important platform updates and service announcements.",
  },
] as const;
