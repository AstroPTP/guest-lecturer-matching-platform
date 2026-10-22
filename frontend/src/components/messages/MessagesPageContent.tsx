"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import attachIcon from "@/assets/attach.png";
import closeIcon from "@/assets/close.png";
import deleteIcon from "@/assets/delete.png";
import infoIcon from "@/assets/info.png";
import reportIcon from "@/assets/report.png";
import searchIcon from "@/assets/search.png";
import sendIcon from "@/assets/send.png";
import type { ChatMessage, Conversation, ConversationParticipant, ConversationSeed } from "@/types/messages/messageTypes";
import type { UserRole } from "@/types/shared/userRole";
import { ServiceError } from "@/lib/serviceErrors";
import CreateEventModal from "@/components/events/CreateEventModal";
import SessionCard from "./SessionCard";
import { acceptEvent, createEvent, declineEvent, getEventPrefill, getEventsForCoordinator, getEventsForGuestLecturer } from "@/services/events/eventService";
import type { AcademicEvent, CreateAcademicEventData, EventPrefill } from "@/types/events/eventTypes";
import { deleteConversation, ensureConversations, getConversations, getMessages, sendMessage } from "@/services/messages/messageService";
import { unmatchUsers } from "@/services/discovery/matchService";
import { reportUser } from "@/services/reports/reportService";
import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  formatFileSize,
  getSupportMessages,
  getSupportThreads,
  markSupportRead,
  sendSupportMessage,
  toSupportConversation,
  type SupportThread,
} from "@/services/support/supportService";
import { getInitials } from "@/utils/displayFormatters";
const CURRENT_USER_PLACEHOLDER_ID = "";

interface MessagesPageContentProps {
  userType: UserRole;
  conversationSeeds: ConversationSeed[];
  participantProfileHref: string;
}

/**
 * What to tell the user when a call fails. A service that is not connected to
 * the API keeps its own wording; otherwise the API's message is shown, since
 * it says why in terms the user can act on (for example that a conversation is
 * paused, or that a request is closed).
 */
function errorText(error: unknown, notIntegratedText: string): string {
  if (error instanceof ServiceError && error.code === "API_NOT_INTEGRATED") {
    return notIntegratedText;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong, please try again.";
}

/**
 * The user's requests from CCAE. A failure here must not take the matched
 * conversations down with it, so it is logged and treated as having none.
 */
async function loadSupportThreads(): Promise<SupportThread[]> {
  try {
    return await getSupportThreads();
  } catch (error) {
    console.error("Unable to load requests from CCAE:", error);
    return [];
  }
}

/** The list with the conversation with CCAE pinned first, or without it when there is none. */
function withSupport(conversations: Conversation[], support: Conversation | null): Conversation[] {
  const others = conversations.filter((conversation) => conversation.kind !== "support");
  return support ? [support, ...others] : others;
}

/**
 * The caller's sessions with their matches. A failure here must not take the
 * conversations down with it, so it is logged and treated as having none.
 */
async function loadSessions(userType: UserRole): Promise<AcademicEvent[]> {
  try {
    return userType === "unitCoordinator" ? await getEventsForCoordinator() : await getEventsForGuestLecturer();
  } catch (error) {
    console.error("Unable to load sessions:", error);
    return [];
  }
}

/** The sessions of one match: the ones whose other person is this conversation's participant. */
function sessionsWith(events: AcademicEvent[], userType: UserRole, conversation: Conversation): AcademicEvent[] {
  if (conversation.kind === "support") {
    return [];
  }
  return events.filter((event) => (userType === "unitCoordinator" ? event.guestLecturerId : event.coordinatorId) === conversation.id);
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
  // Unmatching takes several seconds; this stops a second click sending it again.
  const [isUnmatching, setIsUnmatching] = useState(false);
  // Requests for details from CCAE, and the one file chosen for the next reply.
  const [supportThreads, setSupportThreads] = useState<SupportThread[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // Sessions between the caller and their matches, shown as cards in the thread.
  const [sessions, setSessions] = useState<AcademicEvent[]>([]);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  // The coordinator's session form, open once the starting values have loaded.
  const [scheduling, setScheduling] = useState<EventPrefill | null>(null);
  const [isPreparingSession, setIsPreparingSession] = useState(false);
  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      setErrorMessage(null);
      try {
        // With no matches there is nothing to ask the API for, and an account
        // with no profile yet is refused if it does.
        const [matchConversations, threads, nextSessions] = await Promise.all([
          conversationSeeds.length === 0 ? Promise.resolve([]) : ensureConversations(userType, conversationSeeds),
          loadSupportThreads(),
          conversationSeeds.length === 0 ? Promise.resolve([]) : loadSessions(userType),
        ]);
        if (cancelled) {
          return;
        }
        setSessions(nextSessions);
        const support = toSupportConversation(threads);
        const nextConversations = withSupport(matchConversations, support);
        setSupportThreads(threads);
        setConversations(nextConversations);
        setSelectedConversation((currentConversation) => {
          const retainedConversation = currentConversation ? nextConversations.find((conversation) => conversation.id === currentConversation.id) : undefined;
          // CCAE is pinned first, but only opens by itself when it is waiting
          // for an answer; otherwise the first match is what the user came for.
          const nextSelectedConversation =
            retainedConversation ?? (support?.actionRequired ? support : (matchConversations[0] ?? support ?? null));
          void loadMessages(nextSelectedConversation, threads);
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
    async function loadMessages(conversation: Conversation | null, threads: SupportThread[]) {
      try {
        const nextMessages = !conversation
          ? []
          : conversation.kind === "support"
            ? await getSupportMessages(threads)
            : await getMessages(conversation.id);
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

  // Looking at the conversation with CCAE counts as reading what it sent. The
  // list is fetched again afterwards so the unread figure is the server's.
  const viewingSupport = selectedConversation?.kind === "support";
  const unreadFromAdmin = supportThreads.reduce((total, thread) => total + thread.unreadFromAdmin, 0);
  useEffect(() => {
    if (!viewingSupport || unreadFromAdmin === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await markSupportRead(supportThreads);
        const fresh = await getSupportThreads();
        if (cancelled) {
          return;
        }
        const support = toSupportConversation(fresh);
        setSupportThreads(fresh);
        setConversations((current) => withSupport(current, support));
        setSelectedConversation((current) => (current?.kind === "support" && support ? support : current));
      } catch (error) {
        console.error("Unable to mark requests from CCAE as read:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingSupport, unreadFromAdmin, supportThreads]);

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

  // CCAE can only be answered on a request that is still open.
  const replyThread = supportThreads.find((thread) => thread.status === "open");

  async function selectConversation(conversation: Conversation) {
    setActionError(null);
    setSelectedConversation(conversation);
    setAttachment(null);
    setAttachmentError(null);
    try {
      if (conversation.kind === "support") {
        const threads = await getSupportThreads();
        setSupportThreads(threads);
        setMessages(await getSupportMessages(threads));
      } else {
        // The other person may have answered a session since the page loaded.
        const [nextMessages, nextSessions] = await Promise.all([getMessages(conversation.id), loadSessions(userType)]);
        setMessages(nextMessages);
        setSessions(nextSessions);
      }
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so messages couldn't be loaded."));
      return;
    }
    setShowInfoPanel(false);
  }

  /** Fetches the requests again and updates the pinned conversation to match. */
  async function refreshSupport(): Promise<SupportThread[]> {
    const fresh = await getSupportThreads();
    const support = toSupportConversation(fresh);
    setSupportThreads(fresh);
    setConversations((current) => withSupport(current, support));
    setSelectedConversation((current) => (current?.kind === "support" && support ? support : current));
    return fresh;
  }

  async function handleSupportSubmit() {
    if (!replyThread || isSending || (!messageText.trim() && !attachment)) {
      return;
    }
    setActionError(null);
    setIsSending(true);
    try {
      const newMessage = await sendSupportMessage(replyThread, messageText, attachment);
      setMessages((currentMessages) => [...currentMessages, newMessage]);
      setMessageText("");
      setAttachment(null);
      setAttachmentError(null);
      await refreshSupport();
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so your message couldn't be sent."));
      // The request may have been closed since the page loaded; show it as it is now.
      try {
        setMessages(await getSupportMessages(await refreshSupport()));
      } catch {
        // The error above is what the user needs to see.
      }
    } finally {
      setIsSending(false);
    }
  }

  function chooseAttachment(file: File) {
    const problem = checkAttachment(file);
    setAttachment(problem ? null : file);
    setAttachmentError(problem);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedConversation?.kind === "support") {
      await handleSupportSubmit();
      return;
    }
    if (!selectedConversation || !messageText.trim()) {
      return;
    }
    setActionError(null);
    try {
      const newMessage = await sendMessage(userType, selectedConversation.id, messageText);
      setMessages((currentMessages) => [...currentMessages, newMessage]);
      setMessageText("");
      const updatedConversations = await getConversations(userType);
      setConversations((current) => withSupport(updatedConversations, current.find((conversation) => conversation.kind === "support") ?? null));
      setSelectedConversation(updatedConversations.find((conversation) => conversation.id === selectedConversation.id) ?? selectedConversation);
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so your message couldn't be sent."));
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
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so your report couldn't be submitted."));
      return;
    }

    window.alert("Report submitted. Thank you for helping keep the community safe.");
  }

  async function handleUnmatch(conversation: Conversation) {
    if (isUnmatching) {
      return;
    }
    setActionError(null);
    setIsUnmatching(true);
    try {
      await unmatchUsers(conversation.participant.id);
      await deleteConversation(conversation.id);
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so that action couldn't be saved."));
      return;
    } finally {
      setIsUnmatching(false);
    }
    const remainingConversations = conversations.filter((item) => item.id !== conversation.id);
    const nextConversation = remainingConversations[0] ?? null;
    setConversations(remainingConversations);
    setSelectedConversation(nextConversation);
    try {
      setMessages(nextConversation ? await (nextConversation.kind === "support" ? getSupportMessages(supportThreads) : getMessages(nextConversation.id)) : []);
    } catch {
      setMessages([]);
    }
    setShowInfoPanel(false);
  }

  /** Opens the session form for the open chat, filled in from the two profiles. */
  async function handleSchedule(conversation: Conversation) {
    if (isPreparingSession) {
      return;
    }
    setActionError(null);
    setIsPreparingSession(true);
    try {
      setScheduling(await getEventPrefill(conversation.id));
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so the session form couldn't be opened."));
    } finally {
      setIsPreparingSession(false);
    }
  }

  /** Sends the invitation; resolves to the reason it failed, or null once it is sent. */
  async function handleCreateSession(data: CreateAcademicEventData): Promise<string | null> {
    try {
      await createEvent(data);
    } catch (error) {
      return errorText(error, "The invitation couldn't be sent. Please try again.");
    }
    setScheduling(null);
    setSessions(await loadSessions(userType));
    return null;
  }

  /** Answers an invitation from its card. Each takes a moment, so a second click is ignored. */
  async function respondToSession(eventId: string, respond: (id: string) => Promise<AcademicEvent>) {
    if (busySessionId) {
      return;
    }
    setActionError(null);
    setBusySessionId(eventId);
    try {
      const updated = await respond(eventId);
      setSessions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setActionError(errorText(error, "This isn't connected to a backend yet, so your answer couldn't be saved."));
      // The other person may have changed the session since this page loaded.
      setSessions(await loadSessions(userType));
    } finally {
      setBusySessionId(null);
    }
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
            sessions={sessionsWith(sessions, userType, selectedConversation)}
            viewer={userType}
            busySessionId={busySessionId}
            onAcceptSession={(eventId) => void respondToSession(eventId, acceptEvent)}
            onDeclineSession={(eventId) => void respondToSession(eventId, declineEvent)}
            onSchedule={userType === "unitCoordinator" && selectedConversation.kind !== "support" ? () => void handleSchedule(selectedConversation) : undefined}
            isPreparingSession={isPreparingSession}
            canReply={selectedConversation.kind !== "support" || Boolean(replyThread)}
            attachment={attachment}
            attachmentError={attachmentError}
            onChooseAttachment={chooseAttachment}
            onRemoveAttachment={() => {
              setAttachment(null);
              setAttachmentError(null);
            }}
            isSending={isSending}
          />
        ) : (
          <EmptyChatState />
        )}
      </div>

      {showInfoPanel && selectedConversation && selectedConversation.kind !== "support" && (
        <ChatInfoPanel
          conversation={selectedConversation}
          participantProfileHref={participantProfileHref}
          onClose={() => setShowInfoPanel(false)}
          onReport={(reason) => handleReport(selectedConversation, reason)}
          onUnmatch={() => handleUnmatch(selectedConversation)}
          isUnmatching={isUnmatching}
        />
      )}

      {scheduling && (
        <CreateEventModal coordinatorName={scheduling.coordinatorName} prefill={scheduling} onClose={() => setScheduling(null)} onCreate={handleCreateSession} />
      )}
    </div>
  );
}

function ConversationList({conversations,selectedConversationId, search,setSearch,onSelect}: {
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
            const isSupport = conversation.kind === "support";
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                className={
                  "flex w-full items-start gap-3 border-l-4 px-4 py-4 text-left transition " +
                  (selected ? "border-[#156874] bg-gray-100" : isSupport && conversation.actionRequired ? "border-amber-500 bg-amber-50 hover:bg-amber-100" : "border-transparent hover:bg-gray-50")
                }
              >
                <ProfilePhoto participant={conversation.participant} size="medium" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate font-bold text-[#2d2d2d]">{conversation.participant.fullName}</h3>
                    <span className="shrink-0 text-xs text-gray-500">{conversation.lastMessageTime}</span>
                  </div>
                  {isSupport && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-gray-600">Pinned</span>
                      {conversation.actionRequired && (
                        <span className="rounded-full border border-amber-700 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Action required</span>
                      )}
                    </div>
                  )}

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
  sessions,
  viewer,
  busySessionId,
  onAcceptSession,
  onDeclineSession,
  onSchedule,
  isPreparingSession,
  canReply,
  attachment,
  attachmentError,
  onChooseAttachment,
  onRemoveAttachment,
  isSending,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  messageText: string;
  setMessageText: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onShowInfo: () => void;
  /** The sessions with this person, shown as cards in the thread. */
  sessions: AcademicEvent[];
  viewer: UserRole;
  busySessionId: string | null;
  onAcceptSession: (eventId: string) => void;
  onDeclineSession: (eventId: string) => void;
  /** Present for a coordinator in a matched chat; opens the session form. */
  onSchedule?: () => void;
  isPreparingSession: boolean;
  /** False for a closed request, which takes no further replies. */
  canReply: boolean;
  attachment: File | null;
  attachmentError: string | null;
  onChooseAttachment: (file: File) => void;
  onRemoveAttachment: () => void;
  isSending: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Newest at the bottom, in view. A request thread can run long enough that
  // the reply being waited for would otherwise be off screen.
  useEffect(() => {
    const list = scroller.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, conversation.id]);
  const isSupport = conversation.kind === "support";
  const canSend = canReply && !isSending && (Boolean(messageText.trim()) || (isSupport && attachment !== null));

  return (
    <section className="flex h-full min-w-0 flex-col bg-[#fafafa]">
      <header className="flex h-24 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-8">
        <div className="flex items-center gap-4">
          <ProfilePhoto participant={conversation.participant} size="large" />

          <div>
            <h2 className="text-xl font-bold text-[#2d2d2d]">{conversation.participant.fullName}</h2>
            {isSupport && conversation.actionRequired && (
              <span className="mt-1 inline-block rounded-full border border-amber-700 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Action required</span>
            )}
          </div>
        </div>

        {!isSupport && (
          <div className="flex items-center gap-3">
            {onSchedule && (
              <button
                type="button"
                onClick={onSchedule}
                disabled={isPreparingSession}
                className="rounded-xl bg-[#2d2d2d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPreparingSession ? "Opening..." : "Schedule a session"}
              </button>
            )}
            <button
              type="button"
              aria-label="Conversation information"
              onClick={onShowInfo}
              className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100 hover:text-black"
            >
              <Image src={infoIcon} alt="" width={22} height={22} />
            </button>
          </div>
        )}
      </header>

      <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto px-8 py-8">
        <div className="flex justify-center">
          <span className="rounded-full bg-gray-100 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-gray-600">Today</span>
        </div>

        {messages.length === 0 && sessions.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
            Start the conversation with {conversation.participant.fullName}.
          </div>
        ) : (
          threadItems(messages, sessions).map((item) =>
            item.kind === "session" ? (
              <SessionCard
                key={"session-" + item.event.id}
                event={item.event}
                viewer={viewer}
                isBusy={busySessionId === item.event.id}
                onAccept={onAcceptSession}
                onDecline={onDeclineSession}
              />
            ) : (
              <div key={item.message.id} className="space-y-6">
                {item.message.requestId && item.message.requestId !== item.previousRequestId && (
                  <div className="flex justify-center">
                    <span className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-semibold text-gray-700">
                      Request: {item.message.requestSubject} · {item.message.requestStatus === "closed" ? "Closed" : "Open"}
                    </span>
                  </div>
                )}
                <MessageBubble message={item.message} participant={conversation.participant} />
              </div>
            ),
          )
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-gray-100 bg-white p-6">
        {isSupport && attachment && (
          <div className="mb-3 flex">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-300 bg-gray-50 py-1 pl-3 pr-1 text-sm text-[#2d2d2d]">
              <span className="truncate">{attachment.name}</span>
              <span className="shrink-0 text-xs text-gray-600">({formatFileSize(attachment.size)})</span>
              <button
                type="button"
                onClick={onRemoveAttachment}
                aria-label={"Remove attached file " + attachment.name}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-gray-200"
              >
                <Image src={closeIcon} alt="" width={12} height={12} aria-hidden="true" />
              </button>
            </span>
          </div>
        )}
        {isSupport && attachmentError && (
          <p className="mb-3 text-sm font-medium text-red-700" role="alert">
            {attachmentError}
          </p>
        )}

        <div className="flex items-end gap-3 rounded-xl bg-gray-100 p-2">
          {isSupport && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Cleared so choosing the same file again still registers.
                  event.target.value = "";
                  if (file) {
                    onChooseAttachment(file);
                  }
                }}
              />
              <button
                type="button"
                aria-label="Attach a file"
                onClick={() => fileInput.current?.click()}
                disabled={!canReply || isSending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Image src={attachIcon} alt="" width={22} height={22} />
              </button>
            </>
          )}
          <textarea
            rows={1}
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder={canReply ? "Type a message..." : "This request is closed."}
            disabled={!canReply}
            maxLength={isSupport ? 2000 : undefined}
            aria-label="Message"
            className="min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-3 outline-none disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#2d2d2d] text-xl text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Image src={sendIcon} alt="" width={22} height={22} className="invert" />
          </button>
        </div>

        <p className="mt-2 px-2 text-xs text-gray-600">
          {isSupport
            ? canReply
              ? "You can attach one file (JPEG, PNG, WebP or PDF, up to 5MB). Only you and CCAE can see it."
              : "CCAE has closed this request, so it can no longer take a reply."
            : "Press the send button to send your message."}
        </p>
      </form>
    </section>
  );
}

function MessageBubble({ message, participant,}: {
  message: ChatMessage;
  participant: ConversationParticipant;
}) {
  const isCurrentUser = message.senderId === CURRENT_USER_PLACEHOLDER_ID;
  return (
    <div className={"flex max-w-3xl items-start gap-4 " + (isCurrentUser ? "ml-auto justify-end" : "")}>
      {!isCurrentUser && <ProfilePhoto participant={participant} size="small" />}
      <div className={isCurrentUser ? "text-right" : ""}>
        {!isCurrentUser && message.senderLabel && (
          <span className="mb-1 block px-1 text-xs font-bold text-[#2d2d2d]">{message.senderLabel}</span>
        )}
        <div
          className={
            "inline-block max-w-2xl rounded-2xl px-5 py-4 text-left text-[15px] leading-7 shadow-sm " +
            (isCurrentUser ? "rounded-tr-sm bg-[#2d2d2d] text-white" : "rounded-tl-sm bg-gray-100 text-[#2d2d2d]")
          }
        >
          {message.text && <span className="whitespace-pre-wrap break-words">{message.text}</span>}
          {message.attachment && (
            <a
              href={message.attachment.href}
              target="_blank"
              rel="noopener noreferrer"
              className={
                "flex items-center gap-2 text-sm font-semibold underline " +
                (message.text ? "mt-2 " : "") +
                (isCurrentUser ? "text-white" : "text-[#156874]")
              }
            >
              <Image
                src={attachIcon}
                alt=""
                width={16}
                height={16}
                aria-hidden="true"
                className={isCurrentUser ? "invert" : ""}
              />
              <span className="break-all">{message.attachment.filename}</span>
              <span className="shrink-0 font-normal no-underline">({formatFileSize(message.attachment.sizeBytes)})</span>
            </a>
          )}
        </div>
        <span className="mt-1 block px-1 text-xs text-gray-500">{formatMessageTime(message.sentAt)}</span>
      </div>
    </div>
  );
}

function ChatInfoPanel({conversation, participantProfileHref,onClose, onReport, onUnmatch, isUnmatching}: {
  conversation: Conversation;
  participantProfileHref: string;
  onClose: () => void;
  onReport: (reason: string) => void;
  onUnmatch: () => void;
  isUnmatching: boolean;
}) {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const { participant } = conversation;

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
              <button
                type="button"
                onClick={onUnmatch}
                disabled={isUnmatching}
                className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUnmatching ? "Deleting..." : "Delete"}
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

function ProfilePhoto({ participant, size}: {
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

type ThreadItem =
  | { kind: "message"; at: string; message: ChatMessage; previousRequestId?: string }
  | { kind: "session"; at: string; event: AcademicEvent };

/**
 * The messages and the sessions of a chat in the order they happened: a
 * session sits where its invitation was sent. Messages keep their own order,
 * and a message and a session at the same moment keep the message first.
 */
function threadItems(messages: ChatMessage[], sessions: AcademicEvent[]): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((message, index): ThreadItem => ({ kind: "message", at: message.sentAt, message, previousRequestId: messages[index - 1]?.requestId })),
    ...sessions.map((event): ThreadItem => ({ kind: "session", at: event.createdAt, event })),
  ];
  if (sessions.length === 0) {
    return items;
  }
  return items
    .map((item, position) => ({ item, position }))
    .sort((first, second) => new Date(first.item.at).getTime() - new Date(second.item.at).getTime() || first.position - second.position)
    .map(({ item }) => item);
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
