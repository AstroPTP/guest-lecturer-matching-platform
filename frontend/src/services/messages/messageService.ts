import type { ChatMessage, Conversation, ConversationSeed } from "@/types/messages/messageTypes";

import type { UserRole } from "@/types/shared/userRole";

// need to connect

const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export async function getConversations(_userType: UserRole): Promise<Conversation[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getMessages(_conversationId: string): Promise<ChatMessage[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function ensureConversations(_userType: UserRole, _currentUserId: string, _seeds: ConversationSeed[]): Promise<Conversation[]> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function sendMessage(_userType: UserRole, _currentUserId: string, _conversationId: string, _text: string): Promise<ChatMessage> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function deleteConversation(_conversationId: string): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
