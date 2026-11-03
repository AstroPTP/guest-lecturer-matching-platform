"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequestDetailsButton } from "@/components/RequestDetailsButton";
import {
  approveGuest,
  getPendingReviews,
  getSettings,
  setUserStatus,
  type PendingProfile,
} from "@/services/adminApi";

/**
 * The verification queue: guest lecturer profiles not yet approved.
 *
 * Approval only hides anything while "Require admin approval" is on in
 * Settings. With it off, the queue still lists new profiles so an
 * administrator can see who has joined, but they are already visible.
 */
export default function ReviewsPage() {
  const [rows, setRows] = useState<PendingProfile[]>([]);
  const [approvalRequired, setApprovalRequired] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [queue, settings] = await Promise.all([getPendingReviews(), getSettings()]);
        if (active) {
          setRows(queue);
          setApprovalRequired(settings.requireAdminApproval);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "The queue could not be loaded.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function decide(row: PendingProfile, decision: "approve" | "reject") {
    if (decision === "reject") {
      if (!row.userId) return;
      const confirmed = window.confirm(
        `Reject ${row.name}? Their account will be deactivated and hidden from coordinators. You can reactivate it later.`,
      );
      if (!confirmed) return;
    }

    setPendingId(row.guestId);
    setErrorMessage(null);
    try {
      if (decision === "approve") {
        await approveGuest(row.guestId);
      } else if (row.userId) {
        await setUserStatus(row.userId, "deactivated");
      }
      setRows((current) => current.filter((item) => item.guestId !== row.guestId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That decision could not be saved.");
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) return <p className="control-empty">Loading the queue…</p>;

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Verification queue</h1>
        <p>Guest lecturer profiles waiting for an administrator.</p>
      </header>

      {approvalRequired !== null ? (
        <p className="queue-mode">
          {approvalRequired
            ? "Approval is on: these profiles are hidden from unit coordinators until approved."
            : "Approval is off: these profiles are already visible to unit coordinators. Turn approval on in Settings to hold new profiles here first."}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="profile-notice error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="control-empty">Nothing is waiting on a decision.</p>
      ) : (
        <ul className="review-list">
          {rows.map((row) => (
            <li className="review-item" key={row.guestId}>
              <div>
                <strong>{row.name}</strong>
                <span>
                  {row.role ?? "Role not stated"}
                  {row.field ? ` · ${row.field}` : ""}
                </span>
                <small>
                  Joined{" "}
                  {new Date(row.submittedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {row.email ? ` · ${row.email}` : ""}
                </small>
              </div>
              <div className="review-actions">
                <button
                  disabled={pendingId === row.guestId}
                  onClick={() => void decide(row, "approve")}
                  type="button"
                >
                  {pendingId === row.guestId ? "Saving…" : "Approve"}
                </button>
                <button
                  className="text-action"
                  disabled={pendingId === row.guestId || !row.userId}
                  onClick={() => void decide(row, "reject")}
                  type="button"
                >
                  Reject
                </button>
                {row.userId ? (
                  <RequestDetailsButton userId={row.userId} userName={row.name} />
                ) : null}
                {row.userId ? (
                  <Link href={`/dashboard/users/${encodeURIComponent(`#GL-${row.userId}`)}`}>Full profile</Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
