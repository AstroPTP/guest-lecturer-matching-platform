"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { requestDetails } from "@/services/adminApi";

const SUBJECT_LIMIT = 150;
const MESSAGE_LIMIT = 2000;

/**
 * "Request details": asks one user for further information, for example to
 * confirm who they are or to look into a report about them. The user sees it
 * in their Messages page and can answer there.
 *
 * Self-contained so the same button can sit on a profile, a verification row
 * or a report. The form is only mounted while it is open.
 */
export function RequestDetailsButton({
  userId,
  userName,
  className = "secondary-action",
}: {
  /** The user id, or a directory id such as "#GL-12". */
  userId: string;
  userName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  return (
    <>
      <button
        className={className}
        onClick={() => {
          setSentId(null);
          setOpen(true);
        }}
        type="button"
      >
        Request details
      </button>

      {sentId ? (
        <p className="request-sent" role="status">
          Request sent to {userName}.{" "}
          <Link href={`/dashboard/requests/${encodeURIComponent(sentId)}`}>View it in Requests</Link>
        </p>
      ) : null}

      {open ? (
        <RequestDetailsDialog
          onClose={() => setOpen(false)}
          onSent={(id) => {
            setSentId(id);
            setOpen(false);
          }}
          userId={userId}
          userName={userName}
        />
      ) : null}
    </>
  );
}

function RequestDetailsDialog({
  userId,
  userName,
  onClose,
  onSent,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  onSent: (threadId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subjectId = useId();
  const messageId = useId();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Opened as a modal so focus is held inside it, Escape closes it, and the
  // page behind cannot be used until it is dealt with.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const canSend = subject.trim().length > 0 && message.trim().length > 0 && !isSending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setIsSending(true);
    setErrorMessage("");
    try {
      const created = await requestDetails({ userId, subject: subject.trim(), message: message.trim() });
      onSent(created.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The request could not be sent.");
      setIsSending(false);
    }
  }

  return (
    <dialog aria-labelledby={titleId} className="confirm-dialog request-dialog" onClose={onClose} ref={dialog}>
      <form onSubmit={(event) => void submit(event)}>
        <h2 id={titleId}>Request details from {userName}</h2>
        <p>
          They will see this in their Messages page, marked &ldquo;Action required&rdquo;, and can reply with text
          and one attached file.
        </p>

        <div className="request-field">
          <label htmlFor={subjectId}>Subject</label>
          <input
            autoFocus
            id={subjectId}
            maxLength={SUBJECT_LIMIT}
            onChange={(event) => setSubject(event.target.value)}
            required
            type="text"
            value={subject}
          />
          <span className="request-count">
            {subject.length}/{SUBJECT_LIMIT}
          </span>
        </div>

        <div className="request-field">
          <label htmlFor={messageId}>Message</label>
          <textarea
            id={messageId}
            maxLength={MESSAGE_LIMIT}
            onChange={(event) => setMessage(event.target.value)}
            required
            rows={5}
            value={message}
          />
          <span className="request-count">
            {message.length}/{MESSAGE_LIMIT}
          </span>
        </div>

        {errorMessage ? (
          <p className="request-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="confirm-actions">
          <button onClick={() => dialog.current?.close()} type="button">
            Cancel
          </button>
          <button className="request-submit" disabled={!canSend} type="submit">
            {isSending ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
