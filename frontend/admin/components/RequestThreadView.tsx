"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import arrowBackIcon from "@/assets/arrow_back.png";
import {
  getRequestThread,
  replyToRequest,
  requestAttachmentHref,
  setRequestStatus,
  type RequestThread,
} from "@/services/adminApi";
import { formatBytes, formatWhen, requestRoleLabel } from "@/lib/requestFormat";

const REPLY_LIMIT = 2000;

/**
 * One request for details: what was asked, what the user answered, and any
 * files they attached. An administrator can reply, and close the request once
 * it is settled, which stops the user adding to it.
 */
export function RequestThreadView({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState<RequestThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Bumped to fetch the request again after something changes it.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((current) => current + 1);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await getRequestThread(threadId);
        if (active) {
          setThread(loaded);
          setErrorMessage("");
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "The request could not be loaded.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [threadId, version]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = reply.trim();
    if (!content || isBusy) return;
    setIsBusy(true);
    setErrorMessage("");
    try {
      await replyToRequest(threadId, content);
      setReply("");
      reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Your reply could not be sent.");
    } finally {
      setIsBusy(false);
    }
  }

  async function changeStatus(status: "open" | "closed") {
    if (!thread || isBusy) return;
    if (
      status === "closed" &&
      !window.confirm(`Close this request? ${thread.user.name} will no longer be able to reply to it.`)
    ) {
      return;
    }
    setIsBusy(true);
    setErrorMessage("");
    try {
      await setRequestStatus(threadId, status);
      reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The status could not be changed.");
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) return <p className="control-empty">Loading the request…</p>;

  const backLink = (
    <Link className="back-link" href="/dashboard/requests">
      <Image alt="" aria-hidden="true" src={arrowBackIcon} />
      Back to requests
    </Link>
  );

  if (!thread) {
    return (
      <div className="profile-page">
        {backLink}
        <p className="profile-notice error" role="alert">
          {errorMessage || "No request with that identifier."}
        </p>
      </div>
    );
  }

  const isOpen = thread.status === "open";
  const profileHref = `/dashboard/users/${encodeURIComponent(
    `#${thread.user.role === "unit_coordinator" ? "UC" : "GL"}-${thread.user.id}`,
  )}`;

  return (
    <div className="request-page">
      {backLink}

      <header className="request-heading">
        <div>
          <h1>{thread.subject}</h1>
          <p>
            {thread.user.name} · {requestRoleLabel(thread.user.role)}
            {thread.user.email ? ` · ${thread.user.email}` : ""} · <Link href={profileHref}>Full profile</Link>
          </p>
        </div>
        <div className="request-heading-actions">
          <span className={`request-badge ${thread.status}`}>{isOpen ? "Open" : "Closed"}</span>
          <button
            className="secondary-action"
            disabled={isBusy}
            onClick={() => void changeStatus(isOpen ? "closed" : "open")}
            type="button"
          >
            {isOpen ? "Close request" : "Reopen request"}
          </button>
        </div>
      </header>

      {errorMessage ? (
        <p className="profile-notice error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <ol aria-label="Messages in this request" className="request-thread">
        {thread.messages.map((message) => (
          <li className={`request-message ${message.sender}`} key={message.id}>
            <header>
              <strong>{message.sender === "admin" ? "CCAE" : thread.user.name}</strong>
              <time dateTime={message.sentAt}>{formatWhen(message.sentAt)}</time>
            </header>
            {message.content ? <p>{message.content}</p> : null}
            {message.attachment ? (
              <a
                className="request-attachment"
                href={requestAttachmentHref(message.attachment.id)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="request-attachment-kind">
                  {message.attachment.mimeType === "application/pdf" ? "PDF" : "Image"}
                </span>
                {message.attachment.filename}
                <small>({formatBytes(message.attachment.sizeBytes)})</small>
              </a>
            ) : null}
          </li>
        ))}
      </ol>

      {isOpen ? (
        <form className="request-reply" onSubmit={(event) => void send(event)}>
          <label htmlFor="request-reply-text">Reply to {thread.user.name}</label>
          <textarea
            id="request-reply-text"
            maxLength={REPLY_LIMIT}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            value={reply}
          />
          <div className="request-reply-row">
            <span className="request-count">
              {reply.length}/{REPLY_LIMIT}
            </span>
            <button disabled={!reply.trim() || isBusy} type="submit">
              {isBusy ? "Saving…" : "Send reply"}
            </button>
          </div>
        </form>
      ) : (
        <p className="queue-mode">
          This request is closed, so {thread.user.name} cannot reply. Reopen it to send another message.
        </p>
      )}
    </div>
  );
}
