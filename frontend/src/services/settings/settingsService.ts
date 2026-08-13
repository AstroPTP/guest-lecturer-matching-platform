import type { AccountSettings, ActionResult, RequestEmailChangeResult } from "@/types/settings/settingsTypes";

// TODO(AUTH): This module is the settings service boundary. No account
// settings (email, password, pending email-change state) may be persisted
// in the browser. Replace each stub with the endpoints in
// BACKEND_HANDOFF.md while keeping these exported function names/signatures
// stable.

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

// TODO(API): Replace with GET /api/users/me (email) plus any account
// settings the backend exposes. Never source or store a password value here.
export async function getAccountSettings(_userId: string, _seedEmail: string): Promise<AccountSettings> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

// TODO(API): Replace with POST /api/users/me/email-change/request
// { newEmail, currentPassword }. The backend must generate/store/expire the
// OTP and send it by email; it must never return the code to the client.
export async function requestEmailChange(_userId: string, _newEmail: string, _currentPassword: string): Promise<RequestEmailChangeResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}

// TODO(API): Replace with POST /api/users/me/email-change/confirm { code }.
export async function confirmEmailChange(_userId: string, _code: string): Promise<ActionResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}

export function cancelEmailChange(_userId: string): void {
  // No pending email-change state is kept client-side anymore; nothing to clear.
}

// TODO(API): Replace with PUT /api/users/me/password { currentPassword, newPassword }.
export async function changePassword(_userId: string, _currentPassword: string, _newPassword: string): Promise<ActionResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}

// TODO(API): Replace with DELETE /api/users/me (re-auth token/confirmation).
// TODO(BACKEND): Define whether deletion is immediate, soft-delete or async.
export async function deleteAccount(_userId: string): Promise<ActionResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}
