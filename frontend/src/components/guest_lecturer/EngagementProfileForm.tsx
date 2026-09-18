"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FormNavButtons from "@/components/shared/FormNavButtons";
import { getGuestLecturerEngagement } from "@/services/profile/guestLecturerProfileService";
import { deliveryFocusOptions, formatOptions, guestLecturerAudienceSizeOptions, guestLecturerAvailabilityFrequencyOptions, sessionDurationOptions, weekDays} from "@/constants/profileOptions/shared";

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
        setFormats(data.formats?.length ? data.formats : data.format ? data.format.split(",").map((item) => item.trim()).filter(Boolean): []);
        setDeliveryFocus(data.deliveryFocus);
        setAvailableDays(data.schedule.availableDays);
        setAvailableFrom(data.schedule.availableFrom);
        setAvailableTo(data.schedule.availableTo);
        setAvailabilityFrequency(data.schedule.availabilityFrequency);
        setAvailabilityNotes(data.schedule.availabilityNotes);
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
      setFormats(formats.filter((selectedOption) => selectedOption !== option));
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

  function handleAvailableDay(day: string) {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter((selectedDay) => selectedDay !== day));
      return;
    }
    setAvailableDays([...availableDays, day]);
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primaryLocation.trim()) {
      alert("Please enter your primary location.");
      return;
    }
    if (!sessionDuration) {
      alert("Please select your preferred session duration.");
      return;
    }

    if (!audienceSize) {
      alert("Please select your preferred audience size.");
      return;
    }
    if (formats.length === 0) {
      alert("Please select at least one preferred delivery format.");
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

    router.push("/guest_lecturer/consent");
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
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">Engagement Profile</h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Define your availability and delivery preferences to help us match you with the right speaking engagements.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <div className="mb-7">
            <label htmlFor="primaryLocation" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              Primary Location
            </label>

            <input
              id="primaryLocation"
              name="primaryLocation"
              type="text"
              value={primaryLocation}
              onChange={(event) => setPrimaryLocation(event.target.value)}
              placeholder="e.g., Curtin University, Bentley"
              className="w-full border-0 border-b-2 border-[#2d2d2d] bg-[#e9e9e7] px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="sessionDuration" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Session Duration
              </label>

              <select
                id="sessionDuration"
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
                Preferred Audience Size
              </label>

              <select
                id="audienceSize"
                value={audienceSize}
                onChange={(event) => setAudienceSize(event.target.value)}
                className="w-full border-0 border-b-2 border-[#2d2d2d] bg-[#e9e9e7] px-4 py-4 outline-none"
              >
                <option value="">Select audience size</option>
                {guestLecturerAudienceSizeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <p className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">Delivery Format(s)</p>

              <div className="flex flex-wrap gap-3">
                {formatOptions.map((option) => {
                  const isSelected = formats.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleFormatClick(option.value)}
                      className={
                        "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                        (isSelected ? "bg-[#242424] text-white" : "bg-[#e9e9e7] text-[#333333] hover:bg-gray-300")
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Delivery Focus</h2>
          <p className="mt-2 text-sm text-gray-500">Select the types of engagement you would be comfortable delivering.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {deliveryFocusOptions.map((option) => {
              const isSelected = deliveryFocus.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleDeliveryFocus(option)}
                  className={
                    "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                    (isSelected ? "bg-[#242424] text-white" : "bg-[#e9e9e7] text-[#333333] hover:bg-gray-300")
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Typical Availability</h2>
          <p className="mt-2 text-sm text-gray-500">
            Select the days and times when you are usually available. Unit Coordinators will still confirm the exact date with you.
          </p>

          <div className="mt-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">Preferred Days</p>
            <div className="flex flex-wrap gap-3">
              {weekDays.map((day) => {
                const isSelected = availableDays.includes(day.value);

                return (
                  <button
                    key={day.value}
                    type="button"
                    title={day.label}
                    aria-label={day.label}
                    onClick={() => handleAvailableDay(day.value)}
                    className={
                      "flex h-12 w-12 items-center justify-center rounded-full font-bold transition-colors " +
                      (isSelected ? "bg-[#242424] text-white" : "bg-[#e9e9e7] text-[#2d2d2d] hover:bg-gray-300")
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
              <label htmlFor="availableFrom" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Available From
              </label>

              <input
                id="availableFrom"
                type="time"
                value={availableFrom}
                onChange={(event) => setAvailableFrom(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="availableTo" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Available To
              </label>
              <input
                id="availableTo"
                type="time"
                value={availableTo}
                onChange={(event) => setAvailableTo(event.target.value)}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="availabilityFrequency" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
                Availability Frequency
              </label>
              <select
                id="availabilityFrequency"
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
          </div>

          <div className="mt-7">
            <label htmlFor="availabilityNotes" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">
              Availability Notes
            </label>

            <textarea
              id="availabilityNotes"
              rows={3}
              maxLength={250}
              value={availabilityNotes}
              onChange={(event) => setAvailabilityNotes(event.target.value)}
              placeholder="e.g., Available during university teaching weeks with two weeks' notice."
              className="w-full resize-none border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
            />
            <p className="mt-1 text-right text-xs text-gray-500">{availabilityNotes.length}/250</p>
          </div>
        </section>
        <FormNavButtons submitLabel="Next" />
      </form>
    </main>
  );
}
