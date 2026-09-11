"use client";

import type { ReactNode } from "react";
import { formatStoredValue } from "@/utils/displayFormatters";

type SelectOption = string | { value: string; label: string };
export function ProfileField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <ProfileLabel>{label}</ProfileLabel>
      <p className="whitespace-pre-wrap leading-7 text-[#333333]">{value || "Not provided"}</p>
    </div>
  );
}

export function ProfileLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{children}</p>;
}

export function ProfileInput({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider">{label}</label>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-0 border-b-2 border-black bg-gray-100 px-4 py-4 outline-none focus:bg-white"
      />
    </div>
  );
}

export function ProfileSelect({ label, value, options, onChange }: { label: string; value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-0 border-b-2 border-black bg-gray-100 px-4 py-4 outline-none"
      >
        <option value="">Select an option</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function TagList({ label, items, formatItems = true }: { label: string; items: string[]; formatItems?: boolean }) {
  return (
    <div>
      <ProfileLabel>{label}</ProfileLabel>
      {items.length === 0 ? (
        <p className="text-gray-400">Not provided</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
              {formatItems ? formatStoredValue(item) : item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
