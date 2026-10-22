import { backendFetch } from "@/lib/api/backendClient";
import type { SuggestionsQuery, SuggestionsResult } from "@/types/suggestions/suggestionsTypes";

/**
 * Asks the API for the guest lecturers who suit one session, best first.
 *
 * Read only. Who is asking comes from the token the proxy attaches, so the
 * coordinator is never named in the request. Each topic is sent as its own
 * `topics` parameter and URLSearchParams escapes them, which matters for
 * names such as "Banking & Finance".
 */
export async function getSuggestions(query: SuggestionsQuery): Promise<SuggestionsResult> {
  const params = new URLSearchParams({
    date: query.date,
    startTime: query.startTime,
    endTime: query.endTime,
  });
  for (const topic of query.topics) {
    params.append("topics", topic);
  }
  return backendFetch<SuggestionsResult>(`/suggestions?${params.toString()}`);
}
