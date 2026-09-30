"use client";

import BasicInformationForm from "@/components/unit_coordinator/BasicInformationForm";
import { useLeaveWizardIfCompleted } from "@/lib/hooks/useOnboardingStatus";

export default function UnitCoordinatorProfilePage() {
  const status = useLeaveWizardIfCompleted("/unit_coordinator");

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50 px-6 py-12">
      {status && !status.completed && <BasicInformationForm />}
    </div>
  );
}
