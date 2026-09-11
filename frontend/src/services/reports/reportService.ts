import { notIntegrated } from "@/lib/serviceErrors";
import type { UserReport } from "@/types/reports/reportTypes";

export async function reportUser(_params: {
  reportedUserId: string;
  conversationId: string;
  reason: string;
}): Promise<UserReport> {
  return notIntegrated();
}
