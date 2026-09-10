"use client";

import Link from "next/link";
import { useState } from "react";
import Image from "next/image";
import emailIcon from "@/assets/email.png";
import arrow from "@/assets/arrow.png";

interface ForgotPasswordFormProps {
  onSubmitted: (email: string) => void;
}

export default function ForgotPasswordForm({ onSubmitted }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError("");
    onSubmitted(normalizedEmail);
  }
  return (
    <main className="w-full max-w-md bg-white rounded-xl border border-blue-100 shadow-xl shadow-blue-900/10 p-8 sm:p-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-[#2d2d2d] mb-3">Reset Password</h1>

        <p className="text-gray-600 leading-relaxed">Enter your email address and we&apos;ll send you a link to reset your password.</p>
      </div>

      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider mb-2">
            Email Address
          </label>
          <div className="relative">
            <Image src={emailIcon} alt="Email" width={20} height={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 object-contain" />
            <input
              id="email"
              name="email"
              type="email"
              placeholder="abc@university.edu"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-3 pl-12 pr-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700"
        >
          <span>Send reset code</span>

          <Image src={arrow} alt="" width={18} height={18} className="object-contain" />
        </button>
      </form>

      <div className="mt-10 text-center">
        <p className="text-gray-600">
          Remember it?{" "}
          <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
