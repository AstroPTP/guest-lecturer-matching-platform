import type { ChatMessage, Conversation, ConversationSeed } from "@/types/messages/messageTypes";

import type { UserRole } from "@/types/shared/userRole";

// TODO(API): This module simulated conversations/messages in browser
// storage. Replace with the endpoints in BACKEND_HANDOFF.md:
//   getConversations   -> GET /api/conversations (cursor, limit)
//   getMessages        -> GET /api/conversations/:id/messages (cursor, limit)
//   sendMessage        -> POST /api/conversations/:id/messages (accept a
//                         client-generated idempotency id)
//   deleteConversation -> DELETE equivalent once defined by backend
// ensureConversations was a client-only seeding helper for the storage
// prototype; a real API should return existing conversations directly, with
// a conversation created lazily on first message instead. No
// conversation/message data may be persisted in the browser.

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
