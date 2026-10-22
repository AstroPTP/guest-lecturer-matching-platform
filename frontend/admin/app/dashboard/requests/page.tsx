"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRequestThreads, type RequestThreadSummary } from "@/services/adminApi";
import { formatWhen, requestRoleLabel } from "@/lib/requestFormat";

/**
 * Requests for further details: every time an administrator has asked a user
 * for more information, whether they have answered, and whether anything they
 * sent is still unread.
 */
export default function RequestsPage() {
  const [rows, setRows] = useState<RequestThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const threads = await getRequestThreads();
        if (active) setRows(threads);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Requests could not be loaded.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (isLoading) return <p className="control-empty">Loading requests…</p>;

  // Open requests first, then by most recent activity.
  const ordered = [...rows].sort(
    (a, b) =>
      Number(b.status === "open") - Number(a.status === "open") ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
  const unread = rows.reduce((total, row) => total + row.unreadFromUser, 0);

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Requests</h1>
        <p>
          Further details you have asked users for. Start one from a user&rsquo;s profile, the verification queue
          or a report.
        </p>
      </header>

      {errorMessage ? (
        <p className="profile-notice error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <p className="queue-mode">
          {rows.filter((row) => row.status === "open").length} open, {rows.filter((row) => row.status === "closed").length}{" "}
          closed. {unread === 0 ? "Nothing unread." : `${unread} unread ${unread === 1 ? "message" : "messages"} from users.`}
        </p>
      ) : null}

      {rows.length === 0 && !errorMessage ? (
        <p className="control-empty">No requests yet.</p>
      ) : (
        <ul className="review-list">
          {ordered.map((row) => (
            <li className="review-item" key={row.id}>
              <div>
                <strong>{row.subject}</strong>
                <span>
                  {row.userName} · {requestRoleLabel(row.userRole)}
                  {row.userEmail ? ` · ${row.userEmail}` : ""}
                </span>
                <div className="request-badges">
                  <span className={`request-badge ${row.status}`}>{row.status === "open" ? "Open" : "Closed"}</span>
                  {row.unreadFromUser > 0 ? (
                    <span className="request-unread">{row.unreadFromUser} unread</span>
                  ) : null}
                </div>
                <small>
                  Started {formatWhen(row.createdAt)} · Last activity {formatWhen(row.updatedAt)}
                </small>
              </div>
              <div className="review-actions">
                <Link href={`/dashboard/requests/${encodeURIComponent(row.id)}`}>
                  {row.unreadFromUser > 0 ? "Read and reply" : "Open"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
