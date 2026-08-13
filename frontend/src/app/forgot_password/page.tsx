"use client";

import { useState } from "react";
import ForgotPasswordForm from "@/components/forgot_password/ForgotPasswordForm";
import ForgotPasswordVerifyForm from "@/components/forgot_password/ForgotPasswordVerifyForm";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 flex items-center justify-center px-6">
      {step === "email" ? (
        <ForgotPasswordForm
          onSubmitted={(submittedEmail) => {
            setEmail(submittedEmail);
            setStep("verify");
          }}
        />
      ) : (
        <ForgotPasswordVerifyForm email={email} />
      )}
    </div>
  );
}
