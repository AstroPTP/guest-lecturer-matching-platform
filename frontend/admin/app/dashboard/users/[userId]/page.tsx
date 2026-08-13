import { notFound } from "next/navigation";
import { UserProfileManagement } from "@/components/UserProfileManagement";
import { initialUsers } from "@/data/users";

interface UserProfilePageProps {
  params: Promise<{ userId: string }>;
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { userId } = await params;
  const user = initialUsers.find((candidate) => candidate.id === decodeURIComponent(userId));

  if (!user) notFound();

  return <UserProfileManagement initialUser={user} />;
}
