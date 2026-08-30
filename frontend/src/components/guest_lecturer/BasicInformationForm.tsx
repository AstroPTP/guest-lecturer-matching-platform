"use client";

import { useEffect, useRef, useState, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getGuestLecturerBasicInformation } from "@/services/profile/guestLecturerProfileService";
import { professionalFields, professionalRoles } from "@/constants/profileOptions/guestLecturer";

export default function BasicInformationForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [professionalField, setProfessionalField] = useState("");
  const [professionalRole, setProfessionalRole] = useState("");
  const [bio, setBio] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const data = await getGuestLecturerBasicInformation();

        if (cancelled || !data) {
          return;
        }

        setFullName(data.fullName);
        setProfessionalField(data.professionalField);
        setProfessionalRole(data.professionalRole);
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) 
      return;
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
    router.push("/guest_lecturer/expertise");
  }

  return (
    <main className="mx-auto w-full max-w-6xl">

      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold tracking-[0.2em] text-gray-500">STEP 1 OF 4</p>

        <div className="flex gap-2">
          <div className="h-[3px] w-14 rounded-full bg-black"></div>
          <div className="h-[3px] w-10 rounded-full bg-gray-300"></div>
          <div className="h-[3px] w-10 rounded-full bg-gray-300"></div>
          <div className="h-[3px] w-10 rounded-full bg-gray-300"></div>
        </div>
      </div>
      <div className="mb-14 text-center">
        <h1 className="mb-5 text-5xl font-extrabold">Basic Information</h1>

        <p className="mx-auto max-w-3xl text-lg text-gray-600">
          This profile is for guest lecturers within the Faculty of Business and Law. Tell us a little about yourself so Unit Coordinators can discover your
          expertise and invite you to suitable guest lecture opportunities.
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="mb-12 flex items-center gap-6">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-24 w-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-100 flex items-center justify-center text-5xl text-gray-400"
          >
            {photoPreview ? <Image src={photoPreview} className="h-full w-full rounded-full object-cover" alt="" width={96} height={96} unoptimized /> : "+"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
          <div>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl bg-gray-200 px-6 py-3 font-semibold">
              Upload Photo
            </button>
            <p className="mt-2 text-sm text-gray-500">Helps Unit Coordinators recognise you. Optional but recommended.</p>
          </div>
        </div>
        <div className="mb-8">
          <label className="mb-2 block text-sm font-bold uppercase tracking-widest">Full Name</label>

          <input
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Dr. Julian Sterling"
            className="w-full bg-gray-200 border-0 border-b-2 border-black px-4 py-4 outline-none focus:bg-white"
          />
        </div>


        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">

          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-widest">Professional Field</label>

            <select
              required
              value={professionalField}
              onChange={(event) => setProfessionalField(event.target.value)}
              className="w-full bg-gray-200 border-0 border-b-2 border-black px-4 py-4 outline-none"
            >
              <option value="">Select your field</option>

              {professionalFields.map((field) => (
                <option key={field}>{field}</option>
              ))}
            </select>
          </div>


          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-widest">Current Professional Role</label>

            <select
              required
              value={professionalRole}
              onChange={(event) => setProfessionalRole(event.target.value)}
              className="w-full bg-gray-200 border-0 border-b-2 border-black px-4 py-4 outline-none"
            >
              <option value="">Select your role</option>

              {professionalRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>


        <div>
          <div className="mb-2 flex justify-between">
            <label className="text-sm font-bold uppercase tracking-widest">Short Bio</label>

            <span className="text-sm text-gray-500">{bio.length}/250</span>
          </div>

          <textarea
            rows={4}
            maxLength={250}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Briefly describe your business or legal expertise..."
            className="w-full resize-none bg-gray-200 border-0 border-b-2 border-black px-4 py-4 outline-none focus:bg-white"
          />
        </div>


        <div className="mt-14 flex justify-end">
          <button
            type="submit"
            className="rounded-xl bg-black px-10 py-4 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-gray-800 hover:shadow-md active:scale-[0.98]"
          >
            Next
          </button>
        </div>
      </form>
    </main>
  );
}
