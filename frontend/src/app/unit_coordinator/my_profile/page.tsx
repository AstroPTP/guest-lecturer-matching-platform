"use client";

import { ProfileField, ProfileLabel, ProfileInput, ProfileSelect, TagList } from "@/components/profile/profileFields";
import { cloneData } from "@/utils/cloneData";
import { formatTimeRange } from "@/utils/displayFormatters";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EditableProfileSection from "@/components/profile/EditableProfileSection";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

import type { UnitCoordinatorBasicInformationData, UnitCoordinatorEngagementData, UnitCoordinatorExpertiseData, UnitCoordinatorProfileData} from "@/types/profile/unitCoordinatorProfileTypes";

import { getUnitCoordinatorProfile, saveUnitCoordinatorBasicInformation, saveUnitCoordinatorEngagement, saveUnitCoordinatorExpertise} from "@/services/profile/unitCoordinatorProfileService";
import { academicRoleOptions,engagementFrequencyOptions, schoolDepartmentOptions} from "@/constants/profileOptions/unitCoordinator";
import { deliveryFocusOptions, experienceLevels, expertiseTopics, formatOptions, sessionDurationOptions, unitCoordinatorAudienceSizeOptions as audienceSizeOptions,  weekDays} from "@/constants/profileOptions/shared";
import { formatStoredValue as formatSharedStoredValue } from "@/utils/displayFormatters";
import ProfilePhotoEditor from "@/components/profile/ProfilePhotoEditor";
import { BackendError } from "@/lib/api/backendClient";
import CustomTopicsField from "@/components/shared/CustomTopicsField";

const experienceLevelOptions = experienceLevels.map((level) => ({
  value: level.value,
  label: level.title,
}));

type EditingSection = "basic" | "expertise" | "engagement" | "schedule" | null;
type NullableStateSetter<T> = Dispatch<SetStateAction<T | null>>;
export default function UnitCoordinatorMyProfilePage() {
  const [profile, setProfile] = useState<UnitCoordinatorProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [basicDraft, setBasicDraft] = useState<UnitCoordinatorBasicInformationData | null>(null);
  const [expertiseDraft, setExpertiseDraft] = useState<UnitCoordinatorExpertiseData | null>(null);
  const [engagementDraft, setEngagementDraft] = useState<UnitCoordinatorEngagementData | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [loadError, setLoadError] = useState("");
    const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const savedProfile = await getUnitCoordinatorProfile();
        if (cancelled) {
          return;
        }

        if (!savedProfile) {
          // No profile yet: send them to the setup wizard instead of
          // showing an inline "not found" screen here.
          router.replace("/unit_coordinator/profile");
          return;
        }

        setProfile(savedProfile);
        setBasicDraft(cloneData(savedProfile.basicInformation));
        setExpertiseDraft(cloneData(savedProfile.expertise));
        setEngagementDraft(cloneData(savedProfile.engagementProfile));
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
  }, [router]);
  function startEditing(section: EditingSection) {
    if (!profile) {
      return;
    }
    setBasicDraft(cloneData(profile.basicInformation));
    setExpertiseDraft(cloneData(profile.expertise));
    setEngagementDraft(cloneData(profile.engagementProfile));
    setEditingSection(section);
    setSavedMessage("");
  }

  function cancelEditing() {
    if (!profile) {
      return;
    }
    setBasicDraft(cloneData(profile.basicInformation));
    setExpertiseDraft(cloneData(profile.expertise));
    setEngagementDraft(cloneData(profile.engagementProfile));
    setEditingSection(null);
  }

  function showSavedMessage(message: string) {
    setSavedMessage(message);
    window.setTimeout(() => setSavedMessage(""), 2500);
  }

  function handlePhotoUploaded(photoUrl: string) {
    setProfile((current) => current && { ...current, basicInformation: { ...current.basicInformation, photoPreview: photoUrl } });
    setBasicDraft((current) => current && { ...current, photoPreview: photoUrl });
    showSavedMessage("Profile photo updated.");
  }

  async function saveBasicInformation() {
    if (!profile || !basicDraft) return;
    if (!basicDraft.fullName.trim()) return alert("Please enter your full name.");
    if (!basicDraft.schoolDepartment) return alert("Please select your school or department.");
    if (!basicDraft.academicRole) return alert("Please select your academic role.");
    const saved: UnitCoordinatorBasicInformationData = { ...basicDraft, photoPreview: profile.basicInformation.photoPreview };
    try {
      await saveUnitCoordinatorBasicInformation(saved);
    } catch (error) {
      alert(error instanceof BackendError ? error.message : "Your changes couldn't be saved. Please try again.");
      return;
    }

    setBasicDraft(cloneData(saved));
    setProfile({ ...profile, basicInformation: cloneData(saved) });
    setEditingSection(null);
    showSavedMessage("Basic information saved successfully.");
  }

  async function saveExpertise() {
    if (!profile || !expertiseDraft) return;
    if (expertiseDraft.selectedTopics.length === 0) return alert("Please select at least one expertise topic.");
    if (expertiseDraft.experienceLevelsRequired.length === 0) return alert("Please select at least one required experience level.");
    if (!expertiseDraft.industryRelevance.trim()) return alert("Please explain the industry relevance.");
    if (!expertiseDraft.learningObjective.trim()) return alert("Please enter the learning objective.");

    try {
      await saveUnitCoordinatorExpertise(expertiseDraft);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }

    setProfile({ ...profile, expertise: cloneData(expertiseDraft) });
    setEditingSection(null);
    showSavedMessage("Guest lecturer requirements saved successfully.");
  }

  async function saveEngagement() {
    if (!profile || !engagementDraft) {
      return;
    }
    if (!engagementDraft.primaryLocation.trim()){
      return alert("Please enter the engagement location.");
    }
    if (!engagementDraft.sessionDuration){
      return alert("Please select the session duration.");
    }
    if (!engagementDraft.audienceSize) {
      return alert("Please select the audience size.");
    }
    if (engagementDraft.formats.length === 0) {
      return alert("Please select at least one preferred format.");
    }
    if (engagementDraft.deliveryFocus.length === 0) {
      return alert("Please select at least one delivery focus.");
    }    try {
      await saveUnitCoordinatorEngagement(engagementDraft);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }

    setProfile({ ...profile, engagementProfile: cloneData(engagementDraft) });
    setEditingSection(null);
    showSavedMessage("Engagement requirements saved successfully.");
  }

  async function saveSchedule() {
    if (!profile || !engagementDraft){
      return;
    }
    const { preferredDays, preferredFrom, preferredTo } = engagementDraft.schedule;
    if (preferredDays.length === 0){
      return alert("Please select at least one preferred day.");
    }
    if (!preferredFrom || !preferredTo){
      return alert("Please select the preferred start and end time.");
    }
    if (preferredFrom >= preferredTo){
      return alert("The end time must be later than the start time.");
    }    try {
      await saveUnitCoordinatorEngagement(engagementDraft);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }
    setProfile({ ...profile, engagementProfile: cloneData(engagementDraft) });
    setEditingSection(null);
    showSavedMessage("Preferred schedule saved successfully.");
  }

  function toggleExpertiseTopic(topic: string) {
    if (!expertiseDraft) return;
    const selected = expertiseDraft.selectedTopics.includes(topic);

    if (!selected && expertiseDraft.selectedTopics.length >= 5) {
      alert("You can select up to 5 topics.");
      return;
    }

    setExpertiseDraft({...expertiseDraft, selectedTopics: selected ? expertiseDraft.selectedTopics.filter((item) => item !== topic) : [...expertiseDraft.selectedTopics, topic]});
  }

  function toggleExperienceLevel(level: string) {
    if (!expertiseDraft) return;
    const selected = expertiseDraft.experienceLevelsRequired.includes(level);

    setExpertiseDraft({...expertiseDraft, experienceLevelsRequired: selected ? expertiseDraft.experienceLevelsRequired.filter((item) => item !== level) : [...expertiseDraft.experienceLevelsRequired, level] });
  }

  function toggleFormat(format: string) {
    if (!engagementDraft) return;
    const selected = engagementDraft.formats.includes(format);
    setEngagementDraft({...engagementDraft,formats: selected ? engagementDraft.formats.filter((item) => item !== format) : [...engagementDraft.formats, format] });
  }

  function toggleDeliveryFocus(option: string) {
    if (!engagementDraft) return;
    const selected = engagementDraft.deliveryFocus.includes(option);
    setEngagementDraft({...engagementDraft, deliveryFocus: selected ? engagementDraft.deliveryFocus.filter((item) => item !== option) : [...engagementDraft.deliveryFocus, option] });
  }

  function togglePreferredDay(day: string) {
    if (!engagementDraft) return;
    const selected = engagementDraft.schedule.preferredDays.includes(day);

    setEngagementDraft({...engagementDraft,schedule: { ...engagementDraft.schedule, preferredDays: selected ? engagementDraft.schedule.preferredDays.filter((item) => item !== day) : [...engagementDraft.schedule.preferredDays, day]},
    });
  }

  if (isLoading) {
    return (
      <CoordinatorDashboardShell>
        <div className="flex min-h-96 items-center justify-center">
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </CoordinatorDashboardShell>
    );
  }

  if (!profile || !basicDraft || !expertiseDraft || !engagementDraft) {
    return (
      <CoordinatorDashboardShell>
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">{loadError ? "Profile unavailable" : "Profile not found"}</h1>
          <p className="mt-2 text-gray-600">{loadError || "Please complete your profile first."}</p>
        </div>
      </CoordinatorDashboardShell>
    );
  }

  return (
    <CoordinatorDashboardShell>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Unit Coordinator</p>
          <h1 className="mt-2 text-4xl font-extrabold text-[#2d2d2d]">My Profile</h1>
          <p className="mt-2 text-gray-600">Review and update your profile and guest lecturer requirements.</p>
        </div>
        {savedMessage && <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 font-medium text-green-700">{savedMessage}</div>}
        <section className="mb-6 rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProfilePhotoEditor
              owner="unit-coordinators"
              photo={profile.basicInformation.photoPreview ?? ""}
              fullName={profile.basicInformation.fullName ?? ""}
              onChange={handlePhotoUploaded}
            />

            <div>
              <h2 className="text-3xl font-bold text-[#2d2d2d]">{profile.basicInformation.fullName}</h2>
              <p className="mt-2 text-lg text-gray-700">{formatOption(profile.basicInformation.academicRole, academicRoleOptions)}</p>
              <p className="mt-1 text-gray-500">{formatOption(profile.basicInformation.schoolDepartment, schoolDepartmentOptions)}</p>
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
              editContent={<BasicInformationEditor draft={basicDraft} setDraft={setBasicDraft} />}
            >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <ProfileField label="Full Name" value={profile.basicInformation.fullName} />
                <ProfileField label="School / Department" value={formatOption(profile.basicInformation.schoolDepartment, schoolDepartmentOptions)} />
                <ProfileField label="Academic Role" value={formatOption(profile.basicInformation.academicRole, academicRoleOptions)} />
                <div className="md:col-span-2">
                  <ProfileField label="Short Bio" value={profile.basicInformation.bio} />
                </div>
              </div>
            </EditableProfileSection>

            <EditableProfileSection
              title="Guest Lecturer Requirements"
              isEditing={editingSection === "expertise"}
              onEdit={() => startEditing("expertise")}
              onCancel={cancelEditing}
              onSave={saveExpertise}
              editContent={
                <ExpertiseEditor
                  draft={expertiseDraft}
                  setDraft={setExpertiseDraft}
                  onToggleTopic={toggleExpertiseTopic}
                  onToggleExperienceLevel={toggleExperienceLevel}
                />
              }
            >
              <div className="space-y-7">
                <TagList label="Expertise Topics" items={profile.expertise.selectedTopics} />
                <TagList
                  label="Required Experience Levels"
                  items={profile.expertise.experienceLevelsRequired.map((item) => formatOption(item, experienceLevelOptions))}
                  formatItems={false}
                />
                <ProfileField label="Industry Relevance" value={profile.expertise.industryRelevance} />
                <ProfileField label="Learning Objective" value={profile.expertise.learningObjective} />
              </div>
            </EditableProfileSection>

            <EditableProfileSection
              title="Engagement Requirements"
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
                  <ProfileField label="Session Duration" value={formatOption(profile.engagementProfile.sessionDuration, sessionDurationOptions)} />
                  <ProfileField label="Audience Size" value={formatOption(profile.engagementProfile.audienceSize, audienceSizeOptions)} />
                </div>
                <TagList
                  label="Preferred Formats"
                  items={profile.engagementProfile.formats.map((item) => formatOption(item, formatOptions))}
                  formatItems={false}
                />
                <TagList label="Delivery Focus" items={profile.engagementProfile.deliveryFocus} />
              </div>
            </EditableProfileSection>
          </div>

          <div>
            <EditableProfileSection
              title="Preferred Schedule"
              isEditing={editingSection === "schedule"}
              onEdit={() => startEditing("schedule")}
              onCancel={cancelEditing}
              onSave={saveSchedule}
              editContent={<ScheduleEditor draft={engagementDraft} setDraft={setEngagementDraft} onToggleDay={togglePreferredDay} />}
            >
              <div className="space-y-6">
                <TagList label="Preferred Days" items={profile.engagementProfile.schedule.preferredDays} />
                <ProfileField
                  label="Preferred Time"
                  value={formatTimeRange(profile.engagementProfile.schedule.preferredFrom, profile.engagementProfile.schedule.preferredTo, "Not provided")}
                />
                <ProfileField
                  label="Engagement Frequency"
                  value={formatOption(profile.engagementProfile.schedule.engagementFrequency, engagementFrequencyOptions)}
                />
                <ProfileField label="Schedule Notes" value={profile.engagementProfile.schedule.scheduleNotes} />
              </div>
            </EditableProfileSection>
          </div>
        </div>
      </div>
    </CoordinatorDashboardShell>
  );
}

function BasicInformationEditor({
  draft,
  setDraft,
}: {
  draft: UnitCoordinatorBasicInformationData;
  setDraft: NullableStateSetter<UnitCoordinatorBasicInformationData>;
}) {
  return (
    <div className="space-y-6">
      <ProfileInput label="Full Name" value={draft.fullName} onChange={(value) => setDraft({ ...draft, fullName: value })} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ProfileSelect
          label="School / Department"
          value={draft.schoolDepartment}
          options={schoolDepartmentOptions}
          onChange={(value) => setDraft({ ...draft, schoolDepartment: value })}
        />
        <ProfileSelect
          label="Academic Role"
          value={draft.academicRole}
          options={academicRoleOptions}
          onChange={(value) => setDraft({ ...draft, academicRole: value })}
        />
      </div>

      <ProfileTextarea label="Short Bio" value={draft.bio} maxLength={250} onChange={(value) => setDraft({ ...draft, bio: value })} />
    </div>
  );
}

function ExpertiseEditor({
  draft,
  setDraft,
  onToggleTopic,
  onToggleExperienceLevel,
}: {
  draft: UnitCoordinatorExpertiseData;
  setDraft: NullableStateSetter<UnitCoordinatorExpertiseData>;
  onToggleTopic: (topic: string) => void;
  onToggleExperienceLevel: (level: string) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <ChoiceButtons
          label="Expertise Topics (maximum 5)"
          options={expertiseTopics.map((item) => ({ value: item, label: item }))}
          selectedValues={draft.selectedTopics}
          onToggle={onToggleTopic}
        />
        <CustomTopicsField compact selectedTopics={draft.selectedTopics} onChange={(selectedTopics) => setDraft({ ...draft, selectedTopics })} />
      </div>
      <ChoiceButtons
        label="Required Experience Levels"
        options={experienceLevelOptions}
        selectedValues={draft.experienceLevelsRequired}
        onToggle={onToggleExperienceLevel}
      />
      <ProfileTextarea label="Industry Relevance" value={draft.industryRelevance} onChange={(value) => setDraft({ ...draft, industryRelevance: value })} />
      <ProfileTextarea label="Learning Objective" value={draft.learningObjective} onChange={(value) => setDraft({ ...draft, learningObjective: value })} />
    </div>
  );
}

function EngagementEditor({
  draft,
  setDraft,
  onToggleFormat,
  onToggleDeliveryFocus,
}: {
  draft: UnitCoordinatorEngagementData;
  setDraft: NullableStateSetter<UnitCoordinatorEngagementData>;
  onToggleFormat: (format: string) => void;
  onToggleDeliveryFocus: (option: string) => void;
}) {
  return (
    <div className="space-y-7">
      <ProfileInput label="Primary Location" value={draft.primaryLocation} onChange={(value) => setDraft({ ...draft, primaryLocation: value })} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ProfileSelect
          label="Session Duration"
          value={draft.sessionDuration}
          options={sessionDurationOptions}
          onChange={(value) => setDraft({ ...draft, sessionDuration: value })}
        />
        <ProfileSelect
          label="Audience Size"
          value={draft.audienceSize}
          options={audienceSizeOptions}
          onChange={(value) => setDraft({ ...draft, audienceSize: value })}
        />
      </div>
      <ChoiceButtons label="Preferred Formats" options={formatOptions} selectedValues={draft.formats} onToggle={onToggleFormat} />
      <ChoiceButtons
        label="Delivery Focus"
        options={deliveryFocusOptions.map((item) => ({ value: item, label: item }))}
        selectedValues={draft.deliveryFocus}
        onToggle={onToggleDeliveryFocus}
      />
    </div>
  );
}

function ScheduleEditor({
  draft,
  setDraft,
  onToggleDay,
}: {
  draft: UnitCoordinatorEngagementData;
  setDraft: NullableStateSetter<UnitCoordinatorEngagementData>;
  onToggleDay: (day: string) => void;
}) {
  return (
    <div className="space-y-6">
      <ChoiceButtons label="Preferred Days" options={weekDays} selectedValues={draft.schedule.preferredDays} onToggle={onToggleDay} />
      <ProfileInput
        label="Preferred From"
        type="time"
        value={draft.schedule.preferredFrom}
        onChange={(value) => setDraft({ ...draft, schedule: { ...draft.schedule, preferredFrom: value } })}
      />
      <ProfileInput
        label="Preferred To"
        type="time"
        value={draft.schedule.preferredTo}
        onChange={(value) => setDraft({ ...draft, schedule: { ...draft.schedule, preferredTo: value } })}
      />
      <ProfileSelect
        label="Engagement Frequency"
        value={draft.schedule.engagementFrequency}
        options={engagementFrequencyOptions}
        onChange={(value) => setDraft({ ...draft, schedule: { ...draft.schedule, engagementFrequency: value } })}
      />
      <ProfileTextarea
        label="Schedule Notes"
        value={draft.schedule.scheduleNotes}
        onChange={(value) => setDraft({ ...draft, schedule: { ...draft.schedule, scheduleNotes: value } })}
      />
    </div>
  );
}

function CoordinatorDashboardShell({ children }: { children: ReactNode }) {
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      {children}
    </DashboardShell>
  );
}
function ProfileTextarea({ label, value, onChange, maxLength = 500 }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider">{label}</label>
      <textarea
        rows={4}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none border-0 border-b-2 border-black bg-gray-100 px-4 py-4 outline-none focus:bg-white"
      />
      <p className="mt-1 text-right text-xs text-gray-500">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}


function ChoiceButtons({
  label,
  options,
  selectedValues,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <ProfileLabel>{label}</ProfileLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={
                "rounded-full px-4 py-2 text-sm font-semibold transition " +
                (selected ? "bg-[#2d2d2d] text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300")
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatOption(value: string, options: { value: string; label: string }[]) {
  return options.find((option) => option.value === value)?.label ?? formatStoredValue(value);
}

function formatStoredValue(value?: string) {
  return formatSharedStoredValue(value) || "Not provided";
}
