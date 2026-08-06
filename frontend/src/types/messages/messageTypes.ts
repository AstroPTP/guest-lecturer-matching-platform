export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  sentAt: string;
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
}
