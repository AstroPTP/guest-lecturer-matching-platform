"use client";

import BasicInformationForm from "@/components/guest_lecturer/BasicInformationForm";
import CreateAccountDialog from "@/components/shared/CreateAccountDialog";
import { useAccountExists } from "@/lib/hooks/useAccountExists";

export default function SetupProfilePage() {
  const exists = useAccountExists();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50 px-6 py-10">
      {exists === false && <CreateAccountDialog registerHref="/register?role=guest" />}
      <BasicInformationForm />
    </div>
  );
}
