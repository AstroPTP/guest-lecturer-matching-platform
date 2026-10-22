"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminEvents, type AdminEvents } from "@/services/adminApi";

const STATUSES = ["all", "invitation-sent", "accepted", "declined", "completed", "cancelled"];

/**
 * Every guest lecture booked through the platform, and how notifications are
 * being used. Read-only: events belong to the coordinator and lecturer.
 */
export default function EventsPage() {
  const [data, setData] = useState<AdminEvents | null>(null);
  const [status, setStatus] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getAdminEvents();
        if (active) setData(result);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Events could not be loaded.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const rows = data?.events ?? [];
    return status === "all" ? rows : rows.filter((row) => row.status === status);
  }, [data, status]);

  if (isLoading) return <p className="control-empty">Loading events…</p>;
  if (errorMessage || !data) return <p className="control-empty">{errorMessage}</p>;

  const figures = [
    { label: "Events", value: data.events.length },
    { label: "Notifications sent", value: data.notifications.sent },
    { label: "Sent in the last 7 days", value: data.notifications.lastSevenDays },
    { label: "Not yet read", value: data.notifications.unread },
  ];

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Events and notifications</h1>
        <p>Every guest lecture booked through the platform, and the notifications sent about them.</p>
      </header>

      <section className="user-summary" aria-label="Event and notification figures">
        {figures.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <div className="audit-filters">
        <label className="audit-select">
          <span>Status</span>
          <select onChange={(event) => setStatus(event.target.value)} value={status}>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All statuses" : item.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="users-table-card">
        <div className="users-table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Coordinator</th>
                <th>Guest lecturer</th>
                <th>Format</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>
                    {row.date} {row.startTime}
                  </td>
                  <td>{row.coordinator}</td>
                  <td>{row.guestLecturer}</td>
                  <td>{row.format}</td>
                  <td>
                    <b className={"audit-status " + (row.status === "completed" ? "success" : "pending")}>
                      {row.status.replace(/-/g, " ")}
                    </b>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td className="empty-users" colSpan={6}>
                    No events match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
