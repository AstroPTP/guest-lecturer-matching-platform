import type { UserReport } from "@/types/reports/reportTypes";


export async function reportUser(_params: {
  reportedUserId: string;
  conversationId: string;
  reason: string;
}): Promise<UserReport> {
  throw new Error("This action isn't connected to a backend yet.");
}
