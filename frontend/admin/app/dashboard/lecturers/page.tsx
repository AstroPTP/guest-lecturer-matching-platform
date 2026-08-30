import { EngagementDirectory } from "@/components/EngagementDirectory";
import { guestLecturerDirectory } from "@/data/engagement_leaders";

export default function LecturerDirectoryPage() {
  return (
    <EngagementDirectory
      description="Complete guest lecturer participation directory for the current semester."
      detailLabel="Expertise"
      primaryMetricLabel="Events Attended"
      rows={guestLecturerDirectory.map((lecturer) => ({
        id: lecturer.id,
        name: lecturer.name,
        detail: lecturer.expertise,
        href: "/dashboard/lecturers/" + encodeURIComponent(lecturer.id),
        primaryMetric: lecturer.eventsAttended.toString(),
        secondaryMetric: lecturer.participationRate + "%",
      }))}
      secondaryMetricLabel="Participation Rate"
      title="Guest Lecturer Directory"
    />
  );
}
