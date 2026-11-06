"use client";

import { withFixedTopicSpelling } from "@/utils/customTopics";
import { getInitials } from "@/utils/displayFormatters";

import Image from "next/image";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import { experienceLevels,formatOptions as unitCoordinatorFormatOptions, guestLecturerAudienceSizeOptions,guestLecturerAvailabilityFrequencyOptions,sessionDurationOptions, unitCoordinatorAudienceSizeOptions, weekDays, type SelectOption} from "@/constants/profileOptions/shared";
import { academicRoleOptions, engagementFrequencyOptions,schoolDepartmentOptions} from "@/constants/profileOptions/unitCoordinator";

interface MatchedProfileViewProps {
  item: MatchedProfile;
  onBack: () => void;
  onChat: () => void;
}
export default function MatchedProfileView({ item, onBack, onChat }: MatchedProfileViewProps) {
  if (item.profileType === "guestLecturer") {
    return <GuestLecturerProfileView item={item} onBack={onBack} onChat={onChat} />;
  }

  return <UnitCoordinatorProfileView item={item} onBack={onBack} onChat={onChat} />;
}
function GuestLecturerProfileView({ item, onBack, onChat}: {
  item: Extract<
    MatchedProfile,
    {
      profileType: "guestLecturer";
    }
  >;
  onBack: () => void;
  onChat: () => void;
}) {
  const { basicInformation, expertise, engagementProfile } = item.profile;
  const { schedule } = engagementProfile;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <ProfileHeading
        roleLabel="Guest Lecturer"
        fullName={basicInformation.fullName}
        role={basicInformation.professionalRole}
        organisation={basicInformation.professionalField}
        bio={basicInformation.bio}
        photoPreview={basicInformation.photoPreview}
        onBack={onBack}
        onChat={onChat}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ProfileSection title="Basic Information">
            <ProfileGrid>
              <ProfileField label="Full Name" value={basicInformation.fullName} />
              <ProfileField label="Professional Field" value={basicInformation.professionalField} />
              <ProfileField label="Professional Role" value={basicInformation.professionalRole} />
              <div className="md:col-span-2">
                <ProfileField label="Short Bio" value={basicInformation.bio} />
              </div>
            </ProfileGrid>
          </ProfileSection>

          <ProfileSection title="Expertise">
            <div className="space-y-7">
              <TagList label="Expertise Topics" items={withFixedTopicSpelling(expertise.selectedTopics)} />
              <ProfileGrid>
                <ProfileField label="Experience Level" value={experienceLevelLabel(expertise.experienceLevel)} />
                <ProfileField label="Speaking Experience" value={expertise.hasSpeakingExperience ? "Yes" : "No"} />
                {expertise.hasSpeakingExperience && <ProfileField label="Speaking Details" value={expertise.speakingDetails} />}
                <ProfileField label="International Experience" value={expertise.hasInternationalExperience ? "Yes" : "No"} />
                {expertise.hasInternationalExperience && <ProfileField label="International Details" value={expertise.internationalDetails} />}
                <ProfileField label="LinkedIn" value={expertise.linkedin} />
              </ProfileGrid>
            </div>
          </ProfileSection>

          <ProfileSection title="Engagement Profile">
            <div className="space-y-7">
              <ProfileGrid>
                <ProfileField label="Primary Location" value={engagementProfile.primaryLocation} />
                <ProfileField label="Session Duration" value={optionLabel(sessionDurationOptions, engagementProfile.sessionDuration)} />
                <ProfileField label="Audience Size" value={optionLabel(guestLecturerAudienceSizeOptions, engagementProfile.audienceSize)} />
                <ProfileField label="Delivery Format" value={engagementProfile.format} />
              </ProfileGrid>
              <TagList label="Delivery Focus" items={engagementProfile.deliveryFocus} />
            </div>
          </ProfileSection>
        </div>

        <div>
          <ProfileSection title="Availability">
            <div className="space-y-6">
              <TagList label="Available Days" items={schedule.availableDays.map((day) => optionLabel(weekDays, day))} />
              <ProfileField label="Available Time" value={formatTimeRange(schedule.availableFrom, schedule.availableTo)} />
              <ProfileField label="Frequency" value={optionLabel(guestLecturerAvailabilityFrequencyOptions, schedule.availabilityFrequency)} />
              <ProfileField label="Availability Notes" value={schedule.availabilityNotes} />
            </div>
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}

function UnitCoordinatorProfileView({ item, onBack, onChat}: {
  item: Extract<
    MatchedProfile,
    {
      profileType: "unitCoordinator";
    }
  >;
  onBack: () => void;
  onChat: () => void;
}) {
  const { basicInformation, expertise, engagementProfile } = item.profile;
  const { schedule } = engagementProfile;
  const academicRoleLabel = optionLabel(academicRoleOptions, basicInformation.academicRole);
  const schoolDepartmentLabel = optionLabel(schoolDepartmentOptions, basicInformation.schoolDepartment);
  return (
    <div className="mx-auto w-full max-w-6xl">
      <ProfileHeading
        roleLabel="Unit Coordinator"
        fullName={basicInformation.fullName}
        role={academicRoleLabel}
        organisation={schoolDepartmentLabel}
        bio={basicInformation.bio}
        photoPreview={basicInformation.photoPreview}
        onBack={onBack}
        onChat={onChat}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ProfileSection title="Basic Information">
            <ProfileGrid>
              <ProfileField label="Full Name" value={basicInformation.fullName} />
              <ProfileField label="School / Department" value={schoolDepartmentLabel} />
              <ProfileField label="Academic Role" value={academicRoleLabel} />
              <div className="md:col-span-2">
                <ProfileField label="Short Bio" value={basicInformation.bio} />
              </div>
            </ProfileGrid>
          </ProfileSection>

          <ProfileSection title="Guest Lecturer Requirements">
            <div className="space-y-7">
              <TagList label="Expertise Topics" items={withFixedTopicSpelling(expertise.selectedTopics)} />
              <TagList label="Required Experience Levels" items={expertise.experienceLevelsRequired.map(experienceLevelLabel)} />
              <ProfileField label="Industry Relevance" value={expertise.industryRelevance} />
              <ProfileField label="Learning Objective" value={expertise.learningObjective} />
            </div>
          </ProfileSection>

          <ProfileSection title="Engagement Requirements">
            <div className="space-y-7">
              <ProfileGrid>
                <ProfileField label="Primary Location" value={engagementProfile.primaryLocation} />
                <ProfileField label="Session Duration" value={optionLabel(sessionDurationOptions, engagementProfile.sessionDuration)} />
                <ProfileField label="Audience Size" value={optionLabel(unitCoordinatorAudienceSizeOptions, engagementProfile.audienceSize)} />
              </ProfileGrid>
              <TagList label="Preferred Formats" items={engagementProfile.formats.map((format) => optionLabel(unitCoordinatorFormatOptions, format))} />
              <TagList label="Delivery Focus" items={engagementProfile.deliveryFocus} />
            </div>
          </ProfileSection>
        </div>

        <div>
          <ProfileSection title="Preferred Schedule">
            <div className="space-y-6">
              <TagList label="Preferred Days" items={schedule.preferredDays.map((day) => optionLabel(weekDays, day))} />
              <ProfileField label="Preferred Time" value={formatTimeRange(schedule.preferredFrom, schedule.preferredTo)} />
              <ProfileField label="Engagement Frequency" value={optionLabel(engagementFrequencyOptions, schedule.engagementFrequency)} />
              <ProfileField label="Schedule Notes" value={schedule.scheduleNotes} />
            </div>
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}

function ProfileHeading({roleLabel, fullName,role,organisation,bio,photoPreview, onBack, onChat,}: {
  roleLabel: string;
  fullName: string;
  role: string;
  organisation: string;
  bio: string;
  photoPreview?: string;
  onBack: () => void;
  onChat: () => void;
}) {
  return (
    <>
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">{roleLabel}</p>
          <h1 className="mt-2 text-4xl font-extrabold text-[#2d2d2d]">Profile</h1>
          <p className="mt-2 text-gray-600">View matched profile information.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-[#2d2d2d] transition hover:bg-gray-100"
          >
            Back to Matches
          </button>

          <button type="button" onClick={onChat} className="rounded-xl bg-[#2d2d2d] px-7 py-3 font-semibold text-white transition hover:bg-black">
            Chat
          </button>
        </div>
      </div>

      <section className="mb-6 rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ProfilePhoto fullName={fullName} photoPreview={photoPreview} />

          <div>
            <h2 className="text-3xl font-bold text-[#2d2d2d]">{fullName}</h2>
            {role && <p className="mt-2 text-lg text-gray-700">{role}</p>}
            {organisation && <p className="mt-1 text-gray-500">{organisation}</p>}
            {bio && <p className="mt-5 max-w-3xl whitespace-pre-wrap leading-7 text-gray-600">{bio}</p>}
          </div>
        </div>
      </section>
    </>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-7 shadow-sm">
      <h2 className="mb-6 text-xl font-bold text-[#2d2d2d]">{title}</h2>
      {children}
    </section>
  );
}

function ProfileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{children}</div>;
}

function ProfileField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-gray-800">{value || "Not provided"}</p>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <span key={item} className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-[#2d2d2d]">
              {item}
            </span>
          ))
        ) : (
          <span className="text-gray-500">Not provided</span>
        )}
      </div>
    </div>
  );
}

function ProfilePhoto({ fullName, photoPreview }: { fullName: string; photoPreview?: string }) {
  if (photoPreview) {
    return <Image src={photoPreview} alt={fullName} width={112} height={112} unoptimized className="h-28 w-28 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-gray-200 text-4xl font-bold text-gray-500">{getInitials(fullName)}</div>
  );
}

function formatTimeRange(start: string, end: string): string {
  if (!start && !end) {
    return "";
  }

  return [start, end].filter(Boolean).join(" – ");
}

function optionLabel(options: SelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function experienceLevelLabel(value: string): string {
  return experienceLevels.find((level) => level.value === value)?.title ?? value;
}
