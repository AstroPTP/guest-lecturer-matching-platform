import { NOT_INTEGRATED_MESSAGE, notIntegrated } from "@/lib/serviceErrors";
import type { AccountSettings, ActionResult, RequestEmailChangeResult } from "@/types/settings/settingsTypes";

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
