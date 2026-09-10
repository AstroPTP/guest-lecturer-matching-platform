"use client";

import Image from "next/image";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import { formatStoredValue } from "@/utils/displayFormatters";

interface MatchCardProps {
  item: MatchedProfile;
  onViewProfile: () => void;
  onChat: () => void;
}

export default function MatchCard({ item, onViewProfile, onChat }: MatchCardProps) {
  const { fullName, photoPreview } = item.profile.basicInformation;
  const topics = item.profile.expertise.selectedTopics;
  return (
    <article className="grid grid-cols-1 items-center gap-6 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_260px]">
      <div className="flex min-w-0 items-center gap-4">
        <ProfilePhoto fullName={fullName} photoPreview={photoPreview} />
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold text-[#2d2d2d]">{fullName}</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">{getProfileDescription(item)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {item.profileType === "guestLecturer" ? "Guest Lecturer" : "Unit Coordinator"}
          </p>
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 lg:hidden">Expertise Topics</p>
        <div className="flex flex-wrap gap-2">
          {topics.length > 0 ? (
            topics.map((topic) => (
              <span key={topic} className="bg-gray-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#2d2d2d]">
                {topic}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-400">No topics provided</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
        <button
          type="button"
          onClick={onViewProfile}
          className="rounded-xl border border-[#2d2d2d] px-5 py-3 text-sm font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
        >
          View Profile
        </button>

        <button type="button" onClick={onChat} className="rounded-xl bg-[#2d2d2d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-black">
          Chat
        </button>
      </div>
    </article>
  );
}

function ProfilePhoto({ fullName, photoPreview }: { fullName: string; photoPreview?: string }) {
  if (photoPreview) {
    return (
      <Image
        src={photoPreview}
        alt={fullName}
        width={64}
        height={64}
        unoptimized
        className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-gray-200"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xl font-bold text-gray-600">{getInitials(fullName)}</div>
  );
}

function getProfileDescription(item: MatchedProfile): string {
  if (item.profileType === "guestLecturer") {
    const { professionalRole, professionalField } = item.profile.basicInformation;
    return [professionalRole, professionalField].filter(Boolean).join(", ");
  }
  const { academicRole, schoolDepartment } = item.profile.basicInformation;
  return [formatStoredValue(academicRole), formatStoredValue(schoolDepartment)].filter(Boolean).join(", ");
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
