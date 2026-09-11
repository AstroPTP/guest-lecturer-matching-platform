"use client";

import Image, { type StaticImageData } from "next/image";
import deleteIcon from "@/assets/delete.png";
import emailIcon from "@/assets/email.png";
import passkeyIcon from "@/assets/passkey.png";

export type SettingsTab = "account" | "password" | "delete";
const NAV_ITEMS: {id: SettingsTab;label: string; description: string; icon: StaticImageData}[] = [
  {
    id: "account",
    label: "Account",
    description: "Email and basic info",
    icon: emailIcon,
  },
  {
    id: "password",
    label: "Password & Security",
    description: "Change your password",
    icon: passkeyIcon,
  },
  {
    id: "delete",
    label: "Delete Account",
    description: "Permanently remove your account",
    icon: deleteIcon,
  },
];

export default function SettingsNav({ activeTab, onSelect }: { activeTab: SettingsTab; onSelect: (tab: SettingsTab) => void }) {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="border-b border-gray-100 p-6">
        <h2 className="text-xl font-bold text-[#2d2d2d]">Settings</h2>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const selected = item.id === activeTab;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={"flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors " + (selected ? "bg-gray-100" : "hover:bg-gray-50")}
            >
              <span
                className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (item.id === "delete" ? "bg-red-50" : "bg-gray-200")}
                aria-hidden="true"
              >
                <Image src={item.icon} alt="" width={20} height={20} />
              </span>

              <span className="min-w-0">
                <span className={"block text-sm font-semibold " + (item.id === "delete" ? "text-red-600" : "text-[#2d2d2d]")}>{item.label}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">{item.description}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
