import { backendFetch } from './backendClient';

export type ProfileImageOwner = 'unit-coordinators' | 'guest-speakers';

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export type PendingPhotoChange = { kind: 'upload'; file: File } | { kind: 'remove' } | null;

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
