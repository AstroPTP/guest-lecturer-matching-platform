import { Suspense } from "react";
import VerifyEmailForm from "@/components/verify/VerifyEmailForm";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  );
}
