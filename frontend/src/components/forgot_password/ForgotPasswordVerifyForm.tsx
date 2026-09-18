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
      onVerify={async (code) => {
        const response = await fetch("/api/auth/passwordless/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, verificationCode: code }),
        });
        if (!response.ok) {
          throw new Error("Invalid or expired code.");
        }
        router.push("/reset_password");
      }}
      onResendCode={async () => {
        await fetch("/api/auth/passwordless/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      }}
    />
  );
}
