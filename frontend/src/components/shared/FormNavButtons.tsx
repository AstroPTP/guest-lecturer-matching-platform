"use client";

import { useRouter } from "next/navigation";

interface FormNavButtonsProps {
  submitLabel: string;
  isFinalStep?: boolean;
}

export default function FormNavButtons({ submitLabel, isFinalStep = false }: FormNavButtonsProps) {
  const router = useRouter();
  return (
    <div className={"flex items-center justify-between pt-4 " + (isFinalStep ? "pb-10" : "pb-8")}>
      <button
        type="button"
        onClick={() => router.back()}
        className="min-w-[130px] rounded-xl border border-gray-300 bg-white px-8 py-4 font-semibold text-[#2d2d2d] shadow-sm transition-all duration-200 hover:bg-gray-100 hover:shadow-md active:scale-[0.98]"
      >
        Back
      </button>
      <button
        type="submit"
        className={
          "rounded-xl bg-black px-9 py-4 font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-lg active:translate-y-0 " +
          (isFinalStep ? "min-w-[170px]" : "min-w-[140px]")
        }
      >
        {submitLabel}
      </button>
    </div>
  );
}
