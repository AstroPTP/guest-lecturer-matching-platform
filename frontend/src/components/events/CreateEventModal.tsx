"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";

import closeIcon from "@/assets/close.png";

import { formatOptions } from "@/constants/profileOptions/shared";

import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";

import type { CreateAcademicEventData, EventFormat } from "@/types/events/eventTypes";

interface CreateEventModalProps {
  coordinatorId: string;
  coordinatorName: string;

  matchedGuestLecturers: MatchedProfile[];

  onClose: () => void;

  onCreate: (data: CreateAcademicEventData) => Promise<boolean>;
}

export default function CreateEventModal({ coordinatorId, coordinatorName, matchedGuestLecturers, onClose, onCreate }: CreateEventModalProps) {
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [title, setTitle] = useState("");

  const [description, setDescription] = useState("");

  const [date, setDate] = useState("");

  const [startTime, setStartTime] = useState("");

  const [endTime, setEndTime] = useState("");

  const [location, setLocation] = useState("");

  const [format, setFormat] = useState<EventFormat>("face-to-face");

  const guestLecturerOptions = matchedGuestLecturers
    .filter((item) => item.profileType === "guestLecturer")
    .map((item) => ({
      value: item.profile.id,

      label: item.profile.basicInformation.fullName,
    }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitError("");

    const selectedMatch = matchedGuestLecturers.find((item) => item.profile.id === selectedGuestId && item.profileType === "guestLecturer");

    if (!selectedMatch || selectedMatch.profileType !== "guestLecturer") {
      alert("Please select a matched Guest Lecturer.");

      return;
    }

    if (!title.trim() || !description.trim() || !date || !startTime || !endTime || !location.trim()) {
      alert("Please complete all event details.");

      return;
    }

    if (startTime >= endTime) {
      alert("The end time must be later than the start time.");

      return;
    }

    const succeeded = await onCreate({
      matchId: selectedMatch.match.id,

      coordinatorId,
      coordinatorName,

      guestLecturerId: selectedMatch.profile.id,

      guestLecturerName: selectedMatch.profile.basicInformation.fullName,

      title: title.trim(),

      description: description.trim(),

      date,
      startTime,
      endTime,

      location: location.trim(),

      format,
    });

    if (!succeeded) {
      setSubmitError("This isn't connected to a backend yet, so the invitation couldn't be sent.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-event-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <main className="max-h-full w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl md:p-10">
        <div className="mb-8 flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Unit Coordinator</p>

            <h2 id="create-event-title" className="mt-2 text-3xl font-bold text-[#2d2d2d]">
              Create Event
            </h2>

            <p className="mt-2 text-gray-600">Create an event and send an invitation to a matched Guest Lecturer.</p>
          </div>

          <button
            type="button"
            aria-label="Close create event modal"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-2xl hover:bg-gray-200"
          >
            <Image src={closeIcon} alt="" width={18} height={18} aria-hidden="true" />
          </button>
        </div>

        {guestLecturerOptions.length === 0 ? (
          <div className="rounded-2xl bg-gray-100 p-8 text-center">
            <h3 className="text-xl font-bold text-[#2d2d2d]">No matched Guest Lecturers</h3>

            <p className="mt-2 text-gray-600">You need to match with a Guest Lecturer before creating an event.</p>

            <button type="button" onClick={onClose} className="mt-6 rounded-xl bg-[#2d2d2d] px-6 py-3 font-semibold text-white hover:bg-black">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <FormSelect
              label="Guest Lecturer"
              value={selectedGuestId}
              onChange={setSelectedGuestId}
              options={[
                {
                  value: "",
                  label: "Select a matched Guest Lecturer",
                },
                ...guestLecturerOptions,
              ]}
            />

            <FormInput label="Event Title" value={title} placeholder="e.g. Consumer Behaviour Symposium" onChange={setTitle} />

            <FormTextarea label="Description" value={description} placeholder="Describe the session and its learning purpose." onChange={setDescription} />

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <FormInput label="Date" type="date" value={date} onChange={setDate} />

              <FormInput label="Start Time" type="time" value={startTime} onChange={setStartTime} />

              <FormInput label="End Time" type="time" value={endTime} onChange={setEndTime} />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormInput label="Location" value={location} placeholder="e.g. Building 402, Room 201" onChange={setLocation} />

              <FormSelect
                label="Format"
                value={format}
                onChange={(value) => setFormat(value as EventFormat)}
                options={formatOptions}
              />
            </div>

            {submitError && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">{submitError}</p>}

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-6">
              <button type="button" onClick={onClose} className="rounded-xl bg-gray-200 px-6 py-3 font-semibold text-[#2d2d2d] hover:bg-gray-300">
                Cancel
              </button>

              <button type="submit" className="rounded-xl bg-[#2d2d2d] px-7 py-3 font-semibold text-white hover:bg-black">
                Send Invitation
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function FormInput({
  label,
  value,
  type = "text",
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;

  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">{label}</label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-0 border-b-2 border-[#2d2d2d] bg-gray-100 px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
      />
    </div>
  );
}

function FormTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;

  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">{label}</label>

      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none border-0 border-b-2 border-[#2d2d2d] bg-gray-100 px-4 py-4 outline-none placeholder:text-gray-400 focus:bg-white"
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;

  options: {
    value: string;
    label: string;
  }[];

  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#2d2d2d]">{label}</label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-0 border-b-2 border-[#2d2d2d] bg-gray-100 px-4 py-4 outline-none focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
