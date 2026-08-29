"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import arrowIcon from "@/assets/arrow.png";
import searchIcon from "@/assets/search.png";
import {
  auditActorRoles,
  auditCategories,
  auditDateRange,
  auditEntries,
  auditEntryTotal,
  auditMetrics,
} from "@/data/audit_log";
import type { AuditActorRole, AuditCategory } from "@/types/admin";

export default function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AuditCategory | "All">("All");
  const [actorRole, setActorRole] = useState<AuditActorRole | "All">("All");
  const [startDateTime, setStartDateTime] = useState<string>(auditDateRange.start);
  const [endDateTime, setEndDateTime] = useState<string>(auditDateRange.end);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const startTime = startDateTime ? new Date(startDateTime).getTime() : Number.NEGATIVE_INFINITY;
    const endTime = endDateTime ? new Date(endDateTime).getTime() + 59_999 : Number.POSITIVE_INFINITY;

    return auditEntries.filter((entry) => {
      const entryTime = new Date(entry.timestamp.replace("\n", "T")).getTime();
      const matchesQuery =
        !normalized ||
        entry.actorName.toLowerCase().includes(normalized) ||
        entry.action.toLowerCase().includes(normalized) ||
        entry.target.toLowerCase().includes(normalized);
      const matchesDateRange = entryTime >= startTime && entryTime <= endTime;

      return (
        matchesQuery &&
        matchesDateRange &&
        (category === "All" || entry.category === category) &&
        (actorRole === "All" || entry.actorRole === actorRole)
      );
    });
  }, [actorRole, category, endDateTime, query, startDateTime]);

  return (
    <div className="audit-page">
      <header className="audit-heading">
        <h1>Audit Log</h1>
        <div className="audit-date">
          <span className="audit-date-label">Date range</span>
          <div className="audit-date-inputs">
            <label>
              <span className="sr-only">Start date and time</span>
              <input
                max={endDateTime || undefined}
                onChange={(event) => setStartDateTime(event.target.value)}
                type="datetime-local"
                value={startDateTime}
              />
            </label>
            <Image alt="" aria-hidden="true" height={14} src={arrowIcon} width={14} />
            <label>
              <span className="sr-only">End date and time</span>
              <input
                min={startDateTime || undefined}
                onChange={(event) => setEndDateTime(event.target.value)}
                type="datetime-local"
                value={endDateTime}
              />
            </label>
          </div>
        </div>
      </header>

      <section className="audit-tools">
        <label className="audit-search">
          <Image alt="" aria-hidden="true" height={14} src={searchIcon} width={14} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by actor, action or target..."
            type="search"
            value={query}
          />
        </label>

        <label className="audit-select">
          <span>Category</span>
          <select
            onChange={(event) => setCategory(event.target.value as AuditCategory | "All")}
            value={category}
          >
            <option value="All">All categories</option>
            {auditCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="audit-select">
          <span>Role</span>
          <select
            onChange={(event) => setActorRole(event.target.value as AuditActorRole | "All")}
            value={actorRole}
          >
            <option value="All">All roles</option>
            {auditActorRoles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="audit-metrics" aria-label="Audit metrics">
        {auditMetrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="audit-table-card">
        <div className="audit-table-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Target</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.timestamp + "-" + entry.action}>
                  <td>
                    {entry.timestamp.split("\n").map((part) => (
                      <span key={part}>{part}</span>
                    ))}
                  </td>
                  <td>
                    <strong className="audit-actor-name">{entry.actorName}</strong>
                  </td>
                  <td>{entry.actorRole}</td>
                  <td>{entry.action}</td>
                  <td>
                    <span className="target-type">{entry.targetType}</span>
                    <strong className="audit-target">{entry.target}</strong>
                  </td>
                  <td>
                    <b className={"category-label " + entry.category.toLowerCase()}>{entry.category}</b>
                  </td>
                  <td>
                    <b className={"audit-status " + entry.status.toLowerCase()}>{entry.status}</b>
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td className="audit-empty" colSpan={7}>
                    No audit entries match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="audit-pagination">
          <span>
            Showing 1 to {filteredEntries.length} of {auditEntryTotal.toLocaleString()} entries
          </span>
          <div>
            <button aria-label="Previous page" disabled>
              <Image alt="" height={12} src={arrowIcon} width={12} />
            </button>
            <button className="current">1</button>
            <button>2</button>
            <button>3</button>
            <button aria-label="Next page">
              <Image alt="" height={12} src={arrowIcon} width={12} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
