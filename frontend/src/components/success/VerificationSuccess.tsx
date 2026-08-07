"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import check from "@/assets/check.png";
import arrow from "@/assets/arrow.png";

export default function VerificationSuccess() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    const countdown = setInterval(() => {
      setSeconds((current) => current - 1);
    }, 1000);

    const redirect = setTimeout(() => {
      router.replace("/login");
    }, 5000);

    return () => {
      clearInterval(countdown);
      clearTimeout(redirect);
    };
  }, [router]);

  return (
    <main className="w-full max-w-md px-8 flex flex-col items-center justify-center text-center">

      {/* Success icon */}
      <div className="mb-12 flex justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-gray-100">
          <Image
            src={check}
            alt="Success"
            width={52}
            height={52}
            className="object-contain"
          />
        </div>
      </div>

      {/* Heading */}
      <h1 className="text-5xl font-bold tracking-tight text-[#2d2d2d] mb-4">
        Done
      </h1>

      {/* Message */}
      <p className="text-lg text-gray-600 mb-12">
        Email verified successfully!
      </p>

      {/* Login button */}
      <div className="w-full space-y-6">
        <Link
          href="/login"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2d2d2d] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-black"
        >
          <span>Log in</span>

          <Image
            src={arrow}
            alt=""
            width={18}
            height={18}
            className="object-contain"
          />
        </Link>

        <p className="text-sm text-gray-500 tracking-wide">
          Auto-redirecting in {seconds}s...
        </p>
      </div>

    </main>
  );
}