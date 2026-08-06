"use client";

import Image from "next/image";
import { useState } from "react";

import checkIcon from "@/assets/check.png";
import visibilityIcon from "@/assets/visibility.png";
import visibilityOffIcon from "@/assets/visibility_off.png";

export { isValidEmail } from "@/lib/validation";

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-[#2d2d2d]">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

export function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm outline-none focus:border-[#156874]"
      />

      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-4 top-1/2 -translate-y-1/2"
      >
        <Image src={visible ? visibilityOffIcon : visibilityIcon} alt="" width={20} height={20} />
      </button>
    </div>
  );
}

export function RequirementRow({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={"flex items-center gap-2 " + (met ? "text-[#156874]" : "text-gray-400")}>
      <span className="flex h-4 w-4 items-center justify-center">{met && <Image src={checkIcon} alt="" width={16} height={16} />}</span>
      {label}
    </li>
  );
}

export function FeedbackBanner({ type, message }: { type: "success" | "error"; message: string }) {
  return <p className={"mt-4 rounded-lg px-4 py-3 text-sm " + (type === "success" ? "bg-teal-50 text-[#156874]" : "bg-red-50 text-red-700")}>{message}</p>;
}
