"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FormSkeleton from "@/components/shared/FormSkeleton";
import FormNavButtons from "@/components/shared/FormNavButtons";
import { getGuestLecturerEngagement, saveGuestLecturerEngagement } from "@/services/profile/guestLecturerProfileService";
import {
  deliveryFocusOptions,
  formatOptions,
  guestLecturerAudienceSizeOptions,
  guestLecturerAvailabilityFrequencyOptions,
  sessionDurationOptions,
  weekDays,
} from "@/constants/profileOptions/shared";

export default function EngagementProfileForm() {
  const router = useRouter();

  const [primaryLocation, setPrimaryLocation] = useState("");
  const [sessionDuration, setSessionDuration] = useState("");
  const [audienceSize, setAudienceSize] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [deliveryFocus, setDeliveryFocus] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [availabilityFrequency, setAvailabilityFrequency] = useState("");
  const [availabilityNotes, setAvailabilityNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const data = await getGuestLecturerEngagement();
        if (cancelled || !data) {
          return;
        }
        setPrimaryLocation(data.primaryLocation);
        setSessionDuration(data.sessionDuration);
        setAudienceSize(data.audienceSize);
        setFormats(data.formats?.length ? data.formats : []);
        setDeliveryFocus(data.deliveryFocus);
        setAvailableDays(data.schedule.availableDays);
        setAvailableFrom(data.schedule.availableFrom);
        setAvailableTo(data.schedule.availableTo);
        setAvailabilityFrequency(data.schedule.availabilityFrequency);
        setAvailabilityNotes(data.schedule.availabilityNotes);
      } catch {
      } finally {
        if (!cancelled) {
          setIsLoadingDraft(false);
        }
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleFormat(option: string) {
    setFormats((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));
  }

  function toggleDeliveryFocus(option: string) {
    setDeliveryFocus((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));
  }

  function toggleAvailableDay(day: string) {
    setAvailableDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
  }

  function formatLabelsFor(values: string[]) {
    return values.map((value) => formatOptions.find((option) => option.value === value)?.label ?? value).join(", ");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!primaryLocation.trim()) {
      alert("Please enter your primary location.");
      return;
    }
    if (!sessionDuration) {
      alert("Please select your session duration.");
      return;
    }
    if (!audienceSize) {
      alert("Please select your audience size.");
      return;
    }
    if (formats.length === 0) {
      alert("Please select at least one delivery format.");
      return;
    }
    if (deliveryFocus.length === 0) {
      alert("Please select at least one delivery focus.");
      return;
    }
    if (availableDays.length === 0) {
      alert("Please select at least one available day.");
      return;
    }
    if (!availableFrom || !availableTo) {
      alert("Please select your available start and end time.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await saveGuestLecturerEngagement({
        primaryLocation,
        sessionDuration,
        audienceSize,
        format: formatLabelsFor(formats),
        formats,
        deliveryFocus,
        schedule: {
          availableDays,
          availableFrom,
          availableTo,
          availabilityFrequency,
          availabilityNotes,
        },
      });
      router.push("/guest_lecturer/consent");
    } catch {
      setError("Could not save your information. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  // Wait for the saved draft before showing the form. Otherwise anything
  // typed while it loads is overwritten when it arrives.
  if (isLoadingDraft) {
    return <FormSkeleton />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">Step 3 of 4</p>
        <div className="flex gap-2">
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-gray-300" />
        </div>
      </div>

      <div className="mb-12 text-center">
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">How can you engage?</h1>
        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Tell us about your delivery preferences and availability so Unit Coordinators can plan sessions around you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <label htmlFor="primaryLocation" className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">
            Primary Location
          </label>
          <input
            id="primaryLocation"
            type="text"
            value={primaryLocation}
            onChange={(event) => setPrimaryLocation(event.target.value)}
            placeholder="e.g., Perth, WA"
            className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
          />
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Session Duration</label>
              <select
                value={sessionDuration}
                onChange={(event) => setSessionDuration(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none"
              >
                <option value="">Select duration</option>
                {sessionDurationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Audience Size</label>
              <select
                value={audienceSize}
                onChange={(event) => setAudienceSize(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none"
              >
                <option value="">Select audience size</option>
                {guestLecturerAudienceSizeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Delivery Format(s)</h2>
          <p className="mt-2 text-sm text-gray-500">How can Unit Coordinators book you?</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {formatOptions.map((option) => {
              const isSelected = formats.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleFormat(option.value)}
                  className={
                    "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                    (isSelected ? "bg-black text-white" : "bg-gray-200 text-black hover:bg-gray-300")
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Delivery Focus</h2>
          <p className="mt-2 text-sm text-gray-500">What style of session do you prefer leading?</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {deliveryFocusOptions.map((option) => {
              const isSelected = deliveryFocus.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleDeliveryFocus(option)}
                  className={
                    "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                    (isSelected ? "bg-black text-white" : "bg-gray-200 text-black hover:bg-gray-300")
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Availability</h2>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Available Days</p>
            <div className="flex flex-wrap gap-3">
              {weekDays.map((day) => {
                const isSelected = availableDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleAvailableDay(day.value)}
                    className={
                      "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                      (isSelected ? "bg-black text-white" : "bg-gray-200 text-black hover:bg-gray-300")
                    }
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Available From</label>
              <input
                type="time"
                value={availableFrom}
                onChange={(event) => setAvailableFrom(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Available To</label>
              <input
                type="time"
                value={availableTo}
                onChange={(event) => setAvailableTo(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>
          </div>

          <div className="mt-7">
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Frequency</label>
            <select
              value={availabilityFrequency}
              onChange={(event) => setAvailabilityFrequency(event.target.value)}
              className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none"
            >
              <option value="">Select frequency</option>
              {guestLecturerAvailabilityFrequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-7">
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">Availability Notes</label>
            <textarea
              rows={4}
              maxLength={250}
              value={availabilityNotes}
              onChange={(event) => setAvailabilityNotes(event.target.value)}
              placeholder="Anything else Unit Coordinators should know about your availability..."
              className="w-full resize-none border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
            />
          </div>
        </section>

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        <FormNavButtons submitLabel={isSaving ? "Saving..." : "Next"} />
      </form>
    </main>
  );
}