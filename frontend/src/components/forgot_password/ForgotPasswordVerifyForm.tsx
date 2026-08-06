
"use client";

import { useRouter } from "next/navigation";
import OtpForm from "@/components/shared/OtpForm";
import { verifyPasswordResetCode } from "@/services/auth/authService";

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
      onVerify={async (code) => {
        // need to connect 

        await verifyPasswordResetCode(email, code);

        router.push("/reset_password");
      }}
      onResendCode={async () => {
        
        // need to connect 
        
        alert("A new reset code has been sent.");
      }}
    />
  );
}
