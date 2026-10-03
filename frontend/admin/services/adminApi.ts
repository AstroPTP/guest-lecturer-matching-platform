import { backendFetch } from '@/lib/api/backendClient';
import { AccountStatus, VerificationStatus, type DirectoryUser, type UserRole } from '@/types/admin';

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
