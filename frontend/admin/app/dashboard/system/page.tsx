"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/system/StatusBadge";
import { BackendError } from "@/lib/api/backendClient";
import {
  NOT_AVAILABLE,
  categoryLabel,
  describeThreshold,
  formatBytes,
  formatCount,
  formatDateTime,
  formatDuration,
  formatMeasurement,
  formatPercent,
  formatTime,
  toCheckStatus,
} from "@/lib/system_format";
import { getSecuritySignals, getSystemSnapshot } from "@/services/adminApi";
import type {
  CheckStatus,
  SecurityCounts,
  SecuritySignals,
  SystemCheck,
  SystemSnapshot,
} from "@/types/admin";

/** How often the page re-reads the system, while it is on screen. */
const REFRESH_INTERVAL_MS = 60_000;

/** The API sends at most this many recent events, so the table never has more to show; the counts above it cover everything. */
const MAX_RECENT_EVENTS = 20;

type LoadMode = "initial" | "auto" | "manual";

const COUNT_TILES: { key: keyof SecurityCounts; label: string }[] = [
  { key: "authFailures", label: "Failed authentications" },
  { key: "adminForbidden", label: "Admin access denied" },
  { key: "rateLimited", label: "Rate limited requests" },
  { key: "serverErrors", label: "Server errors" },
];

/** What went wrong, in words an administrator can act on. */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof BackendError) {
    // The page is open to anyone who reaches the URL; the API is what refuses
    // them, and a bare "Forbidden" does not say what to do about it.
    if (error.status === 403) return "You need the administrator role to view system analytics.";
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The fill colour class for a meter, from the status of the check that measures the same thing. */
function toneFor(status: CheckStatus | undefined): "ok" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "healthy":
      return "ok";
    case "warning":
      return "warn";
    case "unavailable":
      return "bad";
    default:
      return "neutral";
  }
}

function InlineIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 16 16"
      width="16"
    >
      {children}
    </svg>
  );
}

/** A problem with one part of the page. Role alert, so a screen reader hears it when it appears. */
function SectionError({ children }: { children: ReactNode }) {
  return (
    <p className="sys-error" role="alert">
      <InlineIcon>
        <rect height="12" rx="2" width="12" x="2" y="2" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
      </InlineIcon>
      <span>{children}</span>
    </p>
  );
}

/**
 * A reading against a limit.
 *
 * A bar with role="meter" rather than <meter>, because the native element
 * cannot be styled the same way in every browser. The accessible name, the
 * 0 to 100 range, the current value and a spoken form of it are all stated,
 * and the same figures are printed beside the bar, so the bar is never the
 * only place a number lives.
 */
function Meter({
  label,
  usedBytes,
  totalBytes,
  tone,
  detail,
}: {
  label: string;
  usedBytes: number;
  totalBytes: number;
  tone: "ok" | "warn" | "bad" | "neutral";
  detail?: string;
}) {
  const labelId = useId();
  const rawPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const percent = Math.min(100, Math.max(0, rawPercent));
  const valueText = `${formatBytes(usedBytes)} of ${formatBytes(totalBytes)} (${formatPercent(rawPercent)})`;

  return (
    <div className="sys-meter">
      <div className="sys-meter-head">
        <span id={labelId}>{label}</span>
        <strong>{valueText}</strong>
      </div>
      <div
        aria-labelledby={labelId}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(percent * 10) / 10}
        aria-valuetext={valueText}
        className="sys-meter-bar"
        role="meter"
      >
        <span
          className={`sys-meter-fill sys-meter-fill--${tone}`}
          style={{ minWidth: percent > 0 ? 4 : 0, width: `${percent}%` }}
        />
      </div>
      {detail ? <p className="sys-meter-detail">{detail}</p> : null}
    </div>
  );
}

/** One labelled figure. A figure that is not there says so, in words. */
function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  const missing = value === NOT_AVAILABLE;
  return (
    <div className="sys-figure">
      <dt>{label}</dt>
      <dd className={missing ? "is-missing" : undefined}>{value}</dd>
      {note ? <dd className="sys-figure-note">{note}</dd> : null}
    </div>
  );
}

function CheckCard({ check }: { check: SystemCheck }) {
  const status = toCheckStatus(check.status);
  const threshold = describeThreshold(check);
  const value = formatMeasurement(check.value, check.unit, check.key);
  const missing = value === NOT_AVAILABLE;

  return (
    <li className={`sys-card sys-card--${status}`}>
      <div className="sys-card-head">
        <h3>{check.label}</h3>
        <StatusBadge status={status} />
      </div>
      <p className={missing ? "sys-card-value is-missing" : "sys-card-value"}>{value}</p>
      {threshold ? <p className="sys-card-threshold">{threshold}</p> : null}
      <p className="sys-card-message">{check.message}</p>
      <p className="sys-card-time">
        Checked <time dateTime={check.checkedAt}>{formatTime(check.checkedAt)}</time>
      </p>
    </li>
  );
}

function AlertsStrip({
  snapshot,
  security,
  snapshotError,
  securityError,
}: {
  snapshot: SystemSnapshot | null;
  security: SecuritySignals | null;
  snapshotError: string | null;
  securityError: string | null;
}) {
  const alerts = [
    ...(snapshot?.alerts ?? []).map((alert) => ({ ...alert, source: "System" })),
    ...(security?.alerts ?? []).map((alert) => ({ ...alert, source: "Security" })),
  ];

  // "No active alerts" is only true if both sources were read just now. With
  // one of them missing, or kept from an earlier read after a failed refresh,
  // it would be reassurance the page cannot give.
  const gaps: string[] = [];
  if (!snapshot) gaps.push("The system checks could not be read");
  else if (snapshotError) gaps.push("The system checks could not be refreshed");
  if (!security) gaps.push("the security signals could not be read");
  else if (securityError) gaps.push("the security signals could not be refreshed");

  return (
    <section aria-labelledby="sys-alerts-heading" className="sys-alerts">
      <h2 id="sys-alerts-heading">Alerts</h2>
      <div className="sys-alerts-body">
        {alerts.length > 0 ? (
          <ul className="sys-alert-list">
            {alerts.map((alert) => (
              <li className="sys-alert" key={`${alert.source}-${alert.key}`}>
                <StatusBadge status={alert.status} />
                <span className="sys-alert-source">{alert.source}</span>
                <span className="sys-alert-message">{alert.message}</span>
              </li>
            ))}
          </ul>
        ) : gaps.length === 0 ? (
          <p className="sys-alerts-clear">
            <StatusBadge status="healthy" />
            <span>No active alerts</span>
          </p>
        ) : null}
        {gaps.length > 0 ? (
          <p className="sys-alerts-incomplete">
            <StatusBadge status="unknown" />
            <span>{gaps.join(" and ")}, so this list may be incomplete or out of date.</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function StorageSection({ snapshot }: { snapshot: SystemSnapshot }) {
  const { storage, usage } = snapshot;
  const statusOf = (key: SystemCheck["key"]) =>
    snapshot.checks.find((check) => check.key === key)?.status;

  const hasDatabaseLimit =
    storage.databaseBytes !== null &&
    storage.databaseLimitBytes !== null &&
    storage.databaseLimitBytes > 0;
  const disk = storage.disk && storage.disk.totalBytes > 0 ? storage.disk : null;
  const memory = storage.memory.totalBytes > 0 ? storage.memory : null;

  const usageFigures: { label: string; value: number | null }[] = [
    { label: "Active users, last 24 hours", value: usage.activeUsers24h },
    { label: "Active users, last 7 days", value: usage.activeUsers7d },
    { label: "New accounts, last 7 days", value: usage.newAccounts7d },
    { label: "Match requests, last 7 days", value: usage.matchRequests7d },
    { label: "Messages, last 7 days", value: usage.messages7d },
    { label: "Photos stored", value: usage.photosStored },
  ];

  const tables = storage.largestTables;

  return (
    <div className="sys-stack">
      <article className="sys-panel">
        <h3>Storage</h3>
        <div className="sys-storage">
          {hasDatabaseLimit && storage.databaseBytes !== null && storage.databaseLimitBytes !== null ? (
            <Meter
              label="Database size"
              tone={toneFor(statusOf("database_size"))}
              totalBytes={storage.databaseLimitBytes}
              usedBytes={storage.databaseBytes}
            />
          ) : (
            <dl className="sys-stat">
              <Figure
                label="Database size"
                note={storage.databaseBytes === null ? undefined : "No size limit is set, so there is no percentage to show."}
                value={formatBytes(storage.databaseBytes)}
              />
            </dl>
          )}

          <dl className="sys-stat">
            <Figure label="Photos storage" value={formatBytes(storage.photosBytes)} />
          </dl>

          {disk ? (
            <Meter
              detail={`${formatBytes(disk.freeBytes)} free on ${disk.path}`}
              label="Disk"
              tone={toneFor(statusOf("disk"))}
              totalBytes={disk.totalBytes}
              usedBytes={Math.max(0, disk.totalBytes - disk.freeBytes)}
            />
          ) : (
            <dl className="sys-stat">
              <Figure label="Disk" value={NOT_AVAILABLE} />
            </dl>
          )}

          {memory ? (
            <Meter
              detail={`${formatBytes(memory.freeBytes)} free. This server process uses ${formatBytes(memory.processRssBytes)}.`}
              label="Memory"
              tone={toneFor(statusOf("memory"))}
              totalBytes={memory.totalBytes}
              usedBytes={Math.max(0, memory.totalBytes - memory.freeBytes)}
            />
          ) : (
            <dl className="sys-stat">
              <Figure label="Memory" value={NOT_AVAILABLE} />
            </dl>
          )}
        </div>
      </article>

      <article className="sys-panel">
        <h3>Largest tables</h3>
        {tables.length === 0 ? (
          <p className="control-empty">No table sizes were reported.</p>
        ) : (
          <div
            aria-label="Largest tables, scrolls sideways on a narrow screen"
            className="sys-table-scroll"
            role="region"
            tabIndex={0}
          >
            <table className="sys-table">
              <caption className="sr-only">Largest database tables by size</caption>
              <thead>
                <tr>
                  <th scope="col">Table</th>
                  <th className="num" scope="col">Rows</th>
                  <th className="num" scope="col">Size</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((row) => (
                  <tr key={row.table}>
                    <th className="sys-row-head" scope="row">{row.table}</th>
                    <td className="num">{formatCount(row.rows)}</td>
                    <td className="num">{formatBytes(row.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="sys-panel">
        <h3>Usage</h3>
        <dl className="sys-figures">
          {usageFigures.map((figure) => (
            <Figure key={figure.label} label={figure.label} value={formatCount(figure.value)} />
          ))}
        </dl>
      </article>
    </div>
  );
}

function SecuritySection({ security }: { security: SecuritySignals }) {
  // Newest first, whatever order the API sends them in, and bounded.
  const recent = [...security.recent]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, MAX_RECENT_EVENTS);

  return (
    <div className="sys-stack">
      <p className="sys-lede">
        Counts cover the last {formatCount(security.windowMinutes)} minutes. Totals are counted since the server
        started <time dateTime={security.startedAt}>{formatDateTime(security.startedAt)}</time> and start again
        from zero whenever it restarts.
      </p>

      <dl className="sys-figures sys-counts">
        {COUNT_TILES.map((tile) => (
          <Figure
            key={tile.key}
            label={tile.label}
            note={`${formatCount(security.countsSinceStart[tile.key])} since the server started`}
            value={formatCount(security.counts[tile.key])}
          />
        ))}
      </dl>

      {security.alerts.length > 0 ? (
        <ul className="sys-alert-list sys-panel">
          {security.alerts.map((alert) => (
            <li className="sys-alert" key={alert.key}>
              <StatusBadge status={alert.status} />
              <span className="sys-alert-message">{alert.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sys-alerts-clear sys-panel">
          <StatusBadge status="healthy" />
          <span>No security alerts in the last {formatCount(security.windowMinutes)} minutes</span>
        </p>
      )}

      <article className="sys-panel">
        <h3>Recent events</h3>
        {recent.length === 0 ? (
          <p className="control-empty">No security events have been recorded since the server started.</p>
        ) : (
          <>
            <div
              aria-label="Recent security events, scrolls sideways on a narrow screen"
              className="sys-table-scroll"
              role="region"
              tabIndex={0}
            >
              <table className="sys-table sys-events">
                <caption className="sr-only">Recent security events, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Category</th>
                    <th scope="col">Method</th>
                    <th scope="col">Path</th>
                    <th className="num" scope="col">Status</th>
                    <th scope="col">User</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((event, index) => (
                    <tr key={`${event.at}-${event.method}-${event.path}-${index}`}>
                      <td className="sys-nowrap">
                        <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                      </td>
                      <td>{categoryLabel(event.category)}</td>
                      <td className="sys-mono">{event.method}</td>
                      <td className="sys-mono sys-path">{event.path}</td>
                      <td className="num">{event.status}</td>
                      <td className={event.userId === null ? "sys-unrecorded" : undefined}>
                        {event.userId === null ? "not recorded" : `User ${event.userId}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {security.recent.length > MAX_RECENT_EVENTS ? (
              <p className="sys-table-note">
                Showing the {MAX_RECENT_EVENTS} most recent of {formatCount(security.recent.length)} events.
              </p>
            ) : null}
          </>
        )}
      </article>

      <p className="sys-note" role="note">
        <InlineIcon>
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7.2v4" />
          <path d="M8 4.7v.1" />
        </InlineIcon>
        <span>{security.authProviderNote}</span>
      </p>
    </div>
  );
}

/**
 * System analytics, for the CCAE administrator.
 *
 * Health, storage, usage and security signals, read from the API on arrival,
 * on demand, and once a minute while the tab is being looked at. The two
 * requests are independent: if one fails the other still shows, and the page
 * says which part is missing rather than going blank or claiming all is well.
 */
export default function SystemAnalytics() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [security, setSecurity] = useState<SecuritySignals | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  const mounted = useRef(false);
  const inFlight = useRef(false);
  const lastFetchedAt = useRef(0);

  const load = useCallback(async (mode: LoadMode) => {
    // One read at a time. A slow response must not be overtaken by, and then
    // overwrite, a newer one.
    if (inFlight.current) return;
    inFlight.current = true;

    const [snapshotResult, securityResult] = await Promise.allSettled([
      getSystemSnapshot(),
      getSecuritySignals(),
    ]);

    inFlight.current = false;
    lastFetchedAt.current = Date.now();
    if (!mounted.current) return;

    // A failed refresh keeps what was already on screen, with the failure
    // stated beside it, rather than replacing a useful old reading with an error.
    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
      setSnapshotError(null);
    } else {
      setSnapshotError(describeError(snapshotResult.reason, "The system checks could not be loaded."));
    }

    if (securityResult.status === "fulfilled") {
      setSecurity(securityResult.value);
      setSecurityError(null);
    } else {
      setSecurityError(describeError(securityResult.reason, "The security signals could not be loaded."));
    }

    setIsLoading(false);
    setIsRefreshing(false);

    if (mode === "manual") {
      const failed = snapshotResult.status === "rejected" || securityResult.status === "rejected";
      setAnnouncement(
        failed
          ? "Refresh finished, but part of it failed."
          : `System analytics refreshed at ${formatTime(new Date().toISOString())}.`,
      );
    }
  }, []);

  // A refresh the person or the timer asked for. It marks the page as busy
  // first, which the first load does not need to: the page starts busy.
  const refresh = useCallback(
    (mode: "auto" | "manual") => {
      if (inFlight.current) return;
      setIsRefreshing(true);
      void load(mode);
    },
    [load],
  );

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      await load("initial");
    })();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Refresh once a minute, but only while the tab is visible: a hidden tab
  // polling the API all night helps nobody. Coming back to a stale tab reads
  // straight away instead of showing an old status for up to another minute.
  useEffect(() => {
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        // A manual refresh moments ago has already done this tick's work.
        if (Date.now() - lastFetchedAt.current < REFRESH_INTERVAL_MS / 2) return;
        refresh("auto");
      }, REFRESH_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastFetchedAt.current >= REFRESH_INTERVAL_MS) refresh("auto");
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  if (isLoading) return <p className="control-empty" role="status">Loading system analytics…</p>;

  if (!snapshot && !security) {
    return (
      <div className="overview-page sys-page">
        <header className="overview-heading">
          <h1>System Analytics</h1>
        </header>
        <div className="sys-fatal">
          <SectionError>{snapshotError ?? securityError ?? "No data available."}</SectionError>
          <button
            aria-disabled={isRefreshing}
            className="primary-button sys-refresh"
            onClick={() => refresh("manual")}
            type="button"
          >
            {isRefreshing ? "Trying again…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overview-page sys-page">
      <header className="overview-heading sys-header">
        <div className="sys-header-main">
          <h1>System Analytics</h1>
          <p>Health, storage, usage and security signals for the platform.</p>
        </div>
        <div className="sys-header-tools">
          {snapshot ? (
            <div className="sys-overall">
              <span>Overall</span>
              <StatusBadge status={snapshot.overall} />
            </div>
          ) : null}
          <div className="sys-updated">
            {snapshot ? (
              <>
                Last checked <time dateTime={snapshot.checkedAt}>{formatTime(snapshot.checkedAt)}</time>
              </>
            ) : (
              "Not checked"
            )}
            <small>Refreshes every minute while this tab is open</small>
          </div>
          <button
            aria-disabled={isRefreshing}
            className="primary-button sys-refresh"
            onClick={() => refresh("manual")}
            type="button"
          >
            <InlineIcon>
              <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" />
              <path d="M13.5 2.5v3h-3" />
            </InlineIcon>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      <AlertsStrip
        security={security}
        securityError={securityError}
        snapshot={snapshot}
        snapshotError={snapshotError}
      />

      <section aria-labelledby="sys-health-heading" className="sys-section">
        <div className="overview-card-heading">
          <div>
            <h2 id="sys-health-heading">System health</h2>
            {snapshot ? (
              <p>The server has been running for {formatDuration(snapshot.uptimeSeconds)}.</p>
            ) : null}
          </div>
        </div>
        {snapshotError ? (
          <SectionError>
            Could not refresh the system checks. {snapshotError}
            {snapshot ? ` Showing the result from ${formatTime(snapshot.checkedAt)}.` : ""}
          </SectionError>
        ) : null}
        {snapshot ? (
          snapshot.checks.length === 0 ? (
            <p className="control-empty">No health checks were reported.</p>
          ) : (
            <ul className="sys-grid">
              {snapshot.checks.map((check) => (
                <CheckCard check={check} key={check.key} />
              ))}
            </ul>
          )
        ) : null}
      </section>

      <section aria-labelledby="sys-storage-heading" className="sys-section">
        <div className="overview-card-heading">
          <h2 id="sys-storage-heading">Usage and storage</h2>
        </div>
        {snapshotError && !snapshot ? (
          <p className="control-empty">Usage and storage are not shown because the system checks could not be loaded.</p>
        ) : null}
        {snapshot ? <StorageSection snapshot={snapshot} /> : null}
      </section>

      <section aria-labelledby="sys-security-heading" className="sys-section">
        <div className="overview-card-heading">
          <h2 id="sys-security-heading">Security signals</h2>
        </div>
        {securityError ? (
          <SectionError>
            Could not refresh the security signals. {securityError}
            {security ? " Showing the last result that loaded." : ""}
          </SectionError>
        ) : null}
        {security ? <SecuritySection security={security} /> : null}
      </section>
    </div>
  );
}
