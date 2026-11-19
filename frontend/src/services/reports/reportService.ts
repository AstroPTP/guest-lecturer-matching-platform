import { BackendError, backendFetch } from "@/lib/api/backendClient";
import type { UserReport } from "@/types/reports/reportTypes";

/** The API rejects reasons shorter than this, so the form can say so first. */
const MIN_REASON_LENGTH = 5;

/** What a person is told for each way the API can turn a report down. */
function friendlyMessage(error: unknown): string {
  if (!(error instanceof BackendError)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (error.status === 403) {
    return "You can only report someone you are currently matched with.";
  }
  if (error.status === 404) {
    return "That person no longer has an account that can be reported.";
  }
  // The 409 wording is written for the person ("you already have 5 reports
  // waiting", "you have already reported this person"), so it is shown as sent.
  if (error.status === 409 && error.message) {
    return error.message;
  }
  if (error.status === 429) {
    return "You are sending reports too quickly. Please wait a minute and try again.";
  }
  if (error.status === 400) {
    return error.message === "You cannot report yourself."
      ? error.message
      : "Your report couldn't be accepted. Check what you wrote and try again.";
  }
  return "Your report couldn't be submitted. Please try again.";
}

/**
 * Reports the person on the other side of a match.
 *
 * `reportedUserId` is that person's profile id, the only id this app has. The
 * server works out who they are and checks the caller is matched with them, so
 * nobody can report someone they have no match with. `conversationId` is not
 * sent: the server finds the match itself.
 *
 * @throws Error with a message that is safe to show to the person.
 */
export async function reportUser(params: {
  reportedUserId: string;
  conversationId: string;
  reason: string;
}): Promise<UserReport> {
  const reason = params.reason.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new Error(`Please say a little more about what happened (at least ${MIN_REASON_LENGTH} characters).`);
  }

  try {
    return await backendFetch<UserReport>("/moderation/reports", {
      method: "POST",
      body: JSON.stringify({ targetId: params.reportedUserId, reason }),
    });
  } catch (error) {
    throw new Error(friendlyMessage(error));
  }
}
