import { backendFetch } from "@/lib/api/backendClient";
import type { ChatMessage, Conversation, ConversationSeed } from "@/types/messages/messageTypes";
import type { UserRole } from "@/types/shared/userRole";

// The page compares senderId against this to put the caller's messages on the
// right, the same empty placeholder it already uses.
const CURRENT_USER_PLACEHOLDER_ID = "";

/** A message as the API returns it. */
interface MessageRow {
  id: string;
  text: string;
  sentAt: string;
  fromMe: boolean;
}

/** The latest message with one matched person. */
interface ConversationSummaryRow {
  targetId: string;
  lastMessage: string;
  lastSentAt: string;
}

// The matched people the page last asked for, so a refresh after sending can
// rebuild the list without the page passing them again.
let currentSeeds: ConversationSeed[] = [];

function toChatMessage(conversationId: string, row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId,
    senderId: row.fromMe ? CURRENT_USER_PLACEHOLDER_ID : conversationId,
    text: row.text,
    sentAt: row.sentAt,
  };
}

function formatListTime(value: string): string {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/**
 * One conversation per matched person, addressed by their profile id, with the
 * latest message first. People with no messages yet still get a conversation
 * so the caller can start one.
 */
export async function getConversations(_userType: UserRole): Promise<Conversation[]> {
  const summaries = await backendFetch<ConversationSummaryRow[]>("/messages");

  const conversations = currentSeeds.map((seed) => {
    const summary = summaries.find((item) => item.targetId === seed.participant.id);
    return {
      id: seed.participant.id,
      participant: seed.participant,
      lastMessage: summary?.lastMessage ?? "Start the conversation",
      lastMessageTime: formatListTime(summary?.lastSentAt ?? ""),
      lastSentAt: summary?.lastSentAt ?? "",
      matchedUnit: seed.matchedUnit,
      sharedFiles: [],
    };
  });

  return conversations
    .sort((first, second) => second.lastSentAt.localeCompare(first.lastSentAt))
    .map(({ lastSentAt: _lastSentAt, ...conversation }) => conversation);
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await backendFetch<MessageRow[]>("/messages/" + encodeURIComponent(conversationId));
  return rows.map((row) => toChatMessage(conversationId, row));
}

export async function ensureConversations(userType: UserRole, seeds: ConversationSeed[]): Promise<Conversation[]> {
  currentSeeds = seeds;
  return getConversations(userType);
}

export async function sendMessage(_userType: UserRole, conversationId: string, text: string): Promise<ChatMessage> {
  const row = await backendFetch<MessageRow>("/messages", {
    method: "POST",
    body: JSON.stringify({ targetId: conversationId, content: text.trim() }),
  });
  return toChatMessage(conversationId, row);
}

/** Unmatching already removes the match, and its messages go with it. */
export async function deleteConversation(_conversationId: string): Promise<void> {}
