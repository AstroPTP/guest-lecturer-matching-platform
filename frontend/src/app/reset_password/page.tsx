import type { Metadata } from "next";
import ResetPasswordForm from "@/components/forgot_password/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 flex items-center justify-center px-6 py-8">
      <ResetPasswordForm />
    </div>
  );
}
