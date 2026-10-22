import { backendFetch } from "@/lib/api/backendClient";
import type { SuggestionsQuery, SuggestionsResult } from "@/types/suggestions/suggestionsTypes";

/**
 * Asks the API for the guest lecturers who suit one session, best first.
 *
 * Read only. Who is asking comes from the token the proxy attaches, so the
 * coordinator is never named in the request. Every part of the query is
 * optional and only what was given is sent: no date means any day, no times
 * means any time, and no topics means the coordinator's own expertise. Each
 * topic is sent as its own `topics` parameter and URLSearchParams escapes
 * them, which matters for names such as "Banking & Finance".
 */
export async function getSuggestions(query: SuggestionsQuery = {}): Promise<SuggestionsResult> {
  const params = new URLSearchParams();
  if (query.date) {
    params.set("date", query.date);
  }
  if (query.startTime) {
    params.set("startTime", query.startTime);
  }
  if (query.endTime) {
    params.set("endTime", query.endTime);
  }
  for (const topic of query.topics ?? []) {
    params.append("topics", topic);
  }
  const queryString = params.toString();
  return backendFetch<SuggestionsResult>(queryString ? `/suggestions?${queryString}` : "/suggestions");
}
