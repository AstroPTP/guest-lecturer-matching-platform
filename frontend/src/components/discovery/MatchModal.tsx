"use client";

import { getInitials } from "@/utils/displayFormatters";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import closeIcon from "@/assets/close.png";
import matchIcon from "@/assets/match.png";
import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";
import { formatOptions as unitCoordinatorFormatOptions } from "@/constants/profileOptions/shared";
interface MatchModalProps {
  currentUserName: string;
  currentUserPhoto?: string;
  matchedItem: DiscoveryItem;
  messagesHref: string;
  onClose: () => void;
  onKeepBrowsing: () => void;
}

export default function MatchModal({ currentUserName, currentUserPhoto, matchedItem, messagesHref, onClose, onKeepBrowsing }: MatchModalProps) {
  const router = useRouter();
  const { fullName: otherUserName, photoPreview: otherUserPhoto } = matchedItem.profile.basicInformation;
  const currentUserInitials = getInitials(currentUserName);
  const otherUserInitials = getInitials(otherUserName);
  const details = getMatchDetails(matchedItem);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function handleSendMessage() {
    onClose();
    router.push(messagesHref);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f3f3f4]/90 px-4 py-8 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <main className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
        <button
          type="button"
          aria-label="Close match window"
          onClick={onClose}
          className="absolute right-5 top-5 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-2xl leading-none text-gray-600 transition hover:bg-gray-200 hover:text-black"
        >
          <Image src={closeIcon} alt="" width={18} height={18} aria-hidden="true" />
        </button>

        <div className="flex flex-col items-center px-7 py-12 text-center sm:px-12 md:px-16">
          <div className="mb-9 flex items-center justify-center">
            <ProfileImage photo={currentUserPhoto} name={currentUserName} initials={currentUserInitials} variant="dark" />
            <div className="relative z-20 -mx-3 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
              <Image src={matchIcon} alt="" width={44} height={44} aria-hidden="true" className="h-11 w-11 object-contain" />
            </div>
            <ProfileImage photo={otherUserPhoto} name={otherUserName} initials={otherUserInitials} variant="light" />
          </div>
          <h1 id="match-modal-title" className="text-4xl font-extrabold tracking-tight text-[#2d2d2d] md:text-5xl">
            It&apos;s a Match!
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-[#4f5555] md:text-lg">
            You and <strong className="font-semibold text-[#2d2d2d]">{otherUserName}</strong> are both interested in connecting.
          </p>
          <section className="mt-9 w-full rounded-lg bg-[#f3f3f4] p-6 text-left">
            <div>
              <h2 className="text-lg font-bold text-[#2d2d2d]">{details.title}</h2>
              {details.subtitle && <p className="mt-1 text-sm text-gray-600">{details.subtitle}</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-[#4f5555]">
              {details.location && <span>{details.location}</span>}
              {details.duration && <span>{details.duration}</span>}
              {details.format && <span>{details.format}</span>}
            </div>
          </section>
          <div className="mt-10 flex w-full flex-col justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={handleSendMessage}
              className="flex min-w-[210px] items-center justify-center rounded-xl bg-[#2d2d2d] px-8 py-4 font-semibold text-white transition hover:bg-black"
            >
              Send a message
            </button>

            <button
              type="button"
              onClick={onKeepBrowsing}
              className="min-w-[190px] rounded-xl px-8 py-4 font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
            >
              Keep browsing
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ProfileImage({ photo, name, initials, variant }: { photo?: string; name: string; initials: string; variant: "dark" | "light" }) {
  const backgroundClass = variant === "dark" ? "bg-[#444343] text-white" : "bg-[#e2e2e2] text-[#2d2d2d]";

  return (
    <div
      className={
        "relative z-10 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-3xl font-bold shadow-lg ring-4 ring-white md:h-32 md:w-32 " +
        backgroundClass
      }
    >
      {photo ? <Image src={photo} alt={name} fill unoptimized className="object-cover" /> : <span>{initials}</span>}
    </div>
  );
}


function getMatchDetails(item: DiscoveryItem) {
  const topics = item.profile.expertise.selectedTopics;

  const topicTitle = topics.length > 0 ? topics.slice(0, 2).join(" · ") : "Academic collaboration";

  if (item.profileType === "unitCoordinator") {
    return {
      title: topicTitle,
      subtitle: item.profile.basicInformation.schoolDepartment,
      location: item.profile.engagementProfile.primaryLocation,
      duration: item.profile.engagementProfile.sessionDuration,
      format: formatUnitCoordinatorDeliveryFormat(item.profile.engagementProfile.formats[0]),
    };
  }

  return {
    title: topicTitle,
    subtitle: item.profile.basicInformation.professionalField,
    location: item.profile.engagementProfile.primaryLocation,
    duration: item.profile.engagementProfile.sessionDuration,
    format: item.profile.engagementProfile.format,
  };
}

function formatUnitCoordinatorDeliveryFormat(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return unitCoordinatorFormatOptions.find((option) => option.value === value)?.label ?? value;
}
