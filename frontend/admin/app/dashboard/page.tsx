"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useState } from "react";
import checkIcon from "@/assets/check.png";
import eventIcon from "@/assets/event.png";
import groupIcon from "@/assets/group.png";
import verifiedUserIcon from "@/assets/verified_user.png";
import {
  dashboardMonthlyRegistrations,
  dashboardSummary,
  recentRegistrations,
  weeklyRegistrations,
} from "@/data/dashboard";
import { VerificationStatus } from "@/types/admin";

const summaryIcons: Record<(typeof dashboardSummary)[number]["key"], StaticImageData> = {
  users: groupIcon,
  approvals: checkIcon,
  matches: verifiedUserIcon,
  events: eventIcon,
};

const verificationStatusClassNames: Record<VerificationStatus, string> = {
  [VerificationStatus.Verified]: "verified",
  [VerificationStatus.UnderReview]: "under-review",
};

export default function Dashboard() {
  const [registrationPeriod, setRegistrationPeriod] = useState<"weekly" | "monthly">("weekly");
  const registrations =
    registrationPeriod === "weekly" ? weeklyRegistrations : dashboardMonthlyRegistrations;

  return (
    <div className="overview-page">
      <header className="overview-heading">
        <h1>Dashboard Overview</h1>
        <p>System-wide performance and user acquisition metrics.</p>
      </header>

      <section className="overview-stats" aria-label="System overview">
        {dashboardSummary.map((item) => (
          <article className="overview-stat" key={item.label}>
            <div className="overview-stat-label">
              <span>{item.label}</span>
              <Image alt="" aria-hidden="true" src={summaryIcons[item.key]} />
            </div>
            <strong>{item.value}</strong>
            <small className={item.label === "Total users" ? "positive" : ""}>{item.detail}</small>
          </article>
        ))}
      </section>

      <section className="overview-content">
        <article className="registration-chart-card">
          <div className="overview-card-heading">
            <div>
              <h2>New registrations</h2>
              <p>{registrationPeriod === "weekly" ? "Daily sign-ups this week" : "Monthly sign-ups across the last 6 months"}</p>
            </div>
            <div className="chart-tabs">
              <button
                aria-pressed={registrationPeriod === "weekly"}
                className={registrationPeriod === "weekly" ? "active" : ""}
                onClick={() => setRegistrationPeriod("weekly")}
                type="button"
              >
                Weekly
              </button>
              <button
                aria-pressed={registrationPeriod === "monthly"}
                className={registrationPeriod === "monthly" ? "active" : ""}
                onClick={() => setRegistrationPeriod("monthly")}
                type="button"
              >
                Monthly
              </button>
            </div>
          </div>
          <div className="bar-chart">
            <div className="bar-grid" />
            <div className={"bars " + (registrationPeriod === "monthly" ? "six-columns" : "")}>
              {registrations.map((registration) => (
                <div className="bar-column" key={registration.label}>
                  <strong>{registration.value}</strong>
                  <span style={{ backgroundColor: registration.color, height: registration.height + "%" }} />
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
            {recentRegistrations.map((registration) => (
              <div className="recent-person" key={registration.name}>
                <span className="person-placeholder" />
                <p>
                  <strong>{registration.name}</strong>
                  <small>{registration.date}</small>
                </p>
                <span
                  className={"verification-status " + verificationStatusClassNames[registration.verificationStatus]}
                >
                  {registration.verificationStatus}
                </span>
              </div>
            ))}
          </div>
          <p className="verification-note">
            14 new registrations are awaiting manual verification for the upcoming semester. <Link href="/dashboard/reviews">Review now →</Link>
          </p>
        </article>
      </section>
    </div>
  );
}
