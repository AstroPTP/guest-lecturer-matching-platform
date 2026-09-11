"use client";

import { FormEvent, useState } from "react";
import type { ActionResult, RequestEmailChangeResult } from "@/types/settings/settingsTypes";
import { Field, FeedbackBanner, PasswordInput, SectionHeader, isValidEmail } from "@/components/settings/settingsShared";

type Step = "view" | "editEmail" | "verifyCode";
export default function AccountSection({
  currentEmail,
  onRequestEmailChange,
  onConfirmEmailChange,
  onCancelEmailChange,
}: {
  currentEmail: string;
  onRequestEmailChange: (params: { newEmail: string; currentPassword: string }) => Promise<RequestEmailChangeResult>;
  onConfirmEmailChange: (params: { code: string }) => Promise<ActionResult>;
  onCancelEmailChange: () => void;
}) {
  const [step, setStep] = useState<Step>("view");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string;} | null>(null);

  function resetToView() {
    onCancelEmailChange();
    setStep("view");
    setNewEmail("");
    setCurrentPassword("");
    setCode("");
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
        message: result.error ?? "Couldn't send a verification code.",
      });
      return;
    }
    setStep("verifyCode");
    setFeedback(null);
  }

  async function handleConfirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (code.trim().length !== 6) {
      setFeedback({ type: "error", message: "Enter the 6-digit code." });
      return;
    }

    setIsSubmitting(true);

    const result = await onConfirmEmailChange({ code: code.trim() });

    setIsSubmitting(false);
    if (!result.success) {
      setFeedback({ type: "error",  message: result.error ?? "Couldn't verify that code.",});
      return;
    }
    setFeedback({ type: "success", message: "Email updated successfully." });
    setStep("view");
    setCurrentPassword("");
    setCode("");
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
                {isSubmitting ? "Sending code..." : "Send verification code"}
              </button>

              <button type="button" onClick={resetToView} className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </form>
        )}

        {step === "verifyCode" && (
          <form onSubmit={handleConfirmCode} className="mt-4 space-y-4">
            <p className="text-sm text-gray-600">
              We sent a 6-digit code to <span className="font-semibold text-[#2d2d2d]">{newEmail}</span>. Enter it below to confirm the change.
            </p>

            <Field label="Verification code">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-[#156874]"
                placeholder="000000"
                autoFocus
              />
            </Field>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full bg-[#2d2d2d] px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Verifying..." : "Confirm change"}
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
