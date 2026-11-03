import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MATCHING_SUGGESTIONS_ENABLED } from "@/config/features";

export const metadata: Metadata = { title: "Suggested speakers" };

/**
 * With the feature switched off the page does not exist, which matches the API
 * answering 404 for the same route.
 */
export default function SuggestionsLayout({ children }: { children: React.ReactNode }) {
  if (!MATCHING_SUGGESTIONS_ENABLED) {
    notFound();
  }
  return children;
}
