"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import check from "@/assets/check.png";
import arrow from "@/assets/arrow.png";

interface FeatureCardProps {
  title: string;
  description: string;
  items: string[];
  buttonText: string;
  role: "guest" | "coordinator";
}

export default function FeatureCard({ title, description, items, buttonText, role }: FeatureCardProps) {
  const router = useRouter();
  function handleJoin() {
    router.push(`/login?role=${role}`);
  }
  return (
    <div className="bg-white rounded-3xl p-10 shadow-sm">
      <h2 className="text-4xl font-bold mb-6">{title}</h2>
      <p className="text-gray-700 mb-8">{description}</p>
      <ul className="space-y-4 mb-10">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
              <Image src={check} alt="Check" width={18} height={18} />
            </div>
            <span className="text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={handleJoin} className="flex items-center gap-2 font-semibold transition-all hover:gap-3">
        <span>{buttonText}</span>
        <Image src={arrow} alt="Arrow" width={18} height={18} />
      </button>
    </div>
  );
}
