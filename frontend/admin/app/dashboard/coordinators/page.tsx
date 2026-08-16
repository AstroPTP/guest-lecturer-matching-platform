import { EngagementDirectory } from "@/components/EngagementDirectory";
import { coordinatorDirectory } from "@/data/engagement-leaders";

export default function CoordinatorDirectoryPage() {
  return (
    <EngagementDirectory
      description="Complete unit coordinator directory ranked by guest lecturer participation."
      detailLabel="Unit"
      primaryMetricLabel="Guest Lecturers"
      rows={coordinatorDirectory.map((coordinator) => ({
        id: coordinator.id,
        name: coordinator.name,
        detail: coordinator.unit,
        href: `/dashboard/coordinators/${encodeURIComponent(coordinator.id)}`,
        primaryMetric: coordinator.guestLecturers.toString(),
        secondaryMetric: coordinator.eventsHosted.toString(),
      }))}
      secondaryMetricLabel="Events Hosted"
      title="Unit Coordinator Directory"
    />
  );
}
