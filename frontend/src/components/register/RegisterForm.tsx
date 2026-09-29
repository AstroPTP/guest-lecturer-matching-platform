"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import person from "@/assets/person.png";
import email from "@/assets/email.png";
import visibility from "@/assets/visibility.png";
import visibility_off from "@/assets/visibility_off.png";
import check from "@/assets/check.png";
import { getPasswordRequirements } from "@/lib/validation";

export default function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "coordinator" ? "coordinator" : "guest";
  const { hasMinLength, hasUppercase, hasSpecialCharacter, hasNumber,  strength: passwordStrength, isValid: isPasswordValid } = getPasswordRequirements(password);
  const strengthState = password.length === 0 ? { label: "", color: "#E5E7EB" } : passwordStrength <= 1 ? { label: "Weak", color: "#EF4444" } : passwordStrength <= 3 ? { label: "Medium", color: "#F59E0B" } : { label: "Strong", color: "#10B981" };
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPasswordValid) {
      alert("Please make sure your password meets all requirements.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const registerEmail = String(formData.get("email") || "").trim().toLowerCase();
    const fullName = String(formData.get("fullName") || "").trim();
    setError(null);
    setIsSubmitting(true);
    try {
      // Sends the code and keeps the details server-side until /verify, where
      // the account is created. The password is not stored in this tab.
      const response = await fetch("/api/auth/register/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registerEmail, fullName, password, role }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not send the verification code. Try again.");
      }
      router.push(`/verify?email=${encodeURIComponent(registerEmail)}&role=${role}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the verification code. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <main className="w-full max-w-md">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold">Guest Lecturer Matching</h1>
        <p className="text-base text-gray-600">Join the industrial network of academic professionals.</p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-10 shadow-xl shadow-blue-900/10">
        <form className="space-y-6" onSubmit={handleRegister}>
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-black bg-gray-100 px-4 py-2 text-[12px] leading-none uppercase">
              <div className="font-medium tracking-[0.03em] text-gray-700">Registering as</div>
              <div className="font-semibold tracking-normal text-blue-600">{role === "coordinator" ? "Unit Coordinator" : "Guest Lecturer"}</div>
            </div>
          </div>
          <div>
            <label htmlFor="fullName" className="mb-2 block text-sm font-bold uppercase tracking-widest">
              Full Name
            </label>

            <div className="relative">
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Tuan Kiet Luu"
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />

              <Image
                src={person}
                alt="Full name"
                width={22}
                height={22}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 object-contain"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-bold uppercase tracking-widest">
              Email Address
            </label>

            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                placeholder="abc@university.edu"
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />

              <Image
                src={email}
                alt="Email address"
                width={22}
                height={22}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 object-contain"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-bold uppercase tracking-widest">
              Password
            </label>

            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder=""
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-4 top-1/2 -translate-y-1/2 border-0 bg-transparent p-0 focus:outline-none"
              >
                <Image src={showPassword ? visibility : visibility_off} alt="" width={22} height={22} className="object-contain" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{ backgroundColor: passwordStrength >= level ? strengthState.color : "#E5E7EB" }}
                  />
                ))}
              </div>

              <p className="min-h-5 text-right text-sm font-medium transition-colors" style={{ color: strengthState.color }}>
                {strengthState.label}
              </p>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-800">Password Requirements</p>

                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="flex h-4 w-4 items-center justify-center">
                      {hasMinLength && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                    </span>
                    Must be at least 8 characters
                  </li>

                  <li className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="flex h-4 w-4 items-center justify-center">
                      {hasUppercase && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                    </span>
                    Must contain one uppercase letter
                  </li>

                  <li className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="flex h-4 w-4 items-center justify-center">
                      {hasSpecialCharacter && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                    </span>
                    Must contain one special character
                  </li>

                  <li className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="flex h-4 w-4 items-center justify-center">
                      {hasNumber && <Image src={check} alt="" aria-hidden="true" width={16} height={16} className="object-contain" />}
                    </span>
                    Must contain one number
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3">
            <input id="terms" name="terms" type="checkbox" required className="mt-1 h-4 w-4" />

            <label htmlFor="terms" className="text-sm text-gray-600">
              I agree to the{" "}
              <a href="#" className="text-black underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="text-black underline">
                Privacy Policy
              </a>
              .
            </label>
          </div>


          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-600 py-4 font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting ? "Sending code…" : "Create account"}
          </button>
        </form>

        {/* Divider */}
        <div className="mt-8 border-t border-gray-300 pt-6 text-center">
          <span className="bg-gray-100 px-4 text-sm text-gray-600">Already a member?</span>
        </div>

        {/* Login Link */}
        <div className="mt-6 text-center">
          <Link href="/login" className="font-semibold underline">
            Sign in to your account
          </Link>
        </div>
      </div>
    </main>
  );
}
