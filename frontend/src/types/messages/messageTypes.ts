/** A file attached to a message, served by the API to its owner and to CCAE. */
export interface MessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  href: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  sentAt: string;
  /** Names the sender above the bubble, for messages from CCAE. */
  senderLabel?: string;
  /** The request a message belongs to, so the thread can show where each starts. */
  requestId?: string;
  requestSubject?: string;
  requestStatus?: "open" | "closed";
  attachment?: MessageAttachment;
}

export interface SharedFile {
  id: string;
  name: string;
  size: string;
  sentLabel: string;
}

export interface MatchedUnitSummary {
  location: string;
  format: string;
  duration: string;
  semester: string;
}

export interface ConversationParticipant {
  id: string;
  fullName: string;
  roleLabel: string;
  organisation: string;
  photoPreview?: string;
  online: boolean;
}

export interface ConversationSeed {
  participant: ConversationParticipant;
  matchedUnit?: MatchedUnitSummary;
}

export interface Conversation {
  id: string;
  participant: ConversationParticipant;
  lastMessage: string;
  lastMessageTime: string;
  matchedUnit?: MatchedUnitSummary;
  sharedFiles: SharedFile[];
  /** "support" for the pinned conversation with CCAE; absent for a match. */
  kind?: "support";
  /** True while CCAE is waiting on the user to answer a request. */
  actionRequired?: boolean;
}
