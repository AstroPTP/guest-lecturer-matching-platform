"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import FormNavButtons from "@/components/shared/FormNavButtons";
import { getUnitCoordinatorEngagement } from "@/services/profile/unitCoordinatorProfileService";
import { deliveryFocusOptions, formatOptions, sessionDurationOptions, unitCoordinatorAudienceSizeOptions, weekDays } from "@/constants/profileOptions/shared";
import { engagementFrequencyOptions } from "@/constants/profileOptions/unitCoordinator";

export default function EngagementProfileForm() {
  const router = useRouter();
  const [primaryLocation, setPrimaryLocation] = useState("");
  const [sessionDuration, setSessionDuration] = useState("");
  const [audienceSize, setAudienceSize] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [deliveryFocus, setDeliveryFocus] = useState<string[]>([]);
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [preferredFrom, setPreferredFrom] = useState("");
  const [preferredTo, setPreferredTo] = useState("");
  const [engagementFrequency, setEngagementFrequency] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const data = await getUnitCoordinatorEngagement();
        if (cancelled || !data) {
          return;
        }

        setPrimaryLocation(data.primaryLocation);
        setSessionDuration(data.sessionDuration);
        setAudienceSize(data.audienceSize);
        setFormats(data.formats);
        setDeliveryFocus(data.deliveryFocus);
        setPreferredDays(data.schedule.preferredDays);
        setPreferredFrom(data.schedule.preferredFrom);
        setPreferredTo(data.schedule.preferredTo);
        setEngagementFrequency(data.schedule.engagementFrequency);
        setScheduleNotes(data.schedule.scheduleNotes);
      } catch {
      }
    }

    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleFormatClick(option: string) {
    if (formats.includes(option)) {
      setFormats(formats.filter((selectedFormat) => selectedFormat !== option));
      return;
    }

    setFormats([...formats, option]);
  }

  function handleDeliveryFocus(option: string) {
    if (deliveryFocus.includes(option)) {
      setDeliveryFocus(deliveryFocus.filter((selectedOption) => selectedOption !== option));
      return;
    }

    setDeliveryFocus([...deliveryFocus, option]);
  }

  function handlePreferredDay(day: string) {
    if (preferredDays.includes(day)) {
      setPreferredDays(preferredDays.filter((selectedDay) => selectedDay !== day));
      return;
    }

    setPreferredDays([...preferredDays, day]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!primaryLocation.trim()) {
      alert("Please enter the engagement location.");
      return;
    }

    if (!sessionDuration) {
      alert("Please select the expected session duration.");
      return;
    }

    if (!audienceSize) {
      alert("Please select the expected audience size.");
      return;
    }

    if (formats.length === 0) {
      alert("Please select at least one preferred format.");
      return;
    }

    if (deliveryFocus.length === 0) {
      alert("Please select at least one delivery focus.");
      return;
    }

    if (preferredDays.length === 0) {
      alert("Please select at least one preferred day.");
      return;
    }

    if (!preferredFrom || !preferredTo) {
      alert("Please select the preferred start and end time.");
      return;
    }

    if (preferredFrom >= preferredTo) {
      alert("The end time must be later than the start time.");
      return;
    }

    router.push("/unit_coordinator/consent");
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
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">Engagement Requirements</h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Define the preferred format, audience, delivery style and schedule for your Guest Lecturer engagement.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <div className="mb-7">
            <label htmlFor="primaryLocation" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              Engagement Location
            </label>

            <input
              id="primaryLocation"
              name="primaryLocation"
              type="text"
              required
              value={primaryLocation}
              onChange={(event) => setPrimaryLocation(event.target.value)}
              placeholder="e.g., Curtin University, Bentley"
              className="w-full border-0 border-b-2 border-[#2d2d2d] bg-[#e9e9e7] px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="sessionDuration" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Expected Session Duration
              </label>

              <select
                id="sessionDuration"
                required
                value={sessionDuration}
                onChange={(event) => setSessionDuration(event.target.value)}
                className="w-full border-0 border-b-2 border-[#2d2d2d] bg-[#e9e9e7] px-4 py-4 outline-none"
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
              <label htmlFor="audienceSize" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Expected Audience Size
              </label>

              <select
                id="audienceSize"
                required
                value={audienceSize}
                onChange={(event) => setAudienceSize(event.target.value)}
                className="w-full border-0 border-b-2 border-[#2d2d2d] bg-[#e9e9e7] px-4 py-4 outline-none"
              >
                <option value="">Select audience size</option>
                {unitCoordinatorAudienceSizeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Preferred Format</h2>

          <p className="mt-2 text-sm text-gray-500">Select one or more acceptable delivery formats.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            {formatOptions.map((option) => {
              const isSelected = formats.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleFormatClick(option.value)}
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

          <p className="mt-2 text-sm text-gray-500">Select one or more types of session you would like the Guest Lecturer to deliver.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            {deliveryFocusOptions.map((option) => {
              const isSelected = deliveryFocus.includes(option);

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleDeliveryFocus(option)}
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
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Preferred Schedule</h2>

          <p className="mt-2 text-sm text-gray-500">
            Select the days and times that best fit your teaching schedule. The exact date can be confirmed with the Guest Lecturer later.
          </p>

          <div className="mt-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">Preferred Days</p>

            <div className="flex flex-wrap gap-3">
              {weekDays.map((day) => {
                const isSelected = preferredDays.includes(day.value);

                return (
                  <button
                    key={day.value}
                    type="button"
                    title={day.label}
                    aria-label={day.label}
                    aria-pressed={isSelected}
                    onClick={() => handlePreferredDay(day.value)}
                    className={
                      "flex h-12 w-12 items-center justify-center rounded-full font-bold transition-colors " +
                      (isSelected ? "bg-black text-white" : "bg-gray-200 text-black hover:bg-gray-300")
                    }
                  >
                    {day.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="preferredFrom" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Preferred From
              </label>

              <input
                id="preferredFrom"
                type="time"
                value={preferredFrom}
                onChange={(event) => setPreferredFrom(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="preferredTo" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Preferred To
              </label>

              <input
                id="preferredTo"
                type="time"
                value={preferredTo}
                onChange={(event) => setPreferredTo(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="engagementFrequency" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Engagement Frequency
              </label>

              <select
                id="engagementFrequency"
                value={engagementFrequency}
                onChange={(event) => setEngagementFrequency(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none"
              >
                <option value="">Select frequency</option>
                {engagementFrequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-7">
            <label htmlFor="scheduleNotes" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              Schedule Notes
            </label>

            <textarea
              id="scheduleNotes"
              rows={3}
              maxLength={250}
              value={scheduleNotes}
              onChange={(event) => setScheduleNotes(event.target.value)}
              placeholder="e.g., Preferably during teaching weeks 5–8. Exact date is flexible with two weeks' notice."
              className="w-full resize-none border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
            />

            <p className="mt-1 text-right text-xs text-gray-500">{scheduleNotes.length}/250</p>
          </div>
        </section>

        <FormNavButtons submitLabel="Next" />
      </form>
    </main>
  );
}
