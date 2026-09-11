import { notIntegrated } from "@/lib/serviceErrors";
import type { ChatMessage, Conversation, ConversationSeed } from "@/types/messages/messageTypes";
import type { UserRole } from "@/types/shared/userRole";



export async function getConversations(_userType: UserRole): Promise<Conversation[]> {
  return [];
}

export async function getMessages(_conversationId: string): Promise<ChatMessage[]> {
  return [];
}

export async function ensureConversations(_userType: UserRole, _seeds: ConversationSeed[]): Promise<Conversation[]> {
  return [];
}

export async function sendMessage(_userType: UserRole, _conversationId: string, _text: string): Promise<ChatMessage> {
  return notIntegrated();
}

export async function deleteConversation(_conversationId: string): Promise<void> {
  return notIntegrated();
}
