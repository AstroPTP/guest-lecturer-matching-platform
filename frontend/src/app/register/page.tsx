import { Suspense } from "react";

import RegisterForm from "@/components/register/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
