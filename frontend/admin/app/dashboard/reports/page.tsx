"use client";

import { useEffect, useState } from "react";
import { RequestDetailsButton } from "@/components/RequestDetailsButton";
import { getOpenReports, resolveReport, type OpenReport } from "@/services/adminApi";

const ROLE_LABELS: Record<string, string> = {
  guest_speaker: "Guest lecturer",
  unit_coordinator: "Unit coordinator",
  ccae_admin: "Administrator",
};

/**
 * The moderation queue: reports users have raised about one another that
 * nobody has dealt with yet. Dismissing or deactivating closes the report,
 * and both are recorded in the audit log.
 */
export default function ReportsPage() {
  const [rows, setRows] = useState<OpenReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const reports = await getOpenReports();
        if (active) setRows(reports);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Reports could not be loaded.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function close(row: OpenReport, outcome: "dismissed" | "deactivated") {
    if (
      outcome === "deactivated" &&
      !window.confirm(`Deactivate ${row.reportedEmail ?? "this account"}? You can reactivate it later.`)
    ) {
      return;
    }
    setPendingId(row.id);
    setErrorMessage(null);
    try {
      await resolveReport(row.id, outcome);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That decision could not be saved.");
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) return <p className="control-empty">Loading reports…</p>;

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Reports</h1>
        <p>Reports users have raised about other accounts, waiting for a decision.</p>
      </header>

      {errorMessage ? (
        <p className="profile-notice error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="control-empty">No open reports.</p>
      ) : (
        <ul className="review-list">
          {rows.map((row) => (
            <li className="review-item" key={row.id}>
              <div>
                <strong>{row.reportedEmail ?? "Unknown account"}</strong>
                <span>
                  {ROLE_LABELS[row.reportedRole ?? ""] ?? "Account"}
                  {row.reportedStatus === "deactivated" ? " · already deactivated" : ""}
                </span>
                <p>&ldquo;{row.reason}&rdquo;</p>
                <small>
                  Reported{" "}
                  {new Date(row.reportedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {row.reporterEmail ? ` by ${row.reporterEmail}` : ""}
                </small>
              </div>
              <div className="review-actions">
                <button
                  disabled={pendingId === row.id}
                  onClick={() => void close(row, "dismissed")}
                  type="button"
                >
                  {pendingId === row.id ? "Saving…" : "Dismiss"}
                </button>
                <button
                  className="text-action"
                  disabled={pendingId === row.id || row.reportedStatus === "deactivated"}
                  onClick={() => void close(row, "deactivated")}
                  type="button"
                >
                  Deactivate account
                </button>
                {row.reportedUserId ? (
                  <RequestDetailsButton
                    userId={row.reportedUserId}
                    userName={row.reportedEmail ?? "this user"}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
