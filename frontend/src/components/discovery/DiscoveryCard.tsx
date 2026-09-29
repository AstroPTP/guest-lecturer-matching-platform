"use client";

import type { PublicGuestLecturerProfile } from "@/types/discovery/publicGuestLecturerProfileTypes";
import type { PublicUnitCoordinatorProfile } from "@/types/discovery/publicUnitCoordinatorProfileTypes";
import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";
import Image from "next/image";
import {
  experienceLevels,
  expertiseTopics,
  formatOptions,
  guestLecturerAudienceSizeOptions,
  guestLecturerAvailabilityFrequencyOptions,
  sessionDurationOptions,
  unitCoordinatorAudienceSizeOptions,
  weekDays,
} from "@/constants/profileOptions/shared";
import { professionalFields, professionalRoles } from "@/constants/profileOptions/guestLecturer";
import { academicRoleOptions, engagementFrequencyOptions, schoolDepartmentOptions } from "@/constants/profileOptions/unitCoordinator";
import { formatOptionLabel } from "@/utils/displayFormatters";
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
    role = formatOptionLabel(item.profile.basicInformation.professionalRole, professionalRoleOptions);
    organisation = formatOptionLabel(item.profile.basicInformation.professionalField, professionalFieldOptions);
  } else {
    role = formatOptionLabel(item.profile.basicInformation.academicRole, academicRoleOptions);
    organisation = formatOptionLabel(item.profile.basicInformation.schoolDepartment, schoolDepartmentOptions);
  }
  return (
    <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
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
      <div className="grid grid-cols-1 border-t border-gray-200 md:grid-cols-2">
        <DiscoverySection title="Engagement Requirements">
          <DiscoveryValue label="Primary location" value={engagementProfile.primaryLocation} />
          <DiscoveryValue label="Audience size" value={formatOptionLabel(engagementProfile.audienceSize, guestLecturerAudienceSizeOptions)} />
          <DiscoveryValue label="Session duration" value={formatOptionLabel(engagementProfile.sessionDuration, sessionDurationOptions)} />
          <DiscoveryTagGroup label="Formats" items={getGuestLecturerFormats(engagementProfile).map((format) => formatOptionLabel(format, formatOptions))} />
          <DiscoveryTagGroup label="Delivery focus" items={engagementProfile.deliveryFocus} />
        </DiscoverySection>

        <DiscoverySection title="Preferred Schedule" className="border-t border-gray-200 md:border-l md:border-t-0">
          <DiscoveryTagGroup label="Available days" items={schedule.availableDays.map((day) => formatOptionLabel(day, weekDays))} />
          <DiscoveryValue label="Available time" value={availableTime} />
          <DiscoveryValue label="Frequency" value={formatOptionLabel(schedule.availabilityFrequency, guestLecturerAvailabilityFrequencyOptions)} />
          <DiscoveryValue label="Schedule notes" value={schedule.availabilityNotes} />
        </DiscoverySection>
      </div>

      <DiscoverySection title="Guest Lecturer Experience" className="border-t border-gray-200">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DiscoveryTagGroup label="Topics" items={expertise.selectedTopics.map((topic) => formatOptionLabel(topic, topicOptions))} />
          <DiscoveryValue label="Experience level" value={formatOptionLabel(expertise.experienceLevel, experienceLevelOptions)} />
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
      <div className="grid grid-cols-1 border-t border-gray-200 md:grid-cols-2">
        <DiscoverySection title="Engagement Requirements">
          <DiscoveryValue label="Primary location" value={engagementProfile.primaryLocation} />
          <DiscoveryValue label="Audience size" value={formatOptionLabel(engagementProfile.audienceSize, unitCoordinatorAudienceSizeOptions)} />
          <DiscoveryValue label="Session duration" value={formatOptionLabel(engagementProfile.sessionDuration, sessionDurationOptions)} />
          <DiscoveryTagGroup label="Formats" items={engagementProfile.formats.map((format) => formatOptionLabel(format, formatOptions))} />
          <DiscoveryTagGroup label="Delivery focus" items={engagementProfile.deliveryFocus} />
        </DiscoverySection>

        <DiscoverySection title="Preferred Schedule" className="border-t border-gray-200 md:border-l md:border-t-0">
          <DiscoveryTagGroup label="Preferred days" items={schedule.preferredDays.map((day) => formatOptionLabel(day, weekDays))} />
          <DiscoveryValue label="Preferred time" value={preferredTime} />
          <DiscoveryValue label="Frequency" value={formatOptionLabel(schedule.engagementFrequency, engagementFrequencyOptions)} />
          <DiscoveryValue label="Schedule notes" value={schedule.scheduleNotes} />
        </DiscoverySection>
      </div>

      <DiscoverySection title="Guest Lecturer Requirements" className="border-t border-gray-200">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DiscoveryTagGroup label="Topics" items={expertise.selectedTopics.map((topic) => formatOptionLabel(topic, topicOptions))} />
          <DiscoveryTagGroup label="Experience required" items={expertise.experienceLevelsRequired.map((level) => formatOptionLabel(level, experienceLevelOptions))} />
          <DiscoveryValue label="Learning objective" value={expertise.learningObjective} />
          <DiscoveryValue label="Industry relevance" value={expertise.industryRelevance} />
        </div>
      </DiscoverySection>
    </>
  );
}

const topicOptions = expertiseTopics.map((topic) => ({ value: topic, label: topic }));
const experienceLevelOptions = experienceLevels.map((level) => ({ value: level.value, label: level.title }));
const professionalFieldOptions = professionalFields.map((field) => ({ value: field, label: field }));
const professionalRoleOptions = professionalRoles.map((role) => ({ value: role, label: role }));

// Older guest lecturer profiles only have the comma-joined format string, not the list.
function getGuestLecturerFormats(engagementProfile: PublicGuestLecturerProfile["engagementProfile"]): string[] {
  if (engagementProfile.formats) {
    return engagementProfile.formats;
  }
  return engagementProfile.format.split(",").map((format) => format.trim()).filter(Boolean);
}
