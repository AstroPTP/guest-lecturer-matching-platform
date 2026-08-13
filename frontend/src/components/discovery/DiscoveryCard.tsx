"use client";

import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";

import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";

import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";

import Image from "next/image";

import { formatOptions as unitCoordinatorFormatOptions } from "@/constants/profileOptions/unitCoordinator";

import DiscoverySection from "./DiscoverySection";
import DiscoveryTagGroup from "./DiscoveryTagGroup";
import DiscoveryValue from "./DiscoveryValue";

export default function DiscoveryCard({
  item,
  onExpressInterest,
  onDismiss,
  isReviewingDismissed = false,
  onRestore,
}: {
  item: DiscoveryItem;

  onExpressInterest: (profileId: string) => void;

  onDismiss: (profileId: string) => void;

  isReviewingDismissed?: boolean;

  onRestore?: (profileId: string) => void;
}) {
  const { fullName, bio, photoPreview } = item.profile.basicInformation;

  let role = "";
  let organisation = "";

  if (item.profileType === "guestLecturer") {
    role = item.profile.basicInformation.professionalRole;

    organisation = item.profile.basicInformation.professionalField;
  } else {
    role = item.profile.basicInformation.academicRole;
    organisation = item.profile.basicInformation.schoolDepartment;
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      {/* Hàng trên */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Ảnh + tên + role + bio */}
        <section className="flex flex-col gap-5 p-6 sm:flex-row md:p-8">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-gray-200">
            {photoPreview ? (
              <Image src={photoPreview} alt={fullName} width={112} height={112} unoptimized className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-gray-500">{fullName.trim().charAt(0).toUpperCase()}</div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-600">{item.profileType === "guestLecturer" ? "Guest Lecturer" : "Unit Coordinator"}</p>

            <h2 className="mt-1 text-2xl font-bold text-gray-900 md:text-3xl">{fullName}</h2>

            {role && <p className="mt-2 font-semibold text-gray-700">{role}</p>}

            {organisation && <p className="mt-1 text-sm text-gray-500">{organisation}</p>}

            {bio && <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-600 md:text-base">{bio}</p>}
          </div>
        </section>

        {/* Express Interest + Dismiss hoặc Restore */}
        <section className="flex flex-col justify-center gap-3 border-t border-gray-200 p-6 md:p-8 lg:border-l lg:border-t-0">
          <button
            type="button"
            onClick={() => onExpressInterest(item.profile.id)}
            className="rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            Express Interest
          </button>

          {isReviewingDismissed ? (
            <button
              type="button"
              onClick={() => { onRestore?.(item.profile.id); }}
              className="rounded-xl border border-[#2d2d2d] px-4 py-3 font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {onDismiss(item.profile.id);}}
              className="rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600 transition hover:bg-red-50"
            >
              Dismiss
            </button>
          )}
        </section>
      </div>

      {/* Nội dung riêng của từng role */}
      {item.profileType === "guestLecturer" ? <GuestLecturerDetails profile={item.profile} /> : <UnitCoordinatorDetails profile={item.profile} />}
    </article>
  );
}

function GuestLecturerDetails({ profile }: { profile: PublicGuestLecturerProfile }) {
  const { expertise, engagementProfile } = profile;

  const { schedule } = engagementProfile;

  const availableTime = [schedule.availableFrom, schedule.availableTo].filter(Boolean).join(" - ");

  return (
    <>
      {/* Hàng dưới */}
      <div className="grid grid-cols-1 border-t border-gray-200 md:grid-cols-2">
        <DiscoverySection title="Engagement Requirements">
          <DiscoveryValue label="Primary location" value={engagementProfile.primaryLocation} />

          <DiscoveryValue label="Audience size" value={engagementProfile.audienceSize} />

          <DiscoveryValue label="Session duration" value={engagementProfile.sessionDuration} />

          <DiscoveryValue label="Format" value={engagementProfile.format} />

          <DiscoveryTagGroup label="Delivery focus" items={engagementProfile.deliveryFocus} />
        </DiscoverySection>

        <DiscoverySection title="Preferred Schedule" className="border-t border-gray-200 md:border-l md:border-t-0">
          <DiscoveryTagGroup label="Available days" items={schedule.availableDays} />

          <DiscoveryValue label="Available time" value={availableTime} />

          <DiscoveryValue label="Frequency" value={schedule.availabilityFrequency} />

          <DiscoveryValue label="Schedule notes" value={schedule.availabilityNotes} />
        </DiscoverySection>
      </div>

      {/* Hàng cuối */}
      <DiscoverySection title="Guest Lecturer Experience" className="border-t border-gray-200">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DiscoveryTagGroup label="Topics" items={expertise.selectedTopics} />

          <DiscoveryValue label="Experience level" value={expertise.experienceLevel} />

          <DiscoveryValue label="Speaking experience" value={expertise.hasSpeakingExperience ? expertise.speakingDetails || "Yes" : "No"} />

          <DiscoveryValue label="International experience" value={expertise.hasInternationalExperience ? expertise.internationalDetails || "Yes" : "No"} />

          <DiscoveryValue label="LinkedIn" value={expertise.linkedin} />
        </div>
      </DiscoverySection>
    </>
  );
}

function UnitCoordinatorDetails({ profile }: { profile: PublicUnitCoordinatorProfile }) {
  const { expertise, engagementProfile } = profile;

  const { schedule } = engagementProfile;

  const preferredTime = [schedule.preferredFrom, schedule.preferredTo].filter(Boolean).join(" - ");

  return (
    <>
      {/* Hàng dưới */}
      <div className="grid grid-cols-1 border-t border-gray-200 md:grid-cols-2">
        <DiscoverySection title="Engagement Requirements">
          <DiscoveryValue label="Primary location" value={engagementProfile.primaryLocation} />

          <DiscoveryValue label="Audience size" value={engagementProfile.audienceSize} />

          <DiscoveryValue label="Session duration" value={engagementProfile.sessionDuration} />

          <DiscoveryTagGroup label="Formats" items={engagementProfile.formats.map(formatDeliveryFormat)} />

          <DiscoveryTagGroup label="Delivery focus" items={engagementProfile.deliveryFocus} />
        </DiscoverySection>

        <DiscoverySection title="Preferred Schedule" className="border-t border-gray-200 md:border-l md:border-t-0">
          <DiscoveryTagGroup label="Preferred days" items={schedule.preferredDays} />

          <DiscoveryValue label="Preferred time" value={preferredTime} />

          <DiscoveryValue label="Frequency" value={schedule.engagementFrequency} />

          <DiscoveryValue label="Schedule notes" value={schedule.scheduleNotes} />
        </DiscoverySection>
      </div>

      {/* Hàng cuối */}
      <DiscoverySection title="Guest Lecturer Requirements" className="border-t border-gray-200">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DiscoveryTagGroup label="Topics" items={expertise.selectedTopics} />

          <DiscoveryTagGroup label="Experience required" items={expertise.experienceLevelsRequired} />

          <DiscoveryValue label="Learning objective" value={expertise.learningObjective} />

          <DiscoveryValue label="Industry relevance" value={expertise.industryRelevance} />
        </div>
      </DiscoverySection>
    </>
  );
}

function formatDeliveryFormat(value: string): string {
  return unitCoordinatorFormatOptions.find((option) => option.value === value)?.label ?? value;
}
