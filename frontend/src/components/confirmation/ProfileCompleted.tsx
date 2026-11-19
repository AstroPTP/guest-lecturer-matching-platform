"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import arrowIcon from "@/assets/arrow.png";
import checkIcon from "@/assets/check.png";
import BrandLogo from "@/components/brand/BrandLogo";

interface ProfileCompletedProps {
  title: string;
  description: string;
  button1Text: string;
  button1Href: string;
}

export default function ProfileCompleted({ title, description, button1Text, button1Href }: ProfileCompletedProps) {
  const router = useRouter();
  const isCoordinator = button1Href.startsWith("/unit_coordinator");
  return (
    <main
      className={"flex min-h-screen items-center justify-center px-6 " + (isCoordinator ? "bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-50" : "bg-gradient-to-br from-emerald-50 via-cyan-50 to-amber-50") }
    >
      <div className="flex w-full max-w-3xl flex-col items-center text-center">
        <div className="mb-10">
          <BrandLogo variant="compact" size={36} />
        </div>
        <div
          className={"flex h-24 w-24 items-center justify-center rounded-2xl bg-white shadow-lg " + (isCoordinator ? "ring-1 ring-blue-200" : "ring-1 ring-teal-200")}
        >
          <Image src={checkIcon} alt="" width={46} height={46} />
        </div>
        <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-[#2d2d2d] md:text-6xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#4f5555] md:text-xl">{description}</p>
        <div className="mt-14">
          <button
            type="button"
            onClick={() => router.push(button1Href)}
            className={"flex items-center justify-center gap-3 rounded-xl px-12 py-4 text-lg font-medium text-white shadow-lg transition " + (isCoordinator ? "bg-blue-600 shadow-blue-600/20 hover:bg-blue-700" : "bg-teal-600 shadow-teal-600/20 hover:bg-teal-700") }
          >
            {button1Text}
            <Image src={arrowIcon} alt="" width={20} height={20} className="brightness-0 invert" />
          </button>
        </div>
      </div>
    </main>
  );
}
