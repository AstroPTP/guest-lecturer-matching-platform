"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import checkIcon from "@/assets/check.png";
import eventIcon from "@/assets/event.png";
import groupIcon from "@/assets/group.png";
import verifiedUserIcon from "@/assets/verified_user.png";
import { getOverview, withHeights, type AdminOverview } from "@/services/adminApi";

type SummaryKey = "profiles" | "signIns" | "contacts" | "matches";

const ROLE_LABELS: Record<string, string> = {
  guest_speaker: "guest lecturer",
  unit_coordinator: "unit coordinator",
  ccae_admin: "administrator",
};

const summaryIcons: Record<SummaryKey, StaticImageData> = {
  profiles: groupIcon,
  signIns: checkIcon,
  contacts: eventIcon,
  matches: verifiedUserIcon,
};

/**
 * The administrator dashboard.
 *
 * The four headline figures are the ones the client asked for: profiles
 * created, users who have signed in, contacts made, and matches made. All are
 * counted from the database.
 */
export default function Dashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await getOverview();
        if (!active) return;
        setOverview(data);
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "The dashboard could not be loaded.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return <p className="control-empty">Loading dashboard…</p>;
  }

  if (errorMessage || !overview) {
    return <p className="control-empty">{errorMessage ?? "No data available."}</p>;
  }

  const summary: { key: SummaryKey; label: string; value: string; detail: string }[] = [
    {
      key: "profiles",
      label: "Profiles created",
      value: String(overview.profiles.created),
      detail: `${overview.people.guestSpeakers} lecturers, ${overview.people.unitCoordinators} coordinators`,
    },
    {
      key: "signIns",
      label: "Signed in, last 30 days",
      value: String(overview.signIns.last30Days),
      detail: `of ${overview.people.active} active accounts`,
    },
    {
      key: "contacts",
      label: "Contacts made",
      value: String(overview.contacts.raised),
      detail: `${overview.contacts.pending} awaiting a reply`,
    },
    {
      key: "matches",
      label: "Matches made",
      value: String(overview.contacts.accepted),
      detail: `${overview.contacts.acceptanceRate}% of contacts accepted`,
    },
  ];

  const registrations = withHeights(
    overview.registrationsByWeek.map((week) => ({ label: week.label, value: week.count })),
  );

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Dashboard Overview</h1>
        <p>System-wide performance and user acquisition metrics.</p>
      </header>

      <section className="overview-stats" aria-label="System overview">
        {summary.map((item) => (
          <article className="overview-stat" key={item.label}>
            <div className="overview-stat-label">
              <span>{item.label}</span>
              <Image alt="" aria-hidden="true" src={summaryIcons[item.key]} />
            </div>
            <strong>{item.value}</strong>
            <small className={item.key === "profiles" ? "positive" : ""}>{item.detail}</small>
          </article>
        ))}
      </section>

      <section className="overview-content">
        <article className="registration-chart-card">
          <div className="overview-card-heading">
            <div>
              <h2>New registrations</h2>
              <p>Sign-ups per week over the last eight weeks</p>
            </div>
          </div>
          <div className="bar-chart">
            <div className="bar-grid" />
            <div className="bars" style={{ gridTemplateColumns: `repeat(${registrations.length}, 1fr)` }}>
              {registrations.map((registration) => (
                <div className="bar-column" key={registration.label}>
                  <strong>{registration.value}</strong>
                  <span
                    style={{
                      backgroundColor: registration.color,
                      // Sized against the busiest week. The API returns counts;
                      // the bars need a percentage or they all render at zero.
                      height: registration.height + "%",
                    }}
                  />
                  <small>{registration.label}</small>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="recent-card">
          <div className="overview-card-heading">
            <h2>
              Recent
              <br />
              registrations
            </h2>
            <Link className="view-all" href="/dashboard/users">
              View
              <br />
              All
            </Link>
          </div>
          <div className="recent-list">
            {overview.recentRegistrations.length === 0 ? (
              <p className="control-empty">Nobody has registered yet.</p>
            ) : (
              overview.recentRegistrations.map((registration) => (
                <div className="recent-person" key={registration.id}>
                  <span className="person-placeholder" />
                  <p>
                    <strong>{registration.email || "Unnamed"}</strong>
                    <small>
                      {registration.registeredAt
                        ? new Date(registration.registeredAt).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                          })
                        : "Date unknown"}
                    </small>
                  </p>
                  <span className="verification-status under-review">
                    {ROLE_LABELS[registration.role] ?? registration.role.replace(/_/g, " ")}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="verification-note">
            {overview.profiles.createdLast30Days} profile
            {overview.profiles.createdLast30Days === 1 ? "" : "s"} created in the last 30 days.{" "}
            <Link href="/dashboard/analytics">Full usage report →</Link>
          </p>
        </article>
      </section>
    </div>
  );
}
