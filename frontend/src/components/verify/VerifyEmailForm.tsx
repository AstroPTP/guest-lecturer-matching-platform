"use client";

import { useRouter, useSearchParams } from "next/navigation";
import OtpForm from "@/components/shared/OtpForm";

export default function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  return (
    <OtpForm
      title="Check your email"
      submitLabel="Verify email"
      description="Enter the verification code sent to your email"
      onVerify={async (code) => {
        const response = await fetch("/api/auth/passwordless/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, verificationCode: code }),
        });
        if (!response.ok) {
          throw new Error("Invalid or expired code.");
        }
        router.push("/success");
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
