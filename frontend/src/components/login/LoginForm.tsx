"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import visibility from "@/assets/visibility.png";
import visibility_off from "@/assets/visibility_off.png";
import googleIcon from "@/assets/google-icon.svg";
import linkedInIcon from "@/assets/linkedin-icon.svg";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const role = searchParams.get("role");
  const registerHref = role ? '/register?role=${role}' : "/register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNeedsVerification(false);
    if (role === "coordinator") {
      router.push("/unit_coordinator/profile");
    } else {
      router.push("/guest_lecturer/profile");
    }
  }

  function handleGoogleLogin() {}
  function handleLinkedInLogin() {}
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 px-4 ">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/10 p-10">
        <h1 className="text-5xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-600 mb-10">Sign in to continue your academic journey.</p>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email address"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2">
              <Image src={showPassword ? visibility : visibility_off} alt="Toggle password" width={22} height={22} />
            </button>
          </div>
          <div>
            <Link href="/forgot_password" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Log in
          </button>
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
          {needsVerification && (
            <p className="text-center text-sm">
              <Link href="/verify" className="font-medium text-blue-600 underline hover:text-blue-700">
                Verify your email now
              </Link>
            </p>
          )}
        </form>

        <div className="my-8 flex items-center gap-3">
          <div className="h-px bg-gray-300 flex-1"></div>
          <span className="text-gray-500 text-sm">or continue with</span>
          <div className="h-px bg-gray-300 flex-1"></div>
        </div>
        <div className="space-y-4">
          <button
            type="button"
            aria-label="Continue with Google"
            onClick={handleGoogleLogin}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
          >
            <Image src={googleIcon} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
            Continue with Google
          </button>
          <button
            type="button"
            aria-label="Continue with LinkedIn"
            onClick={handleLinkedInLogin}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
          >
            <Image src={linkedInIcon} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
            Continue with LinkedIn
          </button>
        </div>

        <p className="text-center mt-10 text-sm">
          Don&apos;t have an account?{" "}
          <Link href={registerHref} className="font-medium text-blue-600 underline hover:text-blue-700">
            Register here
          </Link>
        </p>
      </div>
    </main>
  );
}
