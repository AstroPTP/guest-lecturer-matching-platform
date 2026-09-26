"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import check from "@/assets/check.png";
import arrow from "@/assets/arrow.png";

export default function VerificationSuccess() {
  const searchParams = useSearchParams();
  const [seconds, setSeconds] = useState(5);

  // Registration sends ?role=; the forgot-password flow sends none.
  const rawRole = searchParams.get("role");
  const role = rawRole === "coordinator" ? "coordinator" : "guest";

  // The user is still signed in with the passwordless (email OTP) session,
  // which carries no role. End it, then sign in with the password account,
  // which holds the role. returnTo must be absolute and listed under Allowed
  // Logout URLs in Auth0, because the SDK passes it to Auth0 unchanged.
  const logoutAndLogin = useCallback(() => {
    const returnTo = `${window.location.origin}/login?role=${role}`;
    window.location.href = `/auth/logout?returnTo=${encodeURIComponent(returnTo)}`;
  }, [role]);

  useEffect(() => {
    const countdown = setInterval(() => {
      setSeconds((current) => current - 1);
    }, 1000);

    const redirect = setTimeout(() => {
      logoutAndLogin();
    }, 5000);

    return () => {
      clearInterval(countdown);
      clearTimeout(redirect);
    };
  }, [logoutAndLogin]);

  return (
    <main className="w-full max-w-md px-8 flex flex-col items-center justify-center text-center">
      <div className="mb-12 flex justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-gray-100">
          <Image src={check} alt="Success" width={52} height={52} className="object-contain" />
        </div>
      </div>
      <h1 className="text-5xl font-bold tracking-tight text-[#2d2d2d] mb-4">Done</h1>
      <p className="text-lg text-gray-600 mb-12">Email verified successfully!</p>
      <div className="w-full space-y-6">
        <button
          type="button"
          onClick={logoutAndLogin}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2d2d2d] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-black"
        >
          <span>Sign in to continue</span>
          <Image src={arrow} alt="" width={18} height={18} className="object-contain" />
        </button>
        <p className="text-sm text-gray-500 tracking-wide">Auto-redirecting in {seconds}s...</p>
      </div>
    </main>
  );
}