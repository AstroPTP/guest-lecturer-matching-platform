import { UserProfileManagement } from "@/components/UserProfileManagement";

/**
 * One person's record.
 *
 * The lookup used to run against a three-row array compiled into the page, so
 * any real user's profile was a 404. The component fetches the record itself
 * now, because it is also the thing that writes to it and both should address
 * the same record.
 */
export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <UserProfileManagement directoryId={decodeURIComponent(userId)} />;
}
