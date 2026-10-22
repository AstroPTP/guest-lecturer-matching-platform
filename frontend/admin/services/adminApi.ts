import { backendFetch } from '@/lib/api/backendClient';
import {
  AccountStatus,
  VerificationStatus,
  type AuditAction,
  type AuditActorRole,
  type AuditCategory,
  type AuditEntry,
  type DirectoryUser,
  type SecuritySignals,
  type SystemSnapshot,
  type UserRole,
} from '@/types/admin';

/**
 * The administrator portal's view of the API.
 *
 * Every call goes through the portal's own server route (/api/backend/*), so
 * the access token stays in an HTTP-only cookie on the server and never
 * reaches browser JavaScript.
 *
 * Scope is the metrics the client asked for: matches made, users who have
 * signed in, contacts made, profiles created, and requests per coordinator.
 */

export interface AdminOverview {
  generatedAt: string;
  people: {
    active: number;
    deactivated: number;
    guestSpeakers: number;
    unitCoordinators: number;
    administrators: number;
  };
  profiles: { created: number; createdLast30Days: number };
  signIns: { last30Days: number };
  contacts: { raised: number; accepted: number; declined: number; pending: number; acceptanceRate: number };
  registrationsByWeek: { label: string; count: number }[];
  recentRegistrations: { id: string; email: string; role: string; registeredAt: string | null }[];
}

export interface CoordinatorActivity {
  coordinatorId: string;
  userId: string | null;
  name: string;
  faculty: string | null;
  requests: number;
  accepted: number;
}

interface AdminUserRow {
  id: string;
  email: string | null;
  role: string | null;
  name: string | null;
  detail: string | null;
  status: 'active' | 'deactivated';
  registeredAt: string | null;
  lastSignInAt: string | null;
}

// Theme variables with fallbacks, so the charts render whether or not the
// themed stylesheet is present.
const PALETTE = [
  'var(--chart-1, #2563eb)',
  'var(--chart-2, #7c3aed)',
  'var(--chart-3, #0891b2)',
  'var(--chart-4, #15803d)',
  'var(--chart-5, #d97706)',
  'var(--chart-6, #dc2626)',
];

/** Sizes a bar against the largest value in the set, as the charts expect. */
export function withHeights<T extends { value: number }>(points: T[]): (T & { height: number; color: string })[] {
  const largest = Math.max(1, ...points.map((point) => point.value));
  return points.map((point, index) => ({
    ...point,
    height: Math.round((point.value / largest) * 100),
    color: PALETTE[index % PALETTE.length],
  }));
}

export function withWidths<T extends { value: number }>(points: T[]): (T & { width: number; color: string })[] {
  const largest = Math.max(1, ...points.map((point) => point.value));
  return points.map((point, index) => ({
    ...point,
    width: Math.round((point.value / largest) * 100),
    color: PALETTE[index % PALETTE.length],
  }));
}

export function relativeDay(value?: string | null): string {
  if (!value) return 'Never';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return 'Unknown';
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return when.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toUserRole(role: string | null): UserRole {
  return role === 'unit_coordinator' ? 'Unit Coordinator' : 'Guest Lecturer';
}

/** Directory ids read "#GL-12" or "#UC-7"; the number is the user id. */
export function numericId(directoryIdValue: string): string {
  const match = /(\d+)\s*$/.exec(directoryIdValue);
  return match ? match[1] : directoryIdValue;
}

function toDirectoryUser(row: AdminUserRow): DirectoryUser {
  const role = toUserRole(row.role);
  return {
    id: `#${role === 'Unit Coordinator' ? 'UC' : 'GL'}-${row.id}`,
    name: row.name || (row.email ?? '').split('@')[0] || 'Unnamed',
    email: row.email ?? '',
    role,
    joined: relativeDay(row.registeredAt),
    // There is no verification step in the agreed scope; a profile that exists is live.
    verificationStatus: VerificationStatus.Verified,
    accountStatus: row.status === 'deactivated' ? AccountStatus.Suspended : AccountStatus.Active,
  };
}

/** Administrator accounts are managed in Auth0 and are not listed with guest lecturers and coordinators. */
const isDirectoryRole = (row: AdminUserRow) => row.role === 'guest_speaker' || row.role === 'unit_coordinator';

export async function getUsers(): Promise<DirectoryUser[]> {
  const rows = await backendFetch<AdminUserRow[]>('/admin/users');
  return rows.filter(isDirectoryRole).map(toDirectoryUser);
}

export async function getUser(directoryIdValue: string): Promise<DirectoryUser | null> {
  const id = numericId(directoryIdValue);
  const rows = await backendFetch<AdminUserRow[]>('/admin/users');
  const row = rows.find((candidate) => candidate.id === id);
  return row ? toDirectoryUser(row) : null;
}

/** Deactivating locks the account out on its next request; reactivating restores it. */
export async function setUserStatus(
  directoryIdValue: string,
  status: 'active' | 'deactivated',
): Promise<{ id: string; status: 'active' | 'deactivated' }> {
  return backendFetch(`/admin/users/${numericId(directoryIdValue)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getOverview(): Promise<AdminOverview> {
  return backendFetch<AdminOverview>('/admin/overview');
}

export async function getCoordinatorActivity(): Promise<CoordinatorActivity[]> {
  return backendFetch<CoordinatorActivity[]>('/admin/contacts-per-coordinator');
}

export interface LecturerSummary {
  id: string;
  name: string;
  field: string;
  status: 'Active' | 'Deactivated';
  lastSignIn: string;
}

export interface CoordinatorSummary {
  id: string;
  userId: string | null;
  name: string;
  faculty: string;
  requests: number;
  accepted: number;
}

export async function getLecturers(): Promise<LecturerSummary[]> {
  const rows = await backendFetch<AdminUserRow[]>('/admin/users');
  return rows
    .filter((row) => row.role === 'guest_speaker')
    .map((row) => ({
      id: row.id,
      name: row.name || row.email || 'Unnamed',
      field: row.detail ?? 'Not given',
      status: row.status === 'deactivated' ? 'Deactivated' : 'Active',
      lastSignIn: relativeDay(row.lastSignInAt),
    }));
}

export async function getCoordinators(): Promise<CoordinatorSummary[]> {
  const rows = await getCoordinatorActivity();
  return rows.map((row) => ({
    id: row.coordinatorId,
    userId: row.userId,
    name: row.name,
    faculty: row.faculty ?? 'Not given',
    requests: row.requests,
    accepted: row.accepted,
  }));
}

/** The CSV usage report, fetched through the server route and saved by the browser. */
export async function downloadUsageReport(): Promise<void> {
  const response = await fetch('/api/backend/admin/report.csv', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`The report could not be generated (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `platform-usage-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Verification queue
// ---------------------------------------------------------------------------

export interface PendingProfile {
  guestId: string;
  userId: string | null;
  name: string;
  field: string | null;
  role: string | null;
  email: string | null;
  submittedAt: string;
}

export async function getPendingReviews(): Promise<PendingProfile[]> {
  return backendFetch<PendingProfile[]>('/admin/reviews');
}

export async function approveGuest(guestId: string): Promise<void> {
  await backendFetch(`/admin/reviews/${guestId}/approve`, { method: 'PATCH' });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  actorEmail: string | null;
  actorRole: string | null;
  occurredAt: string;
}

/**
 * How each stored action reads in the log. An action with no entry here is
 * shown as itself rather than hidden: an unrecognised action in an audit log
 * is exactly what somebody needs to see.
 */
const ACTION_LABELS: Record<string, { label: AuditAction; category: AuditCategory }> = {
  'user.deactivated': { label: 'Account Deactivated', category: 'Account Management' },
  'user.reactivated': { label: 'Account Reactivated', category: 'Account Management' },
  'user.reported': { label: 'User Reported', category: 'Account Management' },
  'report.resolved': { label: 'Report Resolved', category: 'Account Management' },
  'user.held': { label: 'Account Held', category: 'Account Management' },
  'user.released': { label: 'Account Released', category: 'Account Management' },
  'guest.approved': { label: 'Profile Approved', category: 'Account Management' },
  'settings.updated': { label: 'Settings Changed', category: 'Account Management' },
  'user.signed_in': { label: 'Signed In', category: 'Security' },
  'retention.purge': { label: 'Retention Purge', category: 'System' },
};

/**
 * The actions the Audit Log can be narrowed to, for its filter. Taken from
 * ACTION_LABELS so a label added there appears in the filter without a second
 * edit.
 */
export const AUDIT_ACTION_FILTERS = Object.entries(ACTION_LABELS).map(
  ([action, { label }]) => ({ action, label }),
);

const ACTOR_ROLES: Record<string, AuditActorRole> = {
  ccae_admin: 'Administrator',
  unit_coordinator: 'Unit Coordinator',
  guest_speaker: 'Guest Lecturer',
};

/**
 * The correlation id the backend stored in the entry's detail, if there is a
 * well-formed one. Entries written before ids were recorded, and entries from
 * scheduled jobs that run outside any request, have none.
 */
function correlationIdOf(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const id = (detail as { correlationId?: unknown }).correlationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function toAuditEntry(row: AuditRow): AuditEntry {
  const known = ACTION_LABELS[row.action];
  const when = new Date(row.occurredAt);
  return {
    // The two-line form the table renders and the date filter parses.
    // Local date and local time, matching the date-range inputs the page filters with.
    timestamp: `${when.toLocaleDateString('en-CA')}\n${when.toTimeString().slice(0, 8)}`,
    actorName: row.actorEmail ?? 'System',
    actorRole: (row.actorRole && ACTOR_ROLES[row.actorRole]) || 'System',
    action: known?.label ?? (row.action as AuditAction),
    target: row.targetId ? `${row.targetType ?? 'record'} ${row.targetId}` : row.targetType ?? 'platform',
    targetType: row.targetType === 'guest' ? 'Profile' : 'Account',
    category: known?.category ?? 'Account Management',
    status: 'Success',
    correlationId: correlationIdOf(row.detail),
  };
}

/**
 * Newest first. `action` is the stored key, such as "user.signed_in", and is
 * filtered on the server: a busy action like sign-ins would otherwise fill the
 * whole page of rows and push everything else out of view.
 */
export async function getAuditEntries(limit = 200, action?: string): Promise<AuditEntry[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (action) query.set('action', action);
  const rows = await backendFetch<AuditRow[]>(`/admin/audit-entries?${query.toString()}`);
  return rows.map(toAuditEntry);
}

// ---------------------------------------------------------------------------
// Events and notifications
// ---------------------------------------------------------------------------

export interface AdminEvent {
  id: string;
  title: string;
  coordinator: string;
  guestLecturer: string;
  date: string;
  startTime: string;
  format: string;
  status: string;
}

export interface AdminEvents {
  events: AdminEvent[];
  notifications: { sent: number; unread: number; lastSevenDays: number };
}

export async function getAdminEvents(): Promise<AdminEvents> {
  return backendFetch<AdminEvents>('/admin/events');
}

// ---------------------------------------------------------------------------
// Moderation queue
// ---------------------------------------------------------------------------

export interface OpenReport {
  id: string;
  reason: string;
  reporterEmail: string | null;
  reporterName: string | null;
  reporterRole: string | null;
  reportedUserId: string | null;
  reportedEmail: string | null;
  reportedName: string | null;
  reportedRole: string | null;
  reportedStatus: 'active' | 'deactivated';
  /** The match the report was raised from; null for a report made without one. */
  matchId: string | null;
  /** How many different people have an open report from a match about this person. */
  openReporters: number;
  /** How many of those it takes to put the person on hold for everyone. */
  holdThreshold: number;
  /** True while the person is hidden from everyone and cannot message. */
  onHold: boolean;
  /** Why: enough different reporters ("threshold"), or an administrator ("admin"). */
  holdReasons: ('threshold' | 'admin')[];
  /** True when an administrator's hold on this person was placed for this report. */
  coveredByHold: boolean;
  reportedAt: string;
}

export async function getOpenReports(): Promise<OpenReport[]> {
  return backendFetch<OpenReport[]>('/admin/reports');
}

/** Holds the person a report is about, for everyone, until the reports are decided. */
export async function holdReport(id: string): Promise<void> {
  await backendFetch(`/admin/reports/${id}/hold`, { method: 'POST' });
}

export async function resolveReport(
  id: string,
  outcome: 'dismissed' | 'deactivated',
): Promise<void> {
  await backendFetch(`/admin/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ outcome }),
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface PlatformSettings {
  systemName: string;
  supportEmail: string;
  requireAdminApproval: boolean;
  contactLimitDays: number;
  updatedAt: string;
}

export async function getSettings(): Promise<PlatformSettings> {
  return backendFetch<PlatformSettings>('/admin/settings');
}

export async function saveSettings(
  changes: Partial<Omit<PlatformSettings, 'updatedAt'>>,
): Promise<PlatformSettings> {
  return backendFetch<PlatformSettings>('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

// ---------------------------------------------------------------------------
// System analytics
// ---------------------------------------------------------------------------

/**
 * Health, storage and usage, measured when the request arrives.
 *
 * Never cached: a status page that shows what was true a minute ago, without
 * saying so, is worse than no status page.
 */
export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  return backendFetch<SystemSnapshot>('/admin/system', { cache: 'no-store' });
}

/** Failed sign-ins, refused admin requests, rate limiting and server errors. */
export async function getSecuritySignals(): Promise<SecuritySignals> {
  return backendFetch<SecuritySignals>('/admin/system/security', { cache: 'no-store' });
}
