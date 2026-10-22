/**
 * Codes for the refusals the support routes can give. A refusal that carries a
 * code reaches the client with its own message; one without a code is turned
 * into a generic message by the global filter, which would leave the user
 * guessing why a file was refused.
 */
export const SupportErrorCode = {
  AttachmentInvalid: 'SUPPORT_ATTACHMENT_INVALID',
  AttachmentTooLarge: 'SUPPORT_ATTACHMENT_TOO_LARGE',
  MessageEmpty: 'SUPPORT_MESSAGE_EMPTY',
  ThreadClosed: 'SUPPORT_THREAD_CLOSED',
  ThreadNotFound: 'SUPPORT_THREAD_NOT_FOUND',
  AttachmentNotFound: 'SUPPORT_ATTACHMENT_NOT_FOUND',
  UserNotFound: 'SUPPORT_USER_NOT_FOUND',
  UserDeactivated: 'SUPPORT_USER_DEACTIVATED',
} as const;
