"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OtpForm from "@/components/shared/OtpForm";

export default function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const requestedRole = searchParams.get("role");
  const role = requestedRole === "coordinator" ? "coordinator" : "guest";
  // Set once the code has been accepted. If creating the account then fails,
  // a retry must not send the same code again: it has been used, and Auth0
  // would answer 400. The user is already signed in, so only the account step
  // needs repeating.
  const verifiedRef = useRef(false);

  return (
    <OtpForm
      title="Check your email"
      submitLabel="Verify email"
      description="Enter the verification code sent to your email"
      onVerify={async (code) => {
        if (!verifiedRef.current) {
          const response = await fetch("/api/auth/passwordless/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, verificationCode: code }),
          });
          if (!response.ok) {
            const failure = await response.json().catch(() => null);
            throw new Error(failure?.error || "Invalid verification code. Please try again.");
          }
          verifiedRef.current = true;
        }

        // Verifying the code has just signed the user in, so the account can
        // now be created for the verified address, from the details the server
        // kept when the code was sent.
        if (requestedRole === "guest" || requestedRole === "coordinator") {
          const completed = await fetch("/api/auth/register/complete", { method: "POST" });
          if (!completed.ok) {
            const failure = await completed.json().catch(() => null);
            throw new Error(
              "Your email is verified, but we couldn't finish setting up your account: " +
                (failure?.error || "please try again.") +
                " Enter the code and press Verify again to retry.",
            );
          }
        }

        router.push(`/success?role=${role}`);
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
