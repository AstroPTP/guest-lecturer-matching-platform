import ProfileCompleted from "@/components/confirmation/ProfileCompleted";

export default function Page() {
  return (
    <ProfileCompleted
      title="You're all set!"
      description="Your coordinator profile has been completed and you can now start viewing Guest Lecturers."
      button1Text="View My Profile"
      button1Href="/unit_coordinator/my_profile"
    />
  );
}
