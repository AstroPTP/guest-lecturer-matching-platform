import { RequestThreadView } from "@/components/RequestThreadView";

/** One request for further details, with its replies. */
export default async function RequestPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <RequestThreadView threadId={decodeURIComponent(threadId)} />;
}
