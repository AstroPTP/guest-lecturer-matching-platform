"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { UnitCoordinatorBasicInformationData } from "@/types/profile/unitCoordinatorProfileTypes";
import { getUnitCoordinatorBasicInformation } from "@/services/profile/unitCoordinatorProfileService";
import { academicRoleOptions, schoolDepartmentOptions } from "@/constants/profileOptions/unitCoordinator";

export default function BasicInformationForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [schoolDepartment, setSchoolDepartment] = useState("");
  const [academicRole, setAcademicRole] = useState("");
  const [bio, setBio] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const data = await getUnitCoordinatorBasicInformation();
        if (cancelled || !data) {
          return;
        }

        setFullName(data.fullName);
        setSchoolDepartment(data.schoolDepartment);
        setAcademicRole(data.academicRole);
        setBio(data.bio);
        setPhotoPreview(data.photoPreview);
      } catch {
    
      }
    }

    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, []);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 1024 * 1024) {
      alert("Please select an image smaller than 1 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
      setPhotoPreview(imageData);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const basicInformationData: UnitCoordinatorBasicInformationData = {
      fullName,
      schoolDepartment,
      academicRole,
      bio,
      photoPreview,
    };
    router.push("/unit_coordinator/expertise");
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold tracking-[0.2em] text-gray-500">STEP 1 OF 4</p>

        <div className="flex gap-2">
          <div className="h-[3px] w-14 rounded-full bg-black" />
          <div className="h-[3px] w-10 rounded-full bg-gray-300" />
          <div className="h-[3px] w-10 rounded-full bg-gray-300" />
          <div className="h-[3px] w-10 rounded-full bg-gray-300" />
        </div>
      </div>

      <div className="mb-14 text-center">
        <h1 className="mb-5 text-5xl font-extrabold">Basic Information</h1>

        <p className="mx-auto max-w-3xl text-lg text-gray-600">
          This profile is for Unit Coordinators within the Faculty of Business and Law. Tell us about your unit and academic role so we can help you find Guest
          Lecturers whose expertise fits your teaching needs.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-12 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 bg-gray-100 text-5xl text-gray-400"
          >
            {photoPreview ? (
              <Image
                src={photoPreview}
                alt="Unit Coordinator profile preview"
                width={96}
                height={96}
                unoptimized
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              "+"
            )}
          </button>

          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />

          <div>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl bg-gray-200 px-6 py-3 font-semibold hover:bg-gray-300">
              Upload Photo
            </button>

            <p className="mt-2 text-sm text-gray-500">Helps Guest Lecturers recognise the Unit Coordinator managing an engagement. Optional but recommended.</p>
          </div>
        </div>

        <div className="mb-8">
          <label htmlFor="fullName" className="mb-2 block text-sm font-bold uppercase tracking-widest">
            Full Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Dr. Alex Morgan"
            className="w-full border-0 border-b-2 border-black bg-gray-200 px-4 py-4 outline-none focus:bg-white"
          />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="schoolDepartment" className="mb-2 block text-sm font-bold uppercase tracking-widest">
              Faculty of Business and Law — School / Department
            </label>

            <select
              id="schoolDepartment"
              name="schoolDepartment"
              required
              value={schoolDepartment}
              onChange={(event) => setSchoolDepartment(event.target.value)}
              className="w-full border-0 border-b-2 border-black bg-gray-200 px-4 py-4 outline-none"
            >
              <option value="">Select your Faculty school or department</option>
              {schoolDepartmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="academicRole" className="mb-2 block text-sm font-bold uppercase tracking-widest">
              Academic Role
            </label>

            <select
              id="academicRole"
              name="academicRole"
              required
              value={academicRole}
              onChange={(event) => setAcademicRole(event.target.value)}
              className="w-full border-0 border-b-2 border-black bg-gray-200 px-4 py-4 outline-none"
            >
              <option value="">Select your role</option>
              {academicRoleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex justify-between">
            <label htmlFor="bio" className="text-sm font-bold uppercase tracking-widest">
              Short Bio
            </label>

            <span className="text-sm text-gray-500">{bio.length}/250</span>
          </div>

          <textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={250}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Briefly describe your relevance meeting (school, background, yourself...)"
            className="w-full resize-none border-0 border-b-2 border-black bg-gray-200 px-4 py-4 outline-none focus:bg-white"
          />
        </div>

        <div className="mt-14 flex justify-end">
          <button
            type="submit"
            className="min-w-[140px] rounded-xl bg-black px-9 py-4 font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-lg active:translate-y-0"
          >
            Next
          </button>
        </div>
      </form>
    </main>
  );
}
