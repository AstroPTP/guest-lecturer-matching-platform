import type { UserReport } from "@/types/reports/reportTypes";

//need to connect
export async function reportUser(_params: {
  reporterId: string;
  reportedUserId: string;
  conversationId: string;
  reason: string;
}): Promise<UserReport> {
  throw new Error("This action isn't connected to a backend yet.");
}
