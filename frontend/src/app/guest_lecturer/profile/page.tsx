import type { Metadata } from "next";
import BasicInformationForm from "@/components/guest_lecturer/BasicInformationForm";
import WizardGuard from "@/components/shared/WizardGuard";

export const metadata: Metadata = { title: "Basic information" };

export default function SetupProfilePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 px-6 py-10">
      <WizardGuard roleRoot="/guest_lecturer">
        <BasicInformationForm />
      </WizardGuard>
    </div>
  );
}
