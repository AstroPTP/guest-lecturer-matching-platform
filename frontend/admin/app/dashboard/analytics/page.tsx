"use client";

import { useEffect, useState } from "react";
import {
  downloadUsageReport,
  getCoordinatorActivity,
  getOverview,
  withWidths,
  type AdminOverview,
  type CoordinatorActivity,
} from "@/services/adminApi";

/**
 * Platform usage, for the CCAE administrator.
 *
 * The metrics the client listed: matches made, users who have signed in,
 * contacts made, profiles created, and requests sent by each unit
 * coordinator. The CSV download is the platform usage report.
 */
export default function Analytics() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [coordinators, setCoordinators] = useState<CoordinatorActivity[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [summary, perCoordinator] = await Promise.all([getOverview(), getCoordinatorActivity()]);
        if (!active) return;
        setOverview(summary);
        setCoordinators(perCoordinator);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Analytics could not be loaded.");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function exportReport() {
    setIsExporting(true);
    try {
      await downloadUsageReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The report could not be generated.");
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) return <p className="control-empty">Loading analytics…</p>;
  if (errorMessage || !overview) return <p className="control-empty">{errorMessage ?? "No data available."}</p>;

  const figures = [
    { label: "Profiles created", value: overview.profiles.created, detail: `${overview.profiles.createdLast30Days} in the last 30 days` },
    { label: "Signed in, last 30 days", value: overview.signIns.last30Days, detail: `of ${overview.people.active} active accounts` },
    { label: "Contacts made", value: overview.contacts.raised, detail: `${overview.contacts.pending} awaiting a reply` },
    { label: "Matches made", value: overview.contacts.accepted, detail: `${overview.contacts.acceptanceRate}% acceptance` },
  ];

  const funnel = withWidths([
    { label: "Contacts made", value: overview.contacts.raised },
    { label: "Accepted", value: overview.contacts.accepted },
    { label: "Declined", value: overview.contacts.declined },
    { label: "Awaiting reply", value: overview.contacts.pending },
  ]);

  const perCoordinator = withWidths(
    coordinators.slice(0, 10).map((c) => ({ label: c.name, value: c.requests, accepted: c.accepted })),
  );

  return (
    <div className="overview-page">
      <header className="overview-heading page-heading">
        <div>
          <h1>Platform Usage</h1>
          <p>The figures the client asked for, counted live from the database.</p>
        </div>
        <button className="primary-button" type="button" onClick={exportReport} disabled={isExporting}>
          {isExporting ? "Preparing…" : "Download usage report (CSV)"}
        </button>
      </header>

      <section className="overview-stats" aria-label="Usage figures">
        {figures.map((figure) => (
          <article className="overview-stat" key={figure.label}>
            <div className="overview-stat-label">
              <span>{figure.label}</span>
            </div>
            <strong>{figure.value}</strong>
            <small>{figure.detail}</small>
          </article>
        ))}
      </section>

      <section className="overview-content">
        <article className="registration-chart-card">
          <div className="overview-card-heading">
            <h2>Contacts and matches</h2>
          </div>
          <div className="funnel">
            {funnel.map((stage) => (
              <div className="funnel-row" key={stage.label}>
                <span className="funnel-label">{stage.label}</span>
                <span className="funnel-bar" style={{ backgroundColor: stage.color, width: stage.width + "%" }} />
                <strong>{stage.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="recent-card">
          <div className="overview-card-heading">
            <h2>Requests by unit coordinator</h2>
          </div>
          {perCoordinator.length === 0 ? (
            <p className="control-empty">No coordinator has sent a request yet.</p>
          ) : (
            <div className="funnel per-coordinator">
              {perCoordinator.map((row) => (
                <div className="funnel-row" key={row.label}>
                  <span className="funnel-label">{row.label}</span>
                  <span className="funnel-bar" style={{ backgroundColor: row.color, width: row.width + "%" }} />
                  <strong>
                    {row.value} <small>({row.accepted} accepted)</small>
                  </strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
