import EngagementProfileForm from "@/components/unit_coordinator/EngagementProfileForm";
import WizardGuard from "@/components/shared/WizardGuard";

export default function EngagementPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50 px-6 py-12">
      <WizardGuard roleRoot="/unit_coordinator">
        <EngagementProfileForm />
      </WizardGuard>
    </div>
  );
}
