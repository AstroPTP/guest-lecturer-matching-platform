import { backendFetch } from "@/lib/api/backendClient";
import type { PushKeyResponse, PushSubscriptionBody } from "@/types/notifications/pushTypes";

export async function getPushKey(): Promise<PushKeyResponse> {
  return backendFetch("/notifications/push/key");
}

export async function subscribePush(body: PushSubscriptionBody): Promise<{ subscribed: boolean }> {
  return backendFetch("/notifications/push/subscribe", { method: "POST", body: JSON.stringify(body) });
}

export async function unsubscribePush(endpoint: string): Promise<{ removed: boolean }> {
  return backendFetch("/notifications/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) });
}

/** Sends a short test to the signed-in person's devices. Returns how many took it. */
export async function sendTestPush(): Promise<{ sent: number }> {
  return backendFetch("/notifications/push/test", { method: "POST" });
}
