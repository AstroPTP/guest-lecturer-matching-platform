import type { Metadata } from "next";
import ProfileCompleted from "@/components/confirmation/ProfileCompleted";

export const metadata: Metadata = { title: "Profile complete" };

export default function Page() {
  return (
    <ProfileCompleted
      title="You're all set!"
      description="Your academic profile is completed and ready for Unit Coordinators to review."
      button1Text="Browse Opportunities"
      button1Href="/guest_lecturer/my_profile"
    />
  );
}
