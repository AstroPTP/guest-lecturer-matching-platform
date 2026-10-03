import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export default function ReviewsPage() {
  return (
    <SectionPlaceholder
      title="Verification Queue"
      description="Approve guest lecturer profiles before they appear in discovery."
      reason="Approving guest lecturers needs one new database column, so it is waiting for the client to confirm an approval step is wanted."
    />
  );
}
