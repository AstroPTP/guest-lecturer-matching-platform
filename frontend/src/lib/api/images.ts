import { backendFetch } from './backendClient';

/** Which profile the photo belongs to, as the backend routes name it. */
export type ProfileImageOwner = 'unit-coordinators' | 'guest-speakers';

/** Matches the backend's limit in images.service.ts. */
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * A photo edit the user has made but not saved yet: a newly picked file, or
 * removing the current photo. Null means the photo is unchanged.
 */
export type PendingPhotoChange = { kind: 'upload'; file: File } | { kind: 'remove' } | null;

/**
 * Applies a pending photo edit.
 *
 * @returns The photo's URL afterwards, or "" when it was removed.
 */
export async function applyProfilePhotoChange(
  owner: ProfileImageOwner,
  change: NonNullable<PendingPhotoChange>,
): Promise<string> {
  if (change.kind === 'upload') {
    return uploadMyProfileImage(owner, change.file);
  }
  await removeMyProfileImage(owner);
  return '';
}

/**
 * Uploads the signed-in user's profile photo, replacing any previous one.
 *
 * @returns The new photo's URL, ready to use as `photoPreview`.
 */
export async function uploadMyProfileImage(owner: ProfileImageOwner, file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);

  const { image_id } = await backendFetch<{ image_id: string }>(`/${owner}/me/profile-image`, {
    method: 'POST',
    body,
  });
  return imageUrl(image_id);
}

export async function removeMyProfileImage(owner: ProfileImageOwner): Promise<void> {
  await backendFetch(`/${owner}/me/profile-image`, { method: 'DELETE' });
}

export function imageUrl(imageId: string): string {
  return `/api/backend/images/${imageId}`;
}
