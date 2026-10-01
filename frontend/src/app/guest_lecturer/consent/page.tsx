import ConsentPreferencesForm from "@/components/guest_lecturer/ConsentPreferencesForm";
import WizardGuard from "@/components/shared/WizardGuard";

export default function ConsentPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 px-6 py-12">
      <WizardGuard roleRoot="/guest_lecturer">
        <ConsentPreferencesForm />
      </WizardGuard>
    </div>
  );
}
