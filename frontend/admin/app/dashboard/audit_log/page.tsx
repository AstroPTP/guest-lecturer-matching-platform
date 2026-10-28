"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import arrowIcon from "@/assets/arrow.png";
import searchIcon from "@/assets/search.png";
import { correlationIdFromSearch } from "@/lib/auditSearch";
import { AUDIT_ACTION_FILTERS, getAuditEntries } from "@/services/adminApi";
import type { AuditActorRole, AuditCategory, AuditEntry } from "@/types/admin";

const auditCategories: AuditCategory[] = [
  "Discovery",
  "Match",
  "Event",
  "Invitation",
  "Account Management",
  "Security",
  "System",
];

const auditActorRoles: AuditActorRole[] = [
  "Administrator",
  "System",
  "Unit Coordinator",
  "Guest Lecturer",
];

const ENTRIES_PER_PAGE = 20;

/**
 * A date as a datetime-local value. Those inputs read their value as local
 * time, so it is built from local time; toISOString() alone is UTC and would
 * cut the range short by the UTC offset.
 */
function toLocalInput(when: Date): string {
  return new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** A datetime-local value that far back, for the default range. */
function monthsAgo(count: number): string {
  const when = new Date();
  when.setMonth(when.getMonth() - count);
  return toLocalInput(when);
}

export default function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AuditCategory | "All">("All");
  const [actorRole, setActorRole] = useState<AuditActorRole | "All">("All");
  // The stored action key, or "All". Unlike the other filters this one is sent
  // to the server, so a frequent action cannot crowd the rest out of the page.
  const [action, setAction] = useState<string>("All");
  const [startDateTime, setStartDateTime] = useState<string>(monthsAgo(6));
  const [endDateTime, setEndDateTime] = useState<string>(toLocalInput(new Date()));
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Set when the search text is a whole correlation ID. That search is sent to
  // the server, because searching in the browser only reaches the newest
  // entries loaded, and an older ID would never be found.
  const searchedId = correlationIdFromSearch(query);

  // Cleared at once, so rows from the previous request are not shown as though
  // they belonged to the new one while it loads.
  function startLoading() {
    setAuditEntries([]);
    setErrorMessage(null);
    setIsLoading(true);
    setCurrentPage(1);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await getAuditEntries(
          500,
          action === "All" ? undefined : action,
          searchedId,
        );
        if (active) setAuditEntries(rows);
      } catch (error) {
        if (active) {
          setAuditEntries([]);
          setErrorMessage(
            error instanceof Error ? error.message : "The audit log could not be loaded.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [action, searchedId]);

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
        entry.target.toLowerCase().includes(normalized) ||
        (entry.correlationId?.toLowerCase().includes(normalized) ?? false);
      const matchesDateRange = entryTime >= startTime && entryTime <= endTime;

      return (
        matchesQuery &&
        matchesDateRange &&
        (category === "All" || entry.category === category) &&
        (actorRole === "All" || entry.actorRole === actorRole)
      );
    });
  }, [actorRole, auditEntries, category, endDateTime, query, startDateTime]);

  // Pagination that actually pages. The four footer buttons had no handlers at
  // all, and the count claimed 2,841 entries over a fixed list of fourteen.
  const totalEntries = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / ENTRIES_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const firstShown = totalEntries === 0 ? 0 : (safePage - 1) * ENTRIES_PER_PAGE + 1;
  const lastShown = Math.min(safePage * ENTRIES_PER_PAGE, totalEntries);
  const pageEntries = filteredEntries.slice(
    (safePage - 1) * ENTRIES_PER_PAGE,
    safePage * ENTRIES_PER_PAGE,
  );

  const auditMetrics = [
    { label: "Entries recorded", value: String(auditEntries.length) },
    { label: "Matching this filter", value: String(totalEntries) },
    {
      label: "Account actions",
      value: String(auditEntries.filter((e) => e.category === "Account Management").length),
    },
    {
      label: "Distinct actors",
      value: String(new Set(auditEntries.map((e) => e.actorName)).size),
    },
  ];

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
            onChange={(event) => {
              const text = event.target.value;
              if (correlationIdFromSearch(text) !== searchedId) startLoading();
              setQuery(text);
            }}
            placeholder="Search by actor, action, target or correlation ID..."
            type="search"
            value={query}
          />
        </label>

        <label className="audit-select">
          <span>Action</span>
          <select
            onChange={(event) => {
              startLoading();
              setAction(event.target.value);
            }}
            value={action}
          >
            <option value="All">All actions</option>
            {AUDIT_ACTION_FILTERS.map((item) => (
              <option key={item.action} value={item.action}>
                {item.label}
              </option>
            ))}
          </select>
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
                <th>Correlation ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry, index) => (
                <tr key={entry.timestamp + "-" + entry.action + "-" + index}>
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
                    {entry.correlationId ? (
                      <code className="audit-correlation" title="Click to select, then copy">
                        {entry.correlationId}
                      </code>
                    ) : (
                      <span className="audit-correlation-none">None recorded</span>
                    )}
                  </td>
                  <td>
                    <b className={"audit-status " + entry.status.toLowerCase()}>{entry.status}</b>
                  </td>
                </tr>
              ))}
              {pageEntries.length === 0 && (
                <tr>
                  <td className="audit-empty" colSpan={8}>
                    {isLoading
                      ? "Loading audit entries…"
                      : errorMessage
                        ? errorMessage
                        : auditEntries.length === 0
                          ? searchedId
                            ? "No audit entry carries that correlation ID."
                            : "Nothing has been recorded yet."
                          : "No audit entries match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="audit-pagination">
          <span>
            Showing {firstShown} to {lastShown} of {totalEntries.toLocaleString()} entries
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              <Image alt="" height={12} src={arrowIcon} width={12} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
              const page = index + 1;
              return (
                <button
                  aria-current={safePage === page ? "page" : undefined}
                  className={safePage === page ? "current" : ""}
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  type="button"
                >
                  {page}
                </button>
              );
            })}
            <button
              aria-label="Next page"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
            >
              <Image alt="" height={12} src={arrowIcon} width={12} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
