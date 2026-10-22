"use client";

import { useEffect, useState } from "react";
import { getOpenReports, resolveReport, type OpenReport } from "@/services/adminApi";

const ROLE_LABELS: Record<string, string> = {
  guest_speaker: "Guest lecturer",
  unit_coordinator: "Unit coordinator",
  ccae_admin: "Administrator",
};

/**
 * The moderation queue: reports users have raised about one another that
 * nobody has dealt with yet. Dismissing or deactivating closes the report,
 * and both are recorded in the audit log. A report raised from a match keeps
 * the person out of Discovery and messaging until it is closed.
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
        <p>Reports users have raised about the people they matched with. Until you decide, that person is hidden from Discovery and cannot send or receive messages. Dismissing restores them.</p>
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
                <strong>{row.reportedName ?? row.reportedEmail ?? "Unknown account"}</strong>
                <span>
                  {ROLE_LABELS[row.reportedRole ?? ""] ?? "Account"}
                  {row.reportedName && row.reportedEmail ? ` · ${row.reportedEmail}` : ""}
                  {" · "}
                  <b className={`report-status ${row.reportedStatus}`}>
                    {row.reportedStatus === "deactivated" ? "Deactivated" : "Active"}
                  </b>
                </span>
                <p>&ldquo;{row.reason}&rdquo;</p>
                <dl className="report-context">
                  <div>
                    <dt>Reported by</dt>
                    <dd>
                      {row.reporterName ?? row.reporterEmail ?? "Unknown account"}
                      {row.reporterRole ? ` (${ROLE_LABELS[row.reporterRole] ?? "Account"})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Conversation</dt>
                    <dd>{row.matchId ? `Match #${row.matchId}` : "Not raised from a match"}</dd>
                  </div>
                  <div>
                    <dt>While open</dt>
                    <dd>
                      {row.reportedIsBlocked
                        ? "Hidden from Discovery and unable to message, until you decide."
                        : "No restriction. Only reports raised from a match restrict the account."}
                    </dd>
                  </div>
                </dl>
                <small>
                  Reported{" "}
                  {new Date(row.reportedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
