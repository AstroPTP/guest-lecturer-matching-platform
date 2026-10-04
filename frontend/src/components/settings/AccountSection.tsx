"use client";

import { FormEvent, useState } from "react";
import type { RequestEmailChangeResult } from "@/types/settings/settingsTypes";
import { Field, FeedbackBanner, PasswordInput, SectionHeader, isValidEmail } from "@/components/settings/settingsShared";

type Step = "view" | "editEmail";
export default function AccountSection({
  currentEmail,
  onRequestEmailChange,
}: {
  currentEmail: string;
  onRequestEmailChange: (params: { newEmail: string; currentPassword: string }) => Promise<RequestEmailChangeResult>;
}) {
  const [step, setStep] = useState<Step>("view");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string;} | null>(null);

  function resetToView() {
    setStep("view");
    setNewEmail("");
    setCurrentPassword("");
    setFeedback(null);
  }

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!newEmail.trim() || !isValidEmail(newEmail)) {
      setFeedback({ type: "error", message: "Enter a valid email address." });
      return;
    }

    if (!currentPassword) {
      setFeedback({
        type: "error",
        message: "Enter your current password to confirm this change.",
      });
      return;
    }
    setIsSubmitting(true);
    const result = await onRequestEmailChange({
      newEmail: newEmail.trim(),
      currentPassword,
    });
    setIsSubmitting(false);
    if (!result.success) {
      setFeedback({
        type: "error",
        message: result.error ?? "Couldn't update your email.",
      });
      return;
    }
    setFeedback({ type: "success", message: "Email updated. Check your new inbox for a verification link." });
    setStep("view");
    setCurrentPassword("");
  }

  return (
    <section>
      <SectionHeader title="Account" description="Manage the email address associated with your account." />
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-gray-500">Email address</p>
        {step === "view" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-[#2d2d2d]">{currentEmail}</p>

            <button
              type="button"
              onClick={() => {
                setNewEmail("");
                setFeedback(null);
                setStep("editEmail");
              }}
              className="rounded-full bg-gray-100 px-5 py-2 text-sm font-semibold text-[#2d2d2d] hover:bg-gray-200"
            >
              Change email
            </button>
          </div>
        )}

        {step === "editEmail" && (
          <form onSubmit={handleRequestCode} className="mt-4 space-y-4">
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Current email</p>
              <p className="mt-1 text-sm text-[#2d2d2d]">{currentEmail}</p>
            </div>

            <Field label="New email address">
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#156874]"
                placeholder="you@example.com"
                autoFocus
              />
            </Field>

            <Field label="Current password">
              <PasswordInput value={currentPassword} onChange={setCurrentPassword} placeholder="Confirm with your current password" />
            </Field>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full bg-[#2d2d2d] px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Updating..." : "Update email"}
              </button>

              <button type="button" onClick={resetToView} className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </form>
        )}

      </div>
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}
    </section>
  );
}
