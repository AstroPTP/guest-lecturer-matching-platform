"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import arrowBackIcon from "@/assets/arrow_back.png";
import type { GuestLecturerDiscoveryFilters, UnitCoordinatorDiscoveryFilters } from "@/types/filter/discoveryFilterTypes";
import type { UserRole } from "@/types/shared/userRole";
import { emptyGuestLecturerFilters, emptyUnitCoordinatorFilters,getGuestLecturerDiscoveryFilters, getUnitCoordinatorDiscoveryFilters, saveGuestLecturerDiscoveryFilters, saveUnitCoordinatorDiscoveryFilters,} from "@/services/filter/discoveryFilterService";
import { professionalFields } from "@/constants/profileOptions/guestLecturer";
import { experienceLevels, expertiseTopics, formatOptions,sessionDurationOptions, unitCoordinatorAudienceSizeOptions,weekDays} from "@/constants/profileOptions/shared";

interface FilterPageContentProps {
  role: UserRole;
  discoveryHref: string;
}

export default function FilterPageContent({ role, discoveryHref }: FilterPageContentProps) {
  const router = useRouter();
  const [guestLecturerFilters, setGuestLecturerFilters] = useState<GuestLecturerDiscoveryFilters>({...emptyGuestLecturerFilters});
  const [unitCoordinatorFilters, setUnitCoordinatorFilters] = useState<UnitCoordinatorDiscoveryFilters>({ ...emptyUnitCoordinatorFilters});
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function loadFilters() {
      try {
        if (role === "guestLecturer") {
          const filters = await getGuestLecturerDiscoveryFilters();

          if (!cancelled) {
            setGuestLecturerFilters(filters);
          }
          return;
        }
        const filters = await getUnitCoordinatorDiscoveryFilters();
        if (!cancelled) {
          setUnitCoordinatorFilters(filters);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Saved filters aren't connected to a backend yet, so this is starting from a blank filter set.");
        }
      }
    }
    void loadFilters();
    return () => {
      cancelled = true;
    };
  }, [role]);

  async function handleApply() {
    try {
      if (role === "guestLecturer") {
        await saveGuestLecturerDiscoveryFilters(guestLecturerFilters);
      } else {
        await saveUnitCoordinatorDiscoveryFilters(unitCoordinatorFilters);
      }
    } catch {
  
    }

    router.push(discoveryHref);
  }

  function handleClear() {
    if (role === "guestLecturer") {
      setGuestLecturerFilters({  ...emptyGuestLecturerFilters });
      return;
    }
    setUnitCoordinatorFilters({ ...emptyUnitCoordinatorFilters });
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-10 flex items-center justify-between gap-4">
        <Link
          href={discoveryHref}
          className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-5 py-3 font-semibold text-[#2d2d2d] transition hover:bg-gray-200"
        >
          <Image src={arrowBackIcon} alt="" width={18} height={18} aria-hidden="true" className="h-[18px] w-[18px] object-contain opacity-80" />
          Discovery
        </Link>

        <h1 className="text-3xl font-extrabold text-[#2d2d2d]">Filters</h1>
        <button type="button" onClick={handleClear} className="px-3 py-2 font-semibold text-gray-600 hover:text-black">
          Clear All
        </button>
      </div>
      {loadError && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-700">{loadError}</div>}
      {role === "guestLecturer" ? (
        <GuestLecturerFilterFields filters={guestLecturerFilters} setFilters={setGuestLecturerFilters} />
      ) : (
        <UnitCoordinatorFilterFields filters={unitCoordinatorFilters} setFilters={setUnitCoordinatorFilters} />
      )}

      <div className="sticky bottom-0 mt-10 border-t border-gray-200 bg-[#f8f8f8] py-5">
        <button type="button" onClick={handleApply} className="w-full rounded-xl bg-[#2d2d2d] px-6 py-4 text-lg font-semibold text-white hover:bg-black">
          Apply Filters
        </button>
      </div>
    </div>
  );
}

function GuestLecturerFilterFields({filters,setFilters}: {
  filters: GuestLecturerDiscoveryFilters;
  setFilters: React.Dispatch<React.SetStateAction<GuestLecturerDiscoveryFilters>>;
}) {
  return (
    <div className="space-y-6">
      <FilterSection title="Expertise Topics" description="Choose the topics you want to speak about.">
        <ChoiceButtons
          options={expertiseTopics.map((item) => ({
            value: item,
            label: item,
          }))}
          selectedValues={filters.topics}
          onToggle={(value) =>
            setFilters({
              ...filters,
              topics: toggleValue(filters.topics, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Session Format">
        <ChoiceButtons
          options={formatOptions}
          selectedValues={filters.formats}
          onToggle={(value) =>
            setFilters({
              ...filters,
              formats: toggleValue(filters.formats, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Session Duration">
        <ChoiceButtons
          options={sessionDurationOptions}
          selectedValues={filters.sessionDurations}
          onToggle={(value) =>
            setFilters({
              ...filters,
              sessionDurations: toggleValue(filters.sessionDurations, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Audience Size">
        <ChoiceButtons
          options={unitCoordinatorAudienceSizeOptions}
          selectedValues={filters.audienceSizes}
          onToggle={(value) =>
            setFilters({
              ...filters,
              audienceSizes: toggleValue(filters.audienceSizes, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Preferred Days">
        <ChoiceButtons
          options={weekDays}
          selectedValues={filters.preferredDays}
          onToggle={(value) =>
            setFilters({
              ...filters,
              preferredDays: toggleValue(filters.preferredDays, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Location">
        <FilterInput
          value={filters.location}
          placeholder="e.g. Bentley"
          onChange={(value) =>
            setFilters({
              ...filters,
              location: value,
            })
          }
        />
      </FilterSection>
    </div>
  );
}

function UnitCoordinatorFilterFields({ filters, setFilters}: {
  filters: UnitCoordinatorDiscoveryFilters;
  setFilters: React.Dispatch<React.SetStateAction<UnitCoordinatorDiscoveryFilters>>;
}) {
  return (
    <div className="space-y-6">
      <FilterSection title="Expertise Topics" description="Choose the expertise required for your unit.">
        <ChoiceButtons
          options={expertiseTopics.map((item) => ({
            value: item,
            label: item,
          }))}
          selectedValues={filters.topics}
          onToggle={(value) =>
            setFilters({
              ...filters,
              topics: toggleValue(filters.topics, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Experience Level">
        <ChoiceButtons
          options={experienceLevels.map((level) => ({ value: level.value, label: level.title }))}
          selectedValues={filters.experienceLevels}
          onToggle={(value) =>
            setFilters({
              ...filters,
              experienceLevels: toggleValue(filters.experienceLevels, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Professional Field">
        <ChoiceButtons
          options={professionalFields.map((item) => ({
            value: item,
            label: item,
          }))}
          selectedValues={filters.professionalFields}
          onToggle={(value) =>
            setFilters({
              ...filters,
              professionalFields: toggleValue(filters.professionalFields, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Delivery Format">
        <ChoiceButtons
          options={formatOptions}
          selectedValues={filters.formats}
          onToggle={(value) =>
            setFilters({
              ...filters,
              formats: toggleValue(filters.formats, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Session Duration">
        <ChoiceButtons
          options={sessionDurationOptions}
          selectedValues={filters.sessionDurations}
          onToggle={(value) =>
            setFilters({
              ...filters,
              sessionDurations: toggleValue(filters.sessionDurations, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Available Days">
        <ChoiceButtons
          options={weekDays}
          selectedValues={filters.availableDays}
          onToggle={(value) =>
            setFilters({
              ...filters,
              availableDays: toggleValue(filters.availableDays, value),
            })
          }
        />
      </FilterSection>

      <FilterSection title="Experience Preferences">
        <div className="space-y-3">
          <ToggleOption
            label="Speaking experience"
            checked={filters.requiresSpeakingExperience}
            onChange={() =>
              setFilters({
                ...filters,
                requiresSpeakingExperience: !filters.requiresSpeakingExperience,
              })
            }
          />

          <ToggleOption
            label="International experience"
            checked={filters.requiresInternationalExperience}
            onChange={() =>
              setFilters({
                ...filters,
                requiresInternationalExperience: !filters.requiresInternationalExperience,
              })
            }
          />
        </div>
      </FilterSection>

      <FilterSection title="Location">
        <FilterInput
          value={filters.location}
          placeholder="e.g. Perth"
          onChange={(value) =>
            setFilters({
              ...filters,
              location: value,
            })
          }
        />
      </FilterSection>
    </div>
  );
}

function FilterSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <h2 className="text-xl font-bold text-[#2d2d2d]">{title}</h2>

      {description && <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>}

      <div className="mt-5">{children}</div>
    </section>
  );
}

function ChoiceButtons({
  options,
  selectedValues,
  onToggle,
}: {
  options: {
    value: string;
    label: string;
  }[];

  selectedValues: string[];

  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={
              "rounded-full px-5 py-3 text-sm font-semibold transition " +
              (selected ? "bg-[#2d2d2d] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterInput({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full border-0 border-b-2 border-[#2d2d2d] bg-gray-100 px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
    />
  );
}

function ToggleOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className="flex w-full items-center justify-between rounded-2xl bg-gray-100 px-5 py-4 text-left">
      <span className="font-semibold text-[#2d2d2d]">{label}</span>

      <span className={"flex h-7 w-12 items-center rounded-full p-1 transition " + (checked ? "justify-end bg-[#2d2d2d]" : "justify-start bg-gray-300")}>
        <span className="h-5 w-5 rounded-full bg-white" />
      </span>
    </button>
  );
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
