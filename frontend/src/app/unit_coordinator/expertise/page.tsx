import type { Metadata } from "next";
import ExpertiseForm from "@/components/unit_coordinator/ExpertiseForm";
import WizardGuard from "@/components/shared/WizardGuard";

export const metadata: Metadata = { title: "Expertise" };

export default function ExpertisePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50 px-6 py-12">
      <WizardGuard roleRoot="/unit_coordinator">
        <ExpertiseForm />
      </WizardGuard>
    </div>
  );
}
