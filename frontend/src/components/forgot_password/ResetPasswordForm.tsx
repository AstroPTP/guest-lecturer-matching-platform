"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import visibility from "@/assets/visibility.png";
import visibility_off from "@/assets/visibility_off.png";
import check from "@/assets/check.png";
import arrow_back from "@/assets/arrow_back.png";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const hasMinLength = newPassword.length >= 8;
  const hasSpecialCharacter = /[^A-Za-z0-9]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const hasUppercase = /[A-Z]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== "";
  const isPasswordValid = hasMinLength && hasSpecialCharacter && hasNumber && hasUppercase;
  let passwordStrength = 0;

  if (hasMinLength) {
    passwordStrength++;
  }

  if (hasSpecialCharacter) {
    passwordStrength++;
  }

  if (hasNumber) {
    passwordStrength++;
  }

  if (hasUppercase) {
    passwordStrength++;
  }

  const strengthState =
    newPassword.length === 0
      ? { label: "", color: "#E5E7EB" }
      : passwordStrength <= 1
        ? { label: "Weak", color: "#EF4444" }
        : passwordStrength <= 3
          ? { label: "Medium", color: "#F59E0B" }
          : { label: "Strong", color: "#10B981" };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isPasswordValid) {
      alert("Please make sure your password meets all requirements.");
      return;
    }

    if (!passwordsMatch) {
      alert("Passwords do not match.");
      return;
    }

    setError("");
    router.push("/success");
  }
  return (
    <main className="w-full max-w-md bg-white rounded-xl p-8 md:p-12">
      <div className="mb-8">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => router.back()}
          className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-2xl mb-6 hover:bg-gray-200 transition-colors"
        >
          <Image src={arrow_back} alt="Back" width={24} height={24} />
        </button>
        <h1 className="text-4xl font-bold text-[#2d2d2d] mb-2">New password</h1>
        <p className="text-gray-600 leading-relaxed">Your new password must be different from previous used passwords.</p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="relative">
            <input
              id="newPassword"
              name="newPassword"
              type={showNewPassword ? "text" : "password"}
              placeholder="New password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-4 px-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <button
              type="button"
              aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              onClick={() => setShowNewPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 border-0 bg-transparent p-0 focus:outline-none"
            >
              <Image src={showNewPassword ? visibility_off : visibility} alt="" aria-hidden="true" width={22} height={22} className="object-contain" />
            </button>
          </div>

          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-4 px-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <button
              type="button"
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 border-0 bg-transparent p-0 focus:outline-none"
            >
              <Image src={showConfirmPassword ? visibility_off : visibility} alt="" aria-hidden="true" width={22} height={22} className="object-contain" />
            </button>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ backgroundColor: passwordStrength >= level ? strengthState.color : "#E5E7EB" }}
              />
            ))}
          </div>

          <p className="min-h-5 text-sm text-right font-medium transition-colors" style={{ color: strengthState.color }}>
            {strengthState.label}
          </p>

          <div className="space-y-3 pt-2">
            <p className="text-sm font-bold text-[#2d2d2d] uppercase tracking-wider">Password Requirements</p>

            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-gray-600">
                <span className="flex h-4 w-4 items-center justify-center">
                  {hasMinLength && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                </span>
                Must be at least 8 characters
              </li>

              <li className="flex items-center gap-2 text-sm text-gray-600">
                <span className="flex h-4 w-4 items-center justify-center">
                  {hasUppercase && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                </span>
                Must contain one uppercase letter
              </li>

              <li className="flex items-center gap-2 text-sm text-gray-600">
                <span className="flex h-4 w-4 items-center justify-center">
                  {hasSpecialCharacter && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                </span>
                Must contain one special character
              </li>

              <li className="flex items-center gap-2 text-sm text-gray-600">
                <span className="flex h-4 w-4 items-center justify-center">
                  {hasNumber && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                </span>
                Must contain one number
              </li>
            </ul>
          </div>

          {confirmPassword !== "" && (
            <p className={"text-sm font-medium " + (passwordsMatch ? "text-[#10B981]" : "text-[#EF4444]")}>
              {passwordsMatch ? "Passwords match." : "Passwords do not match."}
            </p>
          )}
        </div>

        <div className="pt-8">
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors"
          >
            Set new password
          </button>
          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        </div>
      </form>
    </main>
  );
}
