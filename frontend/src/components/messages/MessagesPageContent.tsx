"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import callIcon from "@/assets/call.png";
import attachIcon from "@/assets/attach.png";
import closeIcon from "@/assets/close.png";
import deleteIcon from "@/assets/delete.png";
import infoIcon from "@/assets/info.png";
import reportIcon from "@/assets/report.png";
import searchIcon from "@/assets/search.png";
import sendIcon from "@/assets/send.png";
import videoIcon from "@/assets/video.png";

import type { ChatMessage, Conversation, ConversationParticipant, ConversationSeed } from "@/types/messages/messageTypes";

import type { UserRole } from "@/types/shared/userRole";

import { deleteConversation, ensureConversations, getConversations, getMessages, sendMessage } from "@/services/messages/messageService";

import { unmatchUsers } from "@/services/discovery/matchService";

import { reportUser } from "@/services/reports/reportService";
import { getInitials } from "@/utils/displayFormatters";


const CURRENT_USER_PLACEHOLDER_ID = "";

interface MessagesPageContentProps {
  userType: UserRole;

  conversationSeeds: ConversationSeed[];

  participantProfileHref: string;
}

export default function MessagesPageContent({ userType, conversationSeeds, participantProfileHref }: MessagesPageContentProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [messageText, setMessageText] = useState("");

  const [search, setSearch] = useState("");

  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      setErrorMessage(null);

      try {
        const nextConversations = await ensureConversations(userType, conversationSeeds);

        if (cancelled) {
          return;
        }

        setConversations(nextConversations);

        setSelectedConversation((currentConversation) => {
          const retainedConversation = currentConversation
            ? nextConversations.find((conversation) => conversation.id === currentConversation.id)
            : undefined;
          const nextSelectedConversation = retainedConversation ?? nextConversations[0] ?? null;

          void loadMessages(nextSelectedConversation);

          return nextSelectedConversation;
        });
      } catch (error) {
        console.error("Unable to load messages:", error);

        if (!cancelled) {
          setErrorMessage("Unable to load data. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    async function loadMessages(conversation: Conversation | null) {
      try {
        const nextMessages = conversation ? await getMessages(conversation.id) : [];

        if (!cancelled) {
          setMessages(nextMessages);
        }
      } catch (error) {
        console.error("Unable to load conversation messages:", error);

        if (!cancelled) {
          setErrorMessage("Unable to load data. Please try again.");
        }
      }
    }

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, [userType, conversationSeeds]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Loading messages...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-center text-red-700">{errorMessage}</p>
      </div>
    );
  }

  const filteredConversations = conversations.filter((conversation) => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return true;
    }

    return conversation.participant.fullName.toLowerCase().includes(searchText);
  });

  async function selectConversation(conversation: Conversation) {
    setActionError(null);
    setSelectedConversation(conversation);

    try {
      setMessages(await getMessages(conversation.id));
    } catch {
      setActionError("This isn't connected to a backend yet, so messages couldn't be loaded.");
      return;
    }

    setShowInfoPanel(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation || !messageText.trim()) {
      return;
    }

    setActionError(null);

    try {
      const newMessage = await sendMessage(userType, selectedConversation.id, messageText);

      setMessages((currentMessages) => [...currentMessages, newMessage]);

      setMessageText("");

      const updatedConversations = await getConversations(userType);

      setConversations(updatedConversations);

      setSelectedConversation(updatedConversations.find((conversation) => conversation.id === selectedConversation.id) ?? selectedConversation);
    } catch {
      setActionError("This isn't connected to a backend yet, so your message couldn't be sent.");
    }
  }

  async function handleReport(conversation: Conversation, reason: string) {
    setActionError(null);

    try {
      await reportUser({
        reportedUserId: conversation.participant.id,
        conversationId: conversation.id,
        reason,
      });
    } catch {
      setActionError("This isn't connected to a backend yet, so your report couldn't be submitted.");
      return;
    }

    window.alert("Report submitted. Thank you for helping keep the community safe.");
  }

  async function handleUnmatch(conversation: Conversation) {
    setActionError(null);

    try {
      await unmatchUsers(conversation.participant.id);
      await deleteConversation(conversation.id);
    } catch {
      setActionError("This isn't connected to a backend yet, so that action couldn't be saved.");
      return;
    }

    const remainingConversations = conversations.filter((item) => item.id !== conversation.id);

    const nextConversation = remainingConversations[0] ?? null;

    setConversations(remainingConversations);
    setSelectedConversation(nextConversation);

    try {
      setMessages(nextConversation ? await getMessages(nextConversation.id) : []);
    } catch {
      setMessages([]);
    }

    setShowInfoPanel(false);
  }

  return (
    <div className="-m-8 flex h-[calc(100vh-5rem)] overflow-hidden bg-white">
      <ConversationList
        conversations={filteredConversations}
        selectedConversationId={selectedConversation?.id}
        search={search}
        setSearch={setSearch}
        onSelect={selectConversation}
      />

      <div className="min-w-0 flex-1">
        {actionError && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-700" role="alert">
            {actionError}
          </div>
        )}

        {selectedConversation ? (
          <ChatThread
            conversation={selectedConversation}
            messages={messages}
            messageText={messageText}
            setMessageText={setMessageText}
            onSubmit={handleSubmit}
            onShowInfo={() => setShowInfoPanel(true)}
          />
        ) : (
          <EmptyChatState />
        )}
      </div>

      {showInfoPanel && selectedConversation && (
        <ChatInfoPanel
          conversation={selectedConversation}
          participantProfileHref={participantProfileHref}
          onClose={() => setShowInfoPanel(false)}
          onReport={(reason) => handleReport(selectedConversation, reason)}
          onUnmatch={() => handleUnmatch(selectedConversation)}
        />
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  selectedConversationId,
  search,
  setSearch,
  onSelect,
}: {
  conversations: Conversation[];

  selectedConversationId?: string;

  search: string;

  setSearch: (value: string) => void;

  onSelect: (conversation: Conversation) => void;
}) {
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="border-b border-gray-100 p-5">
        <h2 className="text-xl font-bold text-[#2d2d2d]">Recent</h2>

        <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-3">
          <Image src={searchIcon} alt="" width={17} height={17} />

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations..."
            className="w-full border-0 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-6 text-sm leading-6 text-gray-500">Your matched conversations will appear here.</div>
        ) : (
          conversations.map((conversation) => {
            const selected = conversation.id === selectedConversationId;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                className={
                  "flex w-full items-start gap-3 border-l-4 px-4 py-4 text-left transition " +
                  (selected ? "border-[#156874] bg-gray-100" : "border-transparent hover:bg-gray-50")
                }
              >
                <ProfilePhoto participant={conversation.participant} size="medium" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate font-bold text-[#2d2d2d]">{conversation.participant.fullName}</h3>

                    <span className="shrink-0 text-xs text-gray-500">{conversation.lastMessageTime}</span>
                  </div>

                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">{conversation.lastMessage}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function ChatThread({
  conversation,
  messages,
  messageText,
  setMessageText,
  onSubmit,
  onShowInfo,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  messageText: string;

  setMessageText: (value: string) => void;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;

  onShowInfo: () => void;
}) {
  return (
    <section className="flex h-full min-w-0 flex-col bg-[#fafafa]">
      <header className="flex h-24 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-8">
        <div className="flex items-center gap-4">
          <ProfilePhoto participant={conversation.participant} size="large" />

          <div>
            <h2 className="text-xl font-bold text-[#2d2d2d]">{conversation.participant.fullName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <HeaderButton label="Call">
            <Image src={callIcon} alt="" width={22} height={22} />
          </HeaderButton>

          <HeaderButton label="Video call">
            <Image src={videoIcon} alt="" width={22} height={22} />
          </HeaderButton>

          <button
            type="button"
            aria-label="Conversation information"
            onClick={onShowInfo}
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100 hover:text-black"
          >
            <Image src={infoIcon} alt="" width={22} height={22} />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-8 py-8">
        <div className="flex justify-center">
          <span className="rounded-full bg-gray-100 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Today</span>
        </div>

        {messages.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
            Start the conversation with {conversation.participant.fullName}.
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} participant={conversation.participant} />)
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-gray-100 bg-white p-6">
        <div className="flex items-end gap-3 rounded-xl bg-gray-100 p-2">
          <button
            type="button"
            aria-label="Attach a file"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-gray-600 hover:bg-white"
          >
            <Image src={attachIcon} alt="" width={22} height={22} />
          </button>

          <textarea
            rows={1}
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Type a message..."
            className="min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-3 outline-none"
          />

          <button
            type="submit"
            aria-label="Send message"
            disabled={!messageText.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#2d2d2d] text-xl text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Image src={sendIcon} alt="" width={22} height={22} className="invert" />
          </button>
        </div>

        <p className="mt-2 px-2 text-xs text-gray-500">Press the send button to send your message.</p>
      </form>
    </section>
  );
}

// TODO(AUTH): "Mine vs theirs" bubble alignment needs the signed-in user's id
// once auth exists. Until then every message renders on the "their" side.
function MessageBubble({
  message,
  participant,
}: {
  message: ChatMessage;

  participant: ConversationParticipant;
}) {
  const isCurrentUser = message.senderId === CURRENT_USER_PLACEHOLDER_ID;

  return (
    <div className={"flex max-w-3xl items-start gap-4 " + (isCurrentUser ? "ml-auto justify-end" : "")}>
      {!isCurrentUser && <ProfilePhoto participant={participant} size="small" />}

      <div className={isCurrentUser ? "text-right" : ""}>
        <div
          className={
            "inline-block max-w-2xl rounded-2xl px-5 py-4 text-left text-[15px] leading-7 shadow-sm " +
            (isCurrentUser ? "rounded-tr-sm bg-[#2d2d2d] text-white" : "rounded-tl-sm bg-gray-100 text-[#2d2d2d]")
          }
        >
          {message.text}
        </div>

        <span className="mt-1 block px-1 text-xs text-gray-500">{formatMessageTime(message.sentAt)}</span>
      </div>
    </div>
  );
}

function ChatInfoPanel({
  conversation,
  participantProfileHref,
  onClose,
  onReport,
  onUnmatch,
}: {
  conversation: Conversation;
  participantProfileHref: string;
  onClose: () => void;
  onReport: (reason: string) => void;
  onUnmatch: () => void;
}) {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const { participant, sharedFiles } = conversation;

  return (
    <aside className="flex w-[390px] shrink-0 flex-col overflow-y-auto border-l border-gray-100 bg-white">
      <div className="flex justify-end p-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close information panel"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xl hover:bg-gray-200"
        >
          <Image src={closeIcon} alt="" width={16} height={16} aria-hidden="true" />
        </button>
      </div>

      <div className="px-8 pb-8">
        <div className="flex flex-col items-center text-center">
          <ProfilePhoto participant={participant} size="profile" />

          <h2 className="mt-6 text-3xl font-bold text-[#2d2d2d]">{participant.fullName}</h2>

          <p className="mt-2 text-gray-600">
            {participant.roleLabel}

            {participant.organisation ? " - " + participant.organisation : ""}
          </p>

          <a href={participantProfileHref} className="mt-6 rounded-xl bg-gray-200 px-6 py-3 text-sm font-semibold text-[#2d2d2d] hover:bg-gray-300">
            View full profile
          </a>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <SectionLabel>Shared Files</SectionLabel>

            <button type="button" className="text-xl text-gray-600 hover:text-black">
              +
            </button>
          </div>

          {sharedFiles.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No files have been shared yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {sharedFiles.map((file) => (
                <div key={file.id} className="flex items-center gap-4 rounded-xl p-3 hover:bg-gray-100">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200">PDF</div>

                  <div>
                    <p className="text-sm font-medium text-[#2d2d2d]">{file.name}</p>

                    <p className="mt-1 text-xs text-gray-500">
                      {file.size}
                      {" • "}
                      {file.sentLabel}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 border-t border-gray-100 pt-8">
          <SectionLabel>Safety &amp; Privacy</SectionLabel>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setShowReportForm(true)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm font-medium text-[#2d2d2d] hover:bg-gray-100"
            >
              <Image src={reportIcon} alt="" width={20} height={20} />
              <span>Report this user</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirmation(true)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Image
                src={deleteIcon}
                alt=""
                width={20}
                height={20}
                className="[filter:brightness(0)_saturate(100%)_invert(18%)_sepia(94%)_saturate(3533%)_hue-rotate(353deg)_brightness(93%)_contrast(86%)]"
              />
              <span>Unmatch &amp; delete chat</span>
            </button>
          </div>
        </section>
      </div>

      {showDeleteConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            aria-describedby="delete-chat-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 id="delete-chat-title" className="text-xl font-bold text-[#2d2d2d]">
              Delete this chat?
            </h3>

            <p id="delete-chat-description" className="mt-3 leading-6 text-gray-600">
              Do you want to unmatch with <span className="font-semibold text-[#2d2d2d]">{participant.fullName}</span> and permanently delete this conversation?
              This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(false)}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button type="button" onClick={onUnmatch} className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-user-title"
            aria-describedby="report-user-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 id="report-user-title" className="text-xl font-bold text-[#2d2d2d]">
              Report this user?
            </h3>

            <p id="report-user-description" className="mt-3 leading-6 text-gray-600">
              Tell us why you are reporting <span className="font-semibold text-[#2d2d2d]">{participant.fullName}</span>. Your report will be saved for review.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-[#2d2d2d]">Reason</span>
              <textarea
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Describe what happened..."
                autoFocus
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#2d2d2d]"
              />
              <span className="mt-1 block text-right text-xs text-gray-400">{reportReason.length}/500</span>
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReportForm(false);
                  setReportReason("");
                }}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!reportReason.trim()}
                onClick={() => {
                  onReport(reportReason.trim());
                  setShowReportForm(false);
                  setReportReason("");
                }}
                className="rounded-full bg-[#2d2d2d] px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit report
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function ProfilePhoto({
  participant,
  size,
}: {
  participant: ConversationParticipant;

  size: "small" | "medium" | "large" | "profile";
}) {
  const sizeClass = {
    small: "h-9 w-9 text-sm",
    medium: "h-12 w-12 text-base",
    large: "h-12 w-12 text-base",
    profile: "h-28 w-28 text-3xl",
  }[size];

  if (participant.photoPreview) {
    return (
      <div className={"relative shrink-0 " + sizeClass}>
        <Image src={participant.photoPreview} alt={participant.fullName} fill unoptimized className="rounded-full object-cover ring-1 ring-orange-300" />
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div className={"flex " + sizeClass + " items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600 ring-1 ring-orange-300"}>
        {getInitials(participant.fullName)}
      </div>
    </div>
  );
}

function HeaderButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100 hover:text-black"
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-gray-500">{children}</h3>;
}

function EmptyChatState() {
  return (
    <div className="flex h-full items-center justify-center bg-[#fafafa] px-8 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-200">
          <Image src={infoIcon} alt="" width={28} height={28} />
        </div>

        <h2 className="mt-5 text-2xl font-bold text-[#2d2d2d]">Select a conversation</h2>

        <p className="mt-2 text-gray-500">Choose a matched profile to start messaging.</p>
      </div>
    </div>
  );
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
