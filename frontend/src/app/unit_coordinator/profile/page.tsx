import BasicInformationForm from "@/components/unit_coordinator/BasicInformationForm";
import WizardGuard from "@/components/shared/WizardGuard";

export default function UnitCoordinatorProfilePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50 px-6 py-12">
      <WizardGuard roleRoot="/unit_coordinator">
        <BasicInformationForm />
      </WizardGuard>
    </div>
  );
}
