"use client";

import { FormEvent, useState } from "react";
import type { ActionResult } from "@/types/settings/settingsTypes";
import { Field, FeedbackBanner, PasswordInput, RequirementRow, SectionHeader } from "@/components/settings/settingsShared";
import { getPasswordRequirements } from "@/lib/validation";

export default function PasswordSection({
  onChangePassword,
}: {
  onChangePassword: (params: { currentPassword: string; newPassword: string }) => Promise<ActionResult>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const {hasMinLength: meetsLength, hasUppercase,hasNumber, hasSpecialCharacter,  strength: passwordStrength,   strengthLabel, isValid: isPasswordValid } = getPasswordRequirements(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!currentPassword) {
      setFeedback({ type: "error", message: "Enter your current password." });
      return;
    }

    if (!isPasswordValid) {
      setFeedback({
        type: "error",
        message: "Please make sure your new password meets all requirements.",
      });
      return;
    }
    if (!passwordsMatch) {
      setFeedback({ type: "error", message: "New passwords don't match." });
      return;
    }

    if (newPassword === currentPassword) {
      setFeedback({
        type: "error",
        message: "New password must be different from your current one.",
      });
      return;
    }

    setIsSubmitting(true);

    const result = await onChangePassword({ currentPassword, newPassword });

    setIsSubmitting(false);

    if (!result.success) {
      setFeedback({
        type: "error",
        message: result.error ?? "Couldn't update your password. Try again.",
      });
      return;
    }

    setFeedback({ type: "success", message: "Password updated successfully." });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <section>
      <SectionHeader title="Password & Security" description="Choose a strong password you don't use elsewhere." />
      <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-5">
        <Field label="Current password">
          <PasswordInput value={currentPassword} onChange={setCurrentPassword} />
        </Field>

        <Field label="New password">
          <PasswordInput value={newPassword} onChange={setNewPassword} />
        </Field>

        <Field label="Confirm new password">
          <PasswordInput value={confirmPassword} onChange={setConfirmPassword} />
        </Field>

        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((level) => (
                <div key={level} className={"h-1 flex-1 rounded-full " + (passwordStrength >= level ? "bg-black" : "bg-gray-300")} />
              ))}
            </div>

            <p className="mt-2 min-h-5 text-right text-sm font-medium text-gray-700">{strengthLabel}</p>
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[#2d2d2d]">Password Requirements</p>

            <ul className="mt-3 space-y-2 text-sm">
              <RequirementRow met={meetsLength} label="Must be at least 8 characters" />
              <RequirementRow met={hasUppercase} label="Must contain one uppercase letter" />
              <RequirementRow met={hasSpecialCharacter} label="Must contain one special character" />
              <RequirementRow met={hasNumber} label="Must contain one number" />
            </ul>
          </div>

          {confirmPassword !== "" && (
            <p className={"text-sm " + (passwordsMatch ? "text-gray-600" : "text-red-600")}>
              {passwordsMatch ? "Passwords match." : "Passwords do not match."}
            </p>
          )}
        </div>

        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[#2d2d2d] px-6 py-3.5 font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </button>
        </div>
      </form>

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}
    </section>
  );
}
