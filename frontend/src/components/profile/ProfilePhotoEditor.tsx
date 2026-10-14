"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Image from "next/image";
import { BackendError } from "@/lib/api/backendClient";
import { MAX_PROFILE_PHOTO_BYTES, uploadMyProfileImage, type ProfileImageOwner } from "@/lib/api/images";

/**
 * The profile photo on a My Profile overview, with an edit button over it.
 * A picked photo is uploaded straight away rather than waiting for a save.
 */
export default function ProfilePhotoEditor({
  owner,
  photo,
  fullName,
  onChange,
}: {
  owner: ProfileImageOwner;
  photo: string;
  fullName: string;
  /** Called with the new photo's URL once it has uploaded. */
  onChange: (photoUrl: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still fires onChange.
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      alert("Please select an image smaller than 5 MB.");
      return;
    }

    setIsUploading(true);
    try {
      onChange(await uploadMyProfileImage(owner, file));
    } catch (error) {
      alert(error instanceof BackendError ? error.message : "Your photo couldn't be uploaded. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="relative h-28 w-28 shrink-0">
      {photo ? (
        <Image
          src={photo}
          alt={fullName}
          width={112}
          height={112}
          unoptimized
          className={`h-28 w-28 rounded-full object-cover ${isUploading ? "opacity-50" : ""}`}
        />
      ) : (
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-full bg-gray-200 text-4xl font-bold text-gray-500 ${isUploading ? "opacity-50" : ""}`}
        >
          {fullName.charAt(0).toUpperCase() || "?"}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileChange} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        aria-label={photo ? "Change profile photo" : "Upload profile photo"}
        title={photo ? "Change profile photo" : "Upload profile photo"}
        className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#2d2d2d] text-white shadow-md hover:bg-black disabled:cursor-wait disabled:opacity-60"
      >
        {isUploading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
