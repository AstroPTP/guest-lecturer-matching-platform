import type { Metadata } from "next";
import { Suspense } from "react";
import VerificationSuccess from "@/components/success/VerificationSuccess";

export const metadata: Metadata = { title: "Email verified" };

export default function VerificationSuccessPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <VerificationSuccess />
      </Suspense>
    </div>
  );
}
