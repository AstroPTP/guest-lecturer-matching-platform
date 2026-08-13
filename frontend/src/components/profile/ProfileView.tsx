import Link from "next/link";
import Image from "next/image";

import type { ProfileViewData, ProfileViewField, ProfileViewSection, ProfileViewTagGroup } from "@/types/profile/profileViewTypes";
import { formatStoredValue } from "@/utils/displayFormatters";

interface ProfileViewProps {
  profile: ProfileViewData;
  mainEditHref: string;
  readOnly?: boolean;

  headerAction?: React.ReactNode;
}

export default function ProfileView({ profile, mainEditHref, readOnly = false, headerAction }: ProfileViewProps) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Page heading */}
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">{profile.roleLabel}</p>

          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#2d2d2d]">My Profile</h1>

          <p className="mt-2 text-gray-600">Review and manage your profile information.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {headerAction}

          {!readOnly && mainEditHref && (
            <Link href={mainEditHref} className="rounded-xl bg-[#2d2d2d] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-black">
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      {/* Main profile summary */}
      <section className="mb-6 rounded-2xl bg-white p-7 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ProfilePhoto fullName={profile.fullName} photoPreview={profile.photoPreview} />

          <div className="min-w-0 flex-1">
            <h2 className="break-words text-3xl font-bold text-[#2d2d2d]">{profile.fullName || "Profile name not provided"}</h2>

            {profile.role && <p className="mt-2 text-lg font-medium text-gray-700">{profile.role}</p>}

            {profile.organisation && <p className="mt-1 text-gray-500">{profile.organisation}</p>}

            {profile.bio && <p className="mt-5 max-w-3xl whitespace-pre-wrap leading-7 text-gray-600">{profile.bio}</p>}
          </div>
        </div>
      </section>

      {/* Profile information */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {profile.mainSections.map((section) => (
            <ProfileSection key={section.title} section={section} readOnly={readOnly} />
          ))}
        </div>

        <div className="space-y-6">
          {profile.sideSections.map((section) => (
            <ProfileSection key={section.title} section={section} readOnly={readOnly} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfilePhoto({ fullName, photoPreview }: { fullName: string; photoPreview?: string }) {
  if (photoPreview) {
    return (
      <Image src={photoPreview} alt={fullName || "Profile"} width={112} height={112} unoptimized className="h-28 w-28 shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-gray-200 text-4xl font-bold text-gray-500">
      {fullName ? fullName.charAt(0).toUpperCase() : "?"}
    </div>
  );
}

function ProfileSection({ section, readOnly }: { section: ProfileViewSection; readOnly: boolean }) {
  return (
    <section className="rounded-2xl bg-white p-7 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <h2 className="text-xl font-bold text-[#2d2d2d]">{section.title}</h2>

        {!readOnly && section.editHref && (
          <Link href={section.editHref} className="shrink-0 text-sm font-semibold text-gray-500 transition-colors hover:text-black">
            Edit
          </Link>
        )}
      </div>

      {section.tagGroups && (
        <div className="mb-7 space-y-6">
          {section.tagGroups.map((tagGroup) => (
            <ProfileTags key={tagGroup.label} tagGroup={tagGroup} />
          ))}
        </div>
      )}

      {section.fields && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {section.fields.map((field) => (
            <ProfileField key={field.label} field={field} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileField({ field }: { field: ProfileViewField }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{field.label}</p>

      {field.href && field.value ? (
        <a href={field.href} target="_blank" rel="noreferrer" className="break-all font-medium text-blue-600 hover:underline">
          {field.value}
        </a>
      ) : (
        <p className="whitespace-pre-wrap leading-7 text-[#333333]">{field.value || "Not provided"}</p>
      )}
    </div>
  );
}

function ProfileTags({ tagGroup }: { tagGroup: ProfileViewTagGroup }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{tagGroup.label}</p>

      {tagGroup.items.length === 0 ? (
        <p className="text-gray-400">Not provided</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tagGroup.items.map((item) => (
            <span key={item} className="rounded-full bg-[#eeeeec] px-4 py-2 text-sm font-semibold text-[#3d3d3d]">
              {formatStoredValue(item)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
