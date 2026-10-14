"use client";

import { useEffect, useRef, useState, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getGuestLecturerBasicInformation, saveGuestLecturerBasicInformation } from "@/services/profile/guestLecturerProfileService";
import { professionalFields, professionalRoles } from "@/constants/profileOptions/guestLecturer";
import { applyProfilePhotoChange, MAX_PROFILE_PHOTO_BYTES, type PendingPhotoChange } from "@/lib/api/images";
import { BackendError } from "@/lib/api/backendClient";

export default function BasicInformationForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [professionalField, setProfessionalField] = useState("");
  const [professionalRole, setProfessionalRole] = useState("");
  const [bio, setBio] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  // The saved photo's URL, sent unchanged with the basic information.
  const [savedPhoto, setSavedPhoto] = useState("");
  // A photo picked or removed here, applied once the profile row exists.
  const [photoChange, setPhotoChange] = useState<PendingPhotoChange>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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
        setSavedPhoto(data.photoPreview);
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
    if (!file){
      return;
    }
    // Cleared so picking the same file again, e.g. after removing it, still fires onChange.
    event.target.value = "";
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      alert("Please select an image smaller than 5 MB.");
      return;
    }
    setPhotoChange({ kind: "upload", file });
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
      setPhotoPreview(imageData);
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoRemove() {
    // Only a photo that was already saved needs deleting on the server.
    setPhotoChange(savedPhoto ? { kind: "remove" } : null);
    setPhotoPreview("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      await saveGuestLecturerBasicInformation({
        fullName,
        professionalField,
        professionalRole,
        bio,
        photoPreview: savedPhoto,
      });
      if (photoChange) {
        await applyProfilePhotoChange("guest-speakers", photoChange);
      }
      router.push("/guest_lecturer/expertise");
    } catch (error) {
      setError(error instanceof BackendError ? error.message : "Could not save your information. Please try again.");
    } finally {
      setIsSaving(false);
    }
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
      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-24 w-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-100 flex items-center justify-center text-5xl text-gray-400"
            >
              {photoPreview ? <Image src={photoPreview} className="h-full w-full rounded-full object-cover" alt="" width={96} height={96} unoptimized /> : "+"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handlePhotoChange} />
            <div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl bg-gray-200 px-6 py-3 font-semibold">
                  {photoPreview ? "Change Photo" : "Upload Photo"}
                </button>
                {photoPreview && (
                  <button type="button" onClick={handlePhotoRemove} className="rounded-xl px-6 py-3 font-semibold text-red-600 hover:bg-red-50">
                    Remove Photo
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">Helps Unit Coordinators recognise you. Optional but recommended.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <label className="mb-2 block text-sm font-bold uppercase tracking-widest">Full Name</label>

          <input
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Dr. Julian Sterling"
            className="w-full bg-gray-200 border-0 border-b-2 border-black px-4 py-4 outline-none focus:bg-white"
          />
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
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
        </section>

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-black px-10 py-4 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-gray-800 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Next"}
          </button>
        </div>
      </form>
    </main>
  );
}