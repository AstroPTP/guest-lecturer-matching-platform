import { backendFetch } from "@/lib/api/backendClient";
import { NOT_INTEGRATED_MESSAGE, notIntegrated } from "@/lib/serviceErrors";
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

export async function getAccountSettings(_seedEmail: string): Promise<AccountSettings> {
  return notIntegrated();
}
export async function requestEmailChange(_newEmail: string, _currentPassword: string): Promise<RequestEmailChangeResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}

export async function confirmEmailChange(_code: string): Promise<ActionResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}

export function cancelEmailChange(): void {}
export async function changePassword(_currentPassword: string, _newPassword: string): Promise<ActionResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}

export async function deleteAccount(): Promise<ActionResult> {
  return { success: false, error: NOT_INTEGRATED_MESSAGE };
}
