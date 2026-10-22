import { notFound } from "next/navigation";
import { RequestThreadView } from "@/components/RequestThreadView";
import { isThreadId } from "@/lib/requestFormat";

/**
 * One request for further details, with its replies.
 *
 * The id comes from the address bar, so it is checked before anything uses it:
 * anything but a number of up to 18 digits is the not-found page, with no call
 * to the API.
 */
export default async function RequestPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  let id: string;
  try {
    id = decodeURIComponent(threadId);
  } catch {
    // Not valid percent-encoding, so it cannot be an id.
    notFound();
  }
  if (!isThreadId(id)) {
    notFound();
  }
  return <RequestThreadView threadId={id} />;
}
