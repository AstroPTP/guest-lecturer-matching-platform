
"use client";

import { useRouter } from "next/navigation";
import OtpForm from "@/components/shared/OtpForm";

interface ForgotPasswordVerifyFormProps {
  email: string;
}

export default function ForgotPasswordVerifyForm({ email }: ForgotPasswordVerifyFormProps) {
  const router = useRouter();

  return (
    <OtpForm
      title="Reset your password"
      submitLabel="Confirm code"
      description={
        <>
          We&apos;ve sent a 6-digit reset code to <span className="font-bold text-[#2d2d2d]">{email}</span>
        </>
      }
      onVerify={async () => {
        // TODO(AUTH): Replace with real verifyPasswordResetCode(email, code) once backend is ready.
        router.push("/reset_password");
      }}
      onResendCode={async () => {
        // TODO(AUTH): Wire up a real resend-code request once backend is ready.
        alert("A new reset code has been sent.");
      }}
    />
  );
}
