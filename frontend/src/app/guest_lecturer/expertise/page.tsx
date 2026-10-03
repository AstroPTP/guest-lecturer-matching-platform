import ExpertiseForm from "@/components/guest_lecturer/ExpertiseForm";
import WizardGuard from "@/components/shared/WizardGuard";

export default function ExpertisePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 px-6 py-12">
      <WizardGuard roleRoot="/guest_lecturer">
        <ExpertiseForm />
      </WizardGuard>
    </div>
  );
}
