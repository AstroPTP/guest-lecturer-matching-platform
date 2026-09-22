"use client";

import BasicInformationForm from "@/components/unit_coordinator/BasicInformationForm";
import CreateAccountDialog from "@/components/shared/CreateAccountDialog";
import { useAccountExists } from "@/lib/hooks/useAccountExists";

export default function UnitCoordinatorProfilePage() {
  const exists = useAccountExists();

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50 px-6 py-12">
      {exists === false && <CreateAccountDialog registerHref="/register?role=coordinator" />}
      <BasicInformationForm />
    </div>
  );
}
