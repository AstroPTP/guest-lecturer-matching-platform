"use client";

import { ChangeEvent, KeyboardEvent, ReactNode, useRef, useState } from "react";

import Image from "next/image";
import email from "@/assets/email.png";
import info from "@/assets/info.png";

interface OtpFormProps {
  title?: string;
  description: ReactNode;
  submitLabel?: string;
  onVerify: (code: string) => void | Promise<void>;
  onResendCode: () => void | Promise<void>;
}

export default function OtpForm({ title, description, submitLabel, onVerify, onResendCode }: OtpFormProps) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(event: ChangeEvent<HTMLInputElement>, index: number) {
    const value = event.target.value.replace(/\D/g, "");
    setError("");

    if (!value) {
      const newCode = [...code];
      newCode[index] = "";
      setCode(newCode);
      return;
    }

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && code[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }
  function clearCode() {
    setCode(["", "", "", "", "", ""]);

    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 0);
  }

  async function handleSubmit() {
    const verificationCode = code.join("");

    // TODO(AUTH): Restore the 6-digit requirement once backend OTP verification is wired up.
    try {
      setError("");
      await onVerify(verificationCode);
    } catch {
      setError("Invalid verification code. Please try again.");
      clearCode();
    }
  }

  return (
    <main className="w-full max-w-md bg-white rounded-xl p-8 md:p-10 flex flex-col items-center text-center shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
      {/* Mail Icon */}
      <div className="w-16 h-16 bg-blue-50 ring-1 ring-blue-100 rounded-xl flex items-center justify-center mb-7">
        <Image src={email} alt="Email verification" width={32} height={32} className="object-contain" />
      </div>

      {/* Fixed title area */}
      <div className="h-12 flex items-center justify-center">
        <h1 className="text-4xl font-bold text-[#2d2d2d]">{title}</h1>
      </div>

      {/* Fixed description area */}
      <div className="h-20 flex items-start justify-center mt-3 mb-7">
        <p className="text-gray-600 leading-relaxed max-w-[300px]">{description}</p>
      </div>

      {/* OTP Form */}
      <form
        className="w-full"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="mb-8">
          <div className="flex justify-center gap-2 md:gap-3">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                aria-label={"Digit " + (index + 1)}
                onChange={(event) => handleChange(event, index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="w-11 h-14 sm:w-12 sm:h-16 md:w-14 bg-slate-100 border-0 border-b-2 border-slate-300 text-center text-2xl font-bold text-slate-800 outline-none transition-colors focus:bg-white focus:border-blue-600"
              />
            ))}
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors"
        >
          {submitLabel}
        </button>
      </form>

      {/* Resend */}
      <p className="text-sm text-gray-600 mt-8">
        Didn&apos;t receive the code?{" "}
        <button type="button" onClick={onResendCode} className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
          Resend code
        </button>
      </p>

      {/* Spam */}
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
        <Image src={info} alt="" width={18} height={18} className="object-contain" />

        <span>Check spam folder</span>
      </div>
    </main>
  );
}
