import UnitCoordinatorConsentForm from "@/components/unit_coordinator/ConsentPreferencesForm";
import WizardGuard from "@/components/shared/WizardGuard";

export default function ConsentPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50 px-6 py-12">
      <WizardGuard roleRoot="/unit_coordinator">
        <UnitCoordinatorConsentForm />
      </WizardGuard>
    </div>
  );
}
