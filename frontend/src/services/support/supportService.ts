import { backendFetch } from "@/lib/api/backendClient";
import type { ChatMessage, Conversation } from "@/types/messages/messageTypes";

/** The id the pinned conversation with CCAE is addressed by in the page. */
export const SUPPORT_CONVERSATION_ID = "ccae-admin";
export const SUPPORT_SENDER_LABEL = "CCAE Admin";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const ALLOWED_TYPES = ATTACHMENT_ACCEPT.split(",");

/** One request for details, as the list returns it. */
export interface SupportThread {
  id: string;
  subject: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  unreadFromAdmin: number;
  actionRequired: boolean;
  lastMessage: string;
  lastSentAt: string | null;
}

interface SupportMessageRow {
  id: string;
  sender: "admin" | "user";
  content: string;
  sentAt: string;
  attachment: { id: string; filename: string; mimeType: string; sizeBytes: number } | null;
}

interface SupportThreadDetail {
  id: string;
  subject: string;
  status: "open" | "closed";
  messages: SupportMessageRow[];
}

/** Where an attached file is served, through the app's own server route. */
export function attachmentHref(attachmentId: string): string {
  return `/api/backend/support/attachments/${encodeURIComponent(attachmentId)}`;
}

/**
 * Why a file cannot be sent, or null if it can. The same rules the API
 * applies, checked first so the user is told at once; the API still checks
 * the file's real contents.
 */
export function checkAttachment(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Attach a JPEG, PNG, WebP or PDF.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "That file is too large. The limit is 5MB.";
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatListTime(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toChatMessage(thread: Pick<SupportThreadDetail, "id" | "subject" | "status">, row: SupportMessageRow): ChatMessage {
  const fromAdmin = row.sender === "admin";
  return {
    id: `support-${row.id}`,
    conversationId: SUPPORT_CONVERSATION_ID,
    // The page puts a message on the right when this is the empty placeholder.
    senderId: fromAdmin ? SUPPORT_CONVERSATION_ID : "",
    text: row.content,
    sentAt: row.sentAt,
    senderLabel: fromAdmin ? SUPPORT_SENDER_LABEL : undefined,
    requestId: thread.id,
    requestSubject: thread.subject,
    requestStatus: thread.status,
    attachment: row.attachment ? { ...row.attachment, href: attachmentHref(row.attachment.id) } : undefined,
  };
}

/** The user's requests from CCAE, most recent activity first. Empty if there are none. */
export async function getSupportThreads(): Promise<SupportThread[]> {
  return backendFetch<SupportThread[]>("/support/threads");
}

/**
 * The pinned conversation with CCAE, or null when there are no requests. It
 * asks for action while any request is open and waiting on the user.
 */
export function toSupportConversation(threads: SupportThread[]): Conversation | null {
  if (threads.length === 0) return null;
  const latest = threads[0];
  return {
    id: SUPPORT_CONVERSATION_ID,
    participant: {
      id: SUPPORT_CONVERSATION_ID,
      fullName: SUPPORT_SENDER_LABEL,
      roleLabel: "Administrator",
      organisation: "Curtin University",
      online: true,
    },
    lastMessage: latest.lastMessage || "Attachment sent",
    lastMessageTime: formatListTime(latest.lastSentAt),
    sharedFiles: [],
    kind: "support",
    actionRequired: threads.some((thread) => thread.actionRequired),
  };
}

/** Every message across the user's requests, oldest request first. */
export async function getSupportMessages(threads: SupportThread[]): Promise<ChatMessage[]> {
  const details = await Promise.all(
    [...threads].reverse().map((thread) => backendFetch<SupportThreadDetail>(`/support/threads/${encodeURIComponent(thread.id)}`)),
  );
  return details.flatMap((detail) => detail.messages.map((row) => toChatMessage(detail, row)));
}

/** Tells CCAE the user has opened what it sent. Only threads with something unread are touched. */
export async function markSupportRead(threads: SupportThread[]): Promise<void> {
  await Promise.all(
    threads
      .filter((thread) => thread.unreadFromAdmin > 0)
      .map((thread) => backendFetch(`/support/threads/${encodeURIComponent(thread.id)}/read`, { method: "PATCH" })),
  );
}

/**
 * Replies to an open request with text, one file, or both. Sent as form data;
 * the content type is left for the browser to set, since it carries the
 * boundary that separates the parts.
 */
export async function sendSupportMessage(thread: SupportThread, text: string, file: File | null): Promise<ChatMessage> {
  const body = new FormData();
  if (text.trim()) body.append("content", text.trim());
  if (file) body.append("attachment", file);
  const row = await backendFetch<SupportMessageRow>(`/support/threads/${encodeURIComponent(thread.id)}/messages`, {
    method: "POST",
    body,
  });
  return toChatMessage(thread, row);
}
