import { backendFetch } from "@/lib/api/backendClient";
import type { AccountSettings, ActionResult, RequestEmailChangeResult } from "@/types/settings/settingsTypes";

/** Calls a settings endpoint and turns any failure into an ActionResult. */
async function action(path: string, method: string, body?: object): Promise<ActionResult> {
  try {
    return await backendFetch<ActionResult>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "The request failed. Please retry." };
  }
}

/** Sets a new password after the forgot-password OTP has signed the user in. */
export function resetPassword(newPassword: string): Promise<ActionResult> {
  return action("/settings/reset-password", "PATCH", { newPassword });
}

export function getAccountSettings(): Promise<AccountSettings> {
  return backendFetch<AccountSettings>("/settings");
}

/** Auth0 changes the email straight away and emails a verification link. */
export function requestEmailChange(newEmail: string, currentPassword: string): Promise<RequestEmailChangeResult> {
  return action("/settings/email", "PATCH", { newEmail, currentPassword });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  return action("/settings/password", "PATCH", { currentPassword, newPassword });
}

export function deleteAccount(): Promise<ActionResult> {
  return action("/settings", "DELETE");
}
