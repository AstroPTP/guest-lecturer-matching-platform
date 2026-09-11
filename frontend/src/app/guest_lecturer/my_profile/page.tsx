"use client";

import { ProfileField, ProfileLabel, ProfileInput, ProfileSelect, TagList } from "@/components/profile/profileFields";
import { cloneData } from "@/utils/cloneData";
import { formatTimeRange } from "@/utils/displayFormatters";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EditableProfileSection from "@/components/profile/EditableProfileSection";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import type {GuestLecturerBasicInformationData, GuestLecturerEngagementData, GuestLecturerExpertiseData, GuestLecturerProfileData} from "@/types/profile/guestLecturerProfileTypes";
import { getGuestLecturerProfile, saveGuestLecturerBasicInformation,saveGuestLecturerEngagement, saveGuestLecturerExpertise} from "@/services/profile/guestLecturerProfileService";
import { professionalFields, professionalRoles } from "@/constants/profileOptions/guestLecturer";
import { formatStoredValue } from "@/utils/displayFormatters";
import { deliveryFocusOptions, experienceLevels, expertiseTopics, formatOptions, guestLecturerAudienceSizeOptions,guestLecturerAvailabilityFrequencyOptions,sessionDurationOptions,weekDays } from "@/constants/profileOptions/shared";

type EditingSection = "basic" | "expertise" | "engagement" | "availability" | null;
export default function GuestLecturerMyProfilePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<GuestLecturerProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [basicDraft, setBasicDraft] = useState<GuestLecturerBasicInformationData | null>(null);
  const [expertiseDraft, setExpertiseDraft] = useState<GuestLecturerExpertiseData | null>(null);
  const [engagementDraft, setEngagementDraft] = useState<GuestLecturerEngagementData | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const savedProfile = await getGuestLecturerProfile();
        if (cancelled) {
          return;
        }
        setProfile(savedProfile);
        if (savedProfile) {
          setBasicDraft(cloneData(savedProfile.basicInformation));
          setExpertiseDraft(cloneData(savedProfile.expertise));
          setEngagementDraft(cloneData(savedProfile.engagementProfile));
        }
      } catch {
        if (!cancelled) {
          setLoadError("Your profile isn't connected to a backend yet, so it can't be loaded here.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  function startEditing(section: EditingSection) {
    if (!profile){
      return;
    }     
    setBasicDraft(cloneData(profile.basicInformation));
    setExpertiseDraft(cloneData(profile.expertise));
    setEngagementDraft(cloneData(profile.engagementProfile));
    setEditingSection(section);
    setSavedMessage("");
  }
  function cancelEditing() {
    if (!profile){
      return;
    }
    setBasicDraft(cloneData(profile.basicInformation));
    setExpertiseDraft(cloneData(profile.expertise));
    setEngagementDraft(cloneData(profile.engagementProfile));
    setEditingSection(null);
  }

  function showSavedMessage(message: string) {
    setSavedMessage(message);
    setTimeout(() => {
      setSavedMessage("");
    }, 2500);
  }

  async function saveBasicInformation() {
    if (!profile || !basicDraft){
      return;
    }
    if (!basicDraft.fullName.trim()) {
      alert("Please enter your full name.");
      return;
    }
    if (!basicDraft.professionalField) {
      alert("Please select your professional field.");
      return;
    }
    if (!basicDraft.professionalRole) {
      alert("Please select your professional role.");
      return;
    }
    try {
      await saveGuestLecturerBasicInformation(basicDraft);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }
    setProfile({
      ...profile,
      basicInformation: cloneData(basicDraft),
    });

    setEditingSection(null);
    showSavedMessage("Basic information saved successfully.");
  }

  async function saveExpertise() {
    if (!profile || !expertiseDraft){
      return;
    }
    if (expertiseDraft.selectedTopics.length === 0) {
      alert("Please select at least one expertise topic.");
      return;
    }

    if (!expertiseDraft.experienceLevel) {
      alert("Please select your experience level.");
      return;
    }

    const updatedExpertise = {
      ...expertiseDraft,
      speakingDetails: expertiseDraft.hasSpeakingExperience ? expertiseDraft.speakingDetails : "",
      internationalDetails: expertiseDraft.hasInternationalExperience ? expertiseDraft.internationalDetails : "",
    };
    try {
      await saveGuestLecturerExpertise(updatedExpertise);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }
    setProfile({
      ...profile,
      expertise: cloneData(updatedExpertise),
    });
    setExpertiseDraft(updatedExpertise);
    setEditingSection(null);
    showSavedMessage("Expertise saved successfully.");
  }

  async function saveEngagement() {
    if (!profile || !engagementDraft){
      return;
    }
    if (!engagementDraft.primaryLocation.trim()) {
      alert("Please enter your primary location.");
      return;
    }

    if (!engagementDraft.sessionDuration) {
      alert("Please select your session duration.");
      return;
    }

    if (!engagementDraft.audienceSize) {
      alert("Please select your audience size.");
      return;
    }
    const selectedFormats = getSelectedFormats(engagementDraft);
    if (selectedFormats.length === 0) {
      alert("Please select at least one delivery format.");
      return;
    }
    if (engagementDraft.deliveryFocus.length === 0) {
      alert("Please select at least one delivery focus.");
      return;
    }
    const updatedEngagement = {
      ...engagementDraft,
      format: formatLabelsFor(selectedFormats),
      formats: selectedFormats,
    };
    try {
      await saveGuestLecturerEngagement(updatedEngagement);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }
    setProfile({
      ...profile,
      engagementProfile: cloneData(updatedEngagement),
    });
    setEditingSection(null);
    showSavedMessage("Engagement profile saved successfully.");
  }
  async function saveAvailability() {
    if (!profile || !engagementDraft){
      return;
    }

    if (engagementDraft.schedule.availableDays.length === 0) {
      alert("Please select at least one available day.");
      return;
    }
    if (!engagementDraft.schedule.availableFrom || !engagementDraft.schedule.availableTo) {
      alert("Please select your available start and end time.");
      return;
    }

    try {
      await saveGuestLecturerEngagement(engagementDraft);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }
    setProfile({
      ...profile,
      engagementProfile: cloneData(engagementDraft),
    });
    setEditingSection(null);
    showSavedMessage("Availability saved successfully.");
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !basicDraft){
      return;
    }
    if (file.size > 1024 * 1024) {
      alert("Please select an image smaller than 1 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBasicDraft({...basicDraft,photoPreview: reader.result as string});
    };

    reader.readAsDataURL(file);
  }

  function toggleExpertiseTopic(topic: string) {
    if (!expertiseDraft) return;
    const isSelected = expertiseDraft.selectedTopics.includes(topic);
    if (!isSelected && expertiseDraft.selectedTopics.length >= 5) {
      alert("You can select up to 5 topics.");
      return;
    }
    setExpertiseDraft({...expertiseDraft, selectedTopics: isSelected ? expertiseDraft.selectedTopics.filter((selectedTopic) => selectedTopic !== topic) : [...expertiseDraft.selectedTopics, topic]});
  }
  function toggleFormat(option: string) {
    if (!engagementDraft){
      return;
    }    
    const selectedFormats = getSelectedFormats(engagementDraft);
    const isSelected = selectedFormats.includes(option);
    const nextFormats = isSelected ? selectedFormats.filter((selectedOption) => selectedOption !== option) : [...selectedFormats, option];
    setEngagementDraft({ ...engagementDraft, format: formatLabelsFor(nextFormats), formats: nextFormats});
  }
  function toggleDeliveryFocus(option: string) {
    if (!engagementDraft){
      return;
    }
    const isSelected = engagementDraft.deliveryFocus.includes(option);
    setEngagementDraft({ ...engagementDraft,deliveryFocus: isSelected ? engagementDraft.deliveryFocus.filter((selectedOption) => selectedOption !== option): [...engagementDraft.deliveryFocus, option]});
  }

  function toggleAvailableDay(day: string) {
    if (!engagementDraft) return;

    const isSelected = engagementDraft.schedule.availableDays.includes(day);

    setEngagementDraft({
      ...engagementDraft,

      schedule: {
        ...engagementDraft.schedule,

        availableDays: isSelected
          ? engagementDraft.schedule.availableDays.filter((selectedDay) => selectedDay !== day)
          : [...engagementDraft.schedule.availableDays, day],
      },
    });
  }

  if (isLoading) {
    return (
      <DashboardShell
        role="guestLecturer"
        menuItems={guestLecturerMenu}
        notificationHref="/guest_lecturer/notifications"
      >
        <div className="flex min-h-96 items-center justify-center">
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </DashboardShell>
    );
  }

  if (!profile || !basicDraft || !expertiseDraft || !engagementDraft) {
    return (
      <DashboardShell
        role="guestLecturer"
        menuItems={guestLecturerMenu}
        notificationHref="/guest_lecturer/notifications"
      >
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">{loadError ? "Profile unavailable" : "Profile not found"}</h1>
          <p className="mt-2 text-gray-600">{loadError || "Please complete your profile first."}</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      role="guestLecturer"
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Guest Lecturer</p>
          <h1 className="mt-2 text-4xl font-extrabold text-[#2d2d2d]">My Profile</h1>
          <p className="mt-2 text-gray-600">Review and update your profile information.</p>
        </div>
        {savedMessage && <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 font-medium text-green-700">{savedMessage}</div>}
        <section className="mb-6 rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {profile.basicInformation.photoPreview ? (
              <Image
                src={profile.basicInformation.photoPreview}
                alt={profile.basicInformation.fullName}
                width={112}
                height={112}
                unoptimized
                className="h-28 w-28 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-gray-200 text-4xl font-bold text-gray-500">
                {profile.basicInformation.fullName.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div>
              <h2 className="text-3xl font-bold text-[#2d2d2d]">{profile.basicInformation.fullName}</h2>
              <p className="mt-2 text-lg text-gray-700">{profile.basicInformation.professionalRole}</p>
              <p className="mt-1 text-gray-500">{profile.basicInformation.professionalField}</p>
              <p className="mt-5 max-w-3xl leading-7 text-gray-600">{profile.basicInformation.bio}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <EditableProfileSection
              title="Basic Information"
              isEditing={editingSection === "basic"}
              onEdit={() => startEditing("basic")}
              onCancel={cancelEditing}
              onSave={saveBasicInformation}
              editContent={<BasicInformationEditor draft={basicDraft} setDraft={setBasicDraft} fileInputRef={fileInputRef} onPhotoChange={handlePhotoChange} />}
            >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <ProfileField label="Full Name" value={profile.basicInformation.fullName} />
                <ProfileField label="Professional Field" value={profile.basicInformation.professionalField} />
                <ProfileField label="Professional Role" value={profile.basicInformation.professionalRole} />
                <div className="md:col-span-2">
                  <ProfileField label="Short Bio" value={profile.basicInformation.bio} />
                </div>
              </div>
            </EditableProfileSection>

            <EditableProfileSection
              title="Expertise"
              isEditing={editingSection === "expertise"}
              onEdit={() => startEditing("expertise")}
              onCancel={cancelEditing}
              onSave={saveExpertise}
              editContent={<ExpertiseEditor draft={expertiseDraft} setDraft={setExpertiseDraft} onToggleTopic={toggleExpertiseTopic} />}
            >
              <div className="space-y-7">
                <TagList label="Expertise Topics" items={profile.expertise.selectedTopics} />
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <ProfileField label="Experience Level" value={formatStoredValue(profile.expertise.experienceLevel)} />
                  <ProfileField label="Speaking Experience" value={profile.expertise.hasSpeakingExperience ? "Yes" : "No"} />
                  {profile.expertise.hasSpeakingExperience && <ProfileField label="Speaking Details" value={profile.expertise.speakingDetails} />}
                  <ProfileField label="International Experience" value={profile.expertise.hasInternationalExperience ? "Yes" : "No"} />
                  {profile.expertise.hasInternationalExperience && (
                    <ProfileField label="International Details" value={profile.expertise.internationalDetails} />
                  )}

                  <ProfileField label="LinkedIn" value={profile.expertise.linkedin} />
                </div>
              </div>
            </EditableProfileSection>


            <EditableProfileSection
              title="Engagement Profile"
              isEditing={editingSection === "engagement"}
              onEdit={() => startEditing("engagement")}
              onCancel={cancelEditing}
              onSave={saveEngagement}
              editContent={
                <EngagementEditor
                  draft={engagementDraft}
                  setDraft={setEngagementDraft}
                  onToggleFormat={toggleFormat}
                  onToggleDeliveryFocus={toggleDeliveryFocus}
                />
              }
            >
              <div className="space-y-7">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <ProfileField label="Primary Location" value={profile.engagementProfile.primaryLocation} />
                  <ProfileField label="Session Duration" value={formatStoredValue(profile.engagementProfile.sessionDuration)} />
                  <ProfileField label="Audience Size" value={formatAudienceSize(profile.engagementProfile.audienceSize)} />
                  <ProfileField
                    label="Delivery Format"
                    value={getSelectedFormats(profile.engagementProfile).map((item) => formatStoredValue(item)).join(", ")}
                  />
                </div>

                <TagList label="Delivery Focus" items={profile.engagementProfile.deliveryFocus} />
              </div>
            </EditableProfileSection>
          </div>


          <div>
            <EditableProfileSection
              title="Availability"
              isEditing={editingSection === "availability"}
              onEdit={() => startEditing("availability")}
              onCancel={cancelEditing}
              onSave={saveAvailability}
              editContent={<AvailabilityEditor draft={engagementDraft} setDraft={setEngagementDraft} onToggleDay={toggleAvailableDay} />}
            >
              <div className="space-y-6">
                <TagList label="Available Days" items={profile.engagementProfile.schedule.availableDays} />
                <ProfileField
                  label="Available Time"
                  value={formatTimeRange(profile.engagementProfile.schedule.availableFrom, profile.engagementProfile.schedule.availableTo)}
                />

                <ProfileField label="Frequency" value={formatStoredValue(profile.engagementProfile.schedule.availabilityFrequency)} />
                <ProfileField label="Availability Notes" value={profile.engagementProfile.schedule.availabilityNotes} />
              </div>
            </EditableProfileSection>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function BasicInformationEditor({
  draft,
  setDraft,
  fileInputRef,
  onPhotoChange,
}: {
  draft: GuestLecturerBasicInformationData;
  setDraft: React.Dispatch<React.SetStateAction<GuestLecturerBasicInformationData | null>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        {draft.photoPreview ? (
          <Image src={draft.photoPreview} alt={draft.fullName} width={96} height={96} unoptimized className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-200 text-3xl font-bold text-gray-500">
            {draft.fullName.charAt(0).toUpperCase() || "?"}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPhotoChange} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl bg-gray-200 px-5 py-3 font-semibold hover:bg-gray-300">
          Change Photo
        </button>
      </div>

      <ProfileInput
        label="Full Name"
        value={draft.fullName}
        onChange={(value) =>
          setDraft({
            ...draft,
            fullName: value,
          })
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ProfileSelect
          label="Professional Field"
          value={draft.professionalField}
          options={professionalFields}
          onChange={(value) =>
            setDraft({
              ...draft,
              professionalField: value,
            })
          }
        />

        <ProfileSelect
          label="Professional Role"
          value={draft.professionalRole}
          options={professionalRoles}
          onChange={(value) =>
            setDraft({
              ...draft,
              professionalRole: value,
            })
          }
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider">Short Bio</label>
        <textarea
          rows={4}
          maxLength={250}
          value={draft.bio}
          onChange={(event) =>
            setDraft({
              ...draft,
              bio: event.target.value,
            })
          }
          className="w-full resize-none border-0 border-b-2 border-black bg-gray-100 px-4 py-4 outline-none focus:bg-white"
        />
        <p className="mt-1 text-right text-xs text-gray-500">{draft.bio.length}/250</p>
      </div>
    </div>
  );
}

function ExpertiseEditor({
  draft,
  setDraft,
  onToggleTopic,
}: {
  draft: GuestLecturerExpertiseData;
  setDraft: React.Dispatch<React.SetStateAction<GuestLecturerExpertiseData | null>>;
  onToggleTopic: (topic: string) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <ProfileLabel>Expertise Topics</ProfileLabel>
        <div className="flex flex-wrap gap-2">
          {expertiseTopics.map((topic) => {
            const selected = draft.selectedTopics.includes(topic);

            return (
              <button
                key={topic}
                type="button"
                onClick={() => onToggleTopic(topic)}
                className={"rounded-full px-4 py-2 text-sm font-semibold " + (selected ? "bg-[#2d2d2d] text-white" : "bg-gray-200 text-gray-700")}
              >
                {topic}
              </button>
            );
          })}
        </div>
      </div>

      <ProfileSelect
        label="Experience Level"
        value={draft.experienceLevel}
        options={experienceLevels.map((level) => ({
          value: level.value,
          label: level.title,
        }))}
        onChange={(value) =>
          setDraft({
            ...draft,
            experienceLevel: value,
          })
        }
      />

      <ToggleEditor
        label="Speaking Experience"
        checked={draft.hasSpeakingExperience}
        onChange={() =>
          setDraft({
            ...draft,

            hasSpeakingExperience: !draft.hasSpeakingExperience,
          })
        }
      />

      {draft.hasSpeakingExperience && (
        <ProfileInput
          label="Speaking Details"
          value={draft.speakingDetails}
          onChange={(value) =>
            setDraft({
              ...draft,
              speakingDetails: value,
            })
          }
        />
      )}

      <ToggleEditor
        label="International Experience"
        checked={draft.hasInternationalExperience}
        onChange={() =>
          setDraft({
            ...draft,

            hasInternationalExperience: !draft.hasInternationalExperience,
          })
        }
      />

      {draft.hasInternationalExperience && (
        <ProfileInput
          label="International Details"
          value={draft.internationalDetails}
          onChange={(value) =>
            setDraft({
              ...draft,
              internationalDetails: value,
            })
          }
        />
      )}

      <ProfileInput
        label="LinkedIn"
        type="url"
        value={draft.linkedin}
        onChange={(value) =>
          setDraft({
            ...draft,
            linkedin: value,
          })
        }
      />
    </div>
  );
}

function EngagementEditor({
  draft,
  setDraft,
  onToggleFormat,
  onToggleDeliveryFocus,
}: {
  draft: GuestLecturerEngagementData;
  setDraft: React.Dispatch<React.SetStateAction<GuestLecturerEngagementData | null>>;
  onToggleFormat: (option: string) => void;
  onToggleDeliveryFocus: (option: string) => void;
}) {
  return (
    <div className="space-y-7">
      <ProfileInput
        label="Primary Location"
        value={draft.primaryLocation}
        onChange={(value) =>
          setDraft({
            ...draft,
            primaryLocation: value,
          })
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <ProfileSelect
          label="Session Duration"
          value={draft.sessionDuration}
          options={sessionDurationOptions}
          onChange={(value) =>
            setDraft({...draft,sessionDuration: value})
          }
        />

        <ProfileSelect
          label="Audience Size"
          value={draft.audienceSize}
          options={guestLecturerAudienceSizeOptions}
          onChange={(value) =>
            setDraft({...draft,audienceSize: value})
          }
        />

        <div>
          <ProfileLabel>Delivery Format(s)</ProfileLabel>

          <div className="flex flex-wrap gap-2">
            {formatOptions.map((option) => {
              const selected = getSelectedFormats(draft).includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onToggleFormat(option.value)}
                  className={"rounded-full px-4 py-2 text-sm font-semibold " + (selected ? "bg-[#2d2d2d] text-white" : "bg-gray-200 text-gray-700")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <ProfileLabel>Delivery Focus</ProfileLabel>

        <div className="flex flex-wrap gap-2">
          {deliveryFocusOptions.map((option) => {
            const selected = draft.deliveryFocus.includes(option);

            return (
              <button
                key={option}
                type="button"
                onClick={() => onToggleDeliveryFocus(option)}
                className={"rounded-full px-4 py-2 text-sm font-semibold " + (selected ? "bg-[#2d2d2d] text-white" : "bg-gray-200 text-gray-700")}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AvailabilityEditor({
  draft,
  setDraft,
  onToggleDay,
}: {
  draft: GuestLecturerEngagementData;
  setDraft: React.Dispatch<React.SetStateAction<GuestLecturerEngagementData | null>>;
  onToggleDay: (day: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <ProfileLabel>Available Days</ProfileLabel>
        <div className="flex flex-wrap gap-2">
          {weekDays.map((day) => {
            const selected = draft.schedule.availableDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => onToggleDay(day.value)}
                className={"rounded-full px-4 py-2 text-sm font-semibold " + (selected ? "bg-[#2d2d2d] text-white" : "bg-gray-200 text-gray-700")}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>

      <ProfileInput
        label="Available From"
        type="time"
        value={draft.schedule.availableFrom}
        onChange={(value) =>
          setDraft({...draft, schedule: {...draft.schedule,availableFrom: value},
          })
        }
      />

      <ProfileInput
        label="Available To"
        type="time"
        value={draft.schedule.availableTo}
        onChange={(value) =>
          setDraft({...draft,schedule: {...draft.schedule, availableTo: value},
          })
        }
      />

      <ProfileSelect
        label="Frequency"
        value={draft.schedule.availabilityFrequency}
        options={guestLecturerAvailabilityFrequencyOptions}
        onChange={(value) =>
          setDraft({...draft, schedule: {...draft.schedule, availabilityFrequency: value}})
        }
      />
      <div>
        <ProfileLabel>Availability Notes</ProfileLabel>
        <textarea
          rows={4}
          maxLength={250}
          value={draft.schedule.availabilityNotes}
          onChange={(event) =>
            setDraft({...draft,schedule: {...draft.schedule,availabilityNotes: event.target.value},
            })
          }
          className="w-full resize-none border-0 border-b-2 border-black bg-gray-100 px-4 py-4 outline-none focus:bg-white"
        />
      </div>
    </div>
  );
}
function ToggleEditor({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-100 px-5 py-4">
      <span className="font-semibold">{label}</span>

      <button type="button" onClick={onChange} className={"relative h-8 w-14 rounded-full transition-colors " + (checked ? "bg-blue-500" : "bg-gray-300")}>
        <span className={"absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform " + (checked ? "translate-x-6" : "translate-x-0")} />
      </button>
    </div>
  );
}


function formatLabelsFor(values: string[]) {
  return values.map((value) => formatOptions.find((option) => option.value === value)?.label ?? value).join(", ");
}

function getSelectedFormats(engagement: GuestLecturerEngagementData) {
  if (engagement.formats?.length) {
    return engagement.formats;
  }

  if (!engagement.format) {
    return [];
  }

  return engagement.format.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatAudienceSize(value: string) {
  const labels: Record<string, string> = {
    small: "Small — up to 30 people",
    medium: "Medium — 31 to 100 people",
    large: "Large — more than 100 people",
    "no-preference": "No preference",
  };

  return labels[value] ?? formatStoredValue(value);
}
