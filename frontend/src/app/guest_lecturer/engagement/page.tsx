import type { Metadata } from "next";
import EngagementProfileForm from "@/components/guest_lecturer/EngagementProfileForm";
import WizardGuard from "@/components/shared/WizardGuard";

export const metadata: Metadata = { title: "Engagement" };

export default function AvailabilityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 px-6 py-12">
      <WizardGuard roleRoot="/guest_lecturer">
        <EngagementProfileForm />
      </WizardGuard>
    </div>
  );
}
