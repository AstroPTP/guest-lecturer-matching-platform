"use client";

import { useRouter } from "next/navigation";

import OtpForm from "@/components/shared/OtpForm";

import { verifyRegisteredAccount } from "@/services/auth/authService";

export default function VerifyEmailForm() {
  const router = useRouter();

  return (
    <OtpForm
      title="Check your email"
      submitLabel="Verify email"
      description="Enter the verification code sent to your email"
      onVerify={async (code) => {


        //need to connect 

        // need to get the code back
        // await verifyRegisteredAccount(code);
        router.push("/success");
      }}
      onResendCode={async () => {

        //need to connect 

        alert("A new verification code has been sent.");
      }}
    />
  );
}
