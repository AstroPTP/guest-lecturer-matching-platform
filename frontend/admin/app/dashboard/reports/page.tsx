"use client";

import { useEffect, useState } from "react";
import { RequestDetailsButton } from "@/components/RequestDetailsButton";
import { getOpenReports, holdReport, resolveReport, type OpenReport } from "@/services/adminApi";

const ROLE_LABELS: Record<string, string> = {
  guest_speaker: "Guest lecturer",
  unit_coordinator: "Unit coordinator",
  ccae_admin: "Administrator",
};

/**
 * The moderation queue: reports users have raised about one another that
 * nobody has dealt with yet. Dismissing or deactivating closes the report,
 * and both are recorded in the audit log.
 *
 * An open report stops the reporter and the person reported sending each
 * other new messages and hides them from each other in Discovery; their
 * conversation stays readable. It hides the person from everyone only once
 * enough different people have reported them, or an administrator holds them
 * here. Every decision reloads the queue, because closing one report changes
 * the counts shown on the others. A decision that fails also reloads it, so a
 * report someone else has just dealt with leaves the list.
 */

function holdText(row: OpenReport): string {
  if (!row.onHold) return "Not on hold";
  const why = row.holdReasons.map((reason) =>
    reason === "admin" ? "held by an administrator" : `${row.holdThreshold} or more people reported them`,
  );
  return `On hold: ${why.join("; ")}`;
}

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

  async function reload() {
    setRows(await getOpenReports());
  }

  /** Runs one decision on a report, then reloads the queue. */
  async function decide(row: OpenReport, action: () => Promise<void>, failure: string) {
    setPendingId(row.id);
    setErrorMessage(null);
    try {
      await action();
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : failure);
      // The refusal may be because the report was dealt with elsewhere; show the queue as it is now.
      try {
        await reload();
      } catch {
        // The message above already says what went wrong.
      }
    } finally {
      setPendingId(null);
    }
  }

  async function close(row: OpenReport, outcome: "dismissed" | "deactivated") {
    if (
      outcome === "deactivated" &&
      !window.confirm(`Deactivate ${row.reportedEmail ?? "this account"}? You can reactivate it later.`)
    ) {
      return;
    }
    await decide(row, () => resolveReport(row.id, outcome), "That decision could not be saved.");
  }

  async function hold(row: OpenReport) {
    await decide(row, () => holdReport(row.id), "The hold could not be placed.");
  }

  if (isLoading) return <p className="control-empty">Loading reports…</p>;

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Reports</h1>
        <p>Reports users have raised about the people they matched with. While a report is open, the two people cannot send each other new messages or find each other in Discovery, but their conversation stays readable. A person is hidden from everyone only when several different people have reported them, or when you hold them. Dismissing the last open report lifts the hold.</p>
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
                    <dt>Open reporters</dt>
                    <dd>
                      {row.openReporters} of {row.holdThreshold} needed to hold
                    </dd>
                  </div>
                  <div>
                    <dt>Hold</dt>
                    <dd className={row.onHold ? "report-hold on" : "report-hold"}>{holdText(row)}</dd>
                  </div>
                  <div>
                    <dt>While open</dt>
                    <dd>
                      {row.onHold
                        ? "Hidden from Discovery for everyone and unable to send or receive messages."
                        : "The reporter and this person cannot send each other new messages or find each other in Discovery. Their conversation stays readable. Everyone else is unaffected."}
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
                  disabled={pendingId === row.id || row.coveredByHold}
                  onClick={() => void hold(row)}
                  type="button"
                >
                  {row.coveredByHold ? "Held" : "Hold until reviewed"}
                </button>
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
