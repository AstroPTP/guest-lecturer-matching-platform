"use client";

import { useRouter } from "next/navigation";

import OtpForm from "@/components/shared/OtpForm";

export default function VerifyEmailForm() {
  const router = useRouter();

  return (
    <OtpForm
      title="Check your email"
      submitLabel="Verify email"
      description="Enter the verification code sent to your email"
      onVerify={async () => {
        router.push("/success");
      }}
      onResendCode={async () => {
        alert("A new verification code has been sent.");
      }}
    />
  );
}
