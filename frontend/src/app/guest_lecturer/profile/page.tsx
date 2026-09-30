"use client";

import BasicInformationForm from "@/components/guest_lecturer/BasicInformationForm";
import { useLeaveWizardIfCompleted } from "@/lib/hooks/useOnboardingStatus";

export default function SetupProfilePage() {
  const status = useLeaveWizardIfCompleted("/guest_lecturer");

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 px-6 py-10">
      {status && !status.completed && <BasicInformationForm />}
    </div>
  );
}
