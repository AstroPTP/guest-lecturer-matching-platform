import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import analyticsIcon from "@/assets/analytics.png";
import groupIcon from "@/assets/group.png";
import historyIcon from "@/assets/history.png";
import verifiedUserIcon from "@/assets/verified_user.png";
import {
  analyticsStats,
  eventFunnel,
  monthlyRegistrations,
} from "@/data/analytics";
import { mostActiveGuestLecturers, topCoordinatorEngagement } from "@/data/engagement_leaders";
import { eventFormats } from "@/data/event_formats";
import { topRequestedExpertise } from "@/data/expertise_topics";

const statIcons: Record<(typeof analyticsStats)[number]["key"], StaticImageData> = {
  matches: verifiedUserIcon,
  acceptance: analyticsIcon,
  lecturers: groupIcon,
  events: historyIcon,
};

const createdEvents = eventFunnel.find((stage) => stage.label === "Created")?.value ?? 0;
const acceptedEvents = eventFunnel.find((stage) => stage.label === "Accepted")?.value ?? 0;
const createdToAcceptedRate =
  createdEvents > 0 ? Math.round((acceptedEvents / createdEvents) * 100) : 0;

export default function AnalyticsPage() {
  return (
    <div className="analytics-page">
      <header className="analytics-heading">
        <h1>Platform Analytics</h1>
        <p>Event outcomes and lecturer demand for the current semester.</p>
      </header>

      <section className="analytics-stats" aria-label="Analytics summary">
        {analyticsStats.map((stat) => (
          <article key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <Image alt="" aria-hidden="true" src={statIcons[stat.key]} />
            </div>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="analytics-charts">
        <article className="analytics-card event-funnel-card">
          <header>
            <h2>Event conversion</h2>
            <span className="chart-header-unit">Units: events</span>
            <p>Created → Sent → Accepted</p>
          </header>
          <div className="event-funnel">
            {eventFunnel.map((stage) => (
              <div className="funnel-row" key={stage.label}>
                <span>{stage.label}</span>
                <div>
                  <i style={{ backgroundColor: stage.color, width: stage.width + "%" }} />
                </div>
                <strong>{stage.value}</strong>
              </div>
            ))}
          </div>
          <footer>
            <strong>{createdToAcceptedRate}%</strong>
            <span>of created events were accepted</span>
          </footer>
        </article>

        <article className="analytics-card discipline-card">
          <header>
            <h2>Events by format</h2>
            <span className="chart-header-unit">Units: events</span>
            <p>Activity mix across the Faculty of Business and Law</p>
          </header>
          <div className="discipline-chart">
            {eventFormats.map((format) => (
              <div className="discipline-column" key={format.label}>
                <div className="discipline-value-area">
                  <div className="discipline-bar-stack" style={{ height: format.height + "%" }}>
                    <strong>{format.value}</strong>
                    <i style={{ backgroundColor: format.color }} />
                  </div>
                </div>
                <span>{format.label}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="analytics-charts">
        <article className="analytics-card">
          <header>
            <h2>Monthly registrations</h2>
            <span className="chart-header-unit">Units: users</span>
            <p>New account sign-ups across the last 6 months</p>
          </header>
          <div className="bar-chart">
            <div className="bar-grid" />
            <div className="bars">
              {monthlyRegistrations.map((month) => (
                <div className="bar-column" key={month.label}>
                  <strong>{month.value}</strong>
                  <span style={{ backgroundColor: month.color, height: month.height + "%" }} />
                  <small>{month.label}</small>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="analytics-card">
          <header>
            <h2>Top requested expertise</h2>
            <span className="chart-header-unit">Units: requests</span>
            <p>Most requested topics across all coordinator requests this semester</p>
          </header>
          <div className="discipline-chart">
            {topRequestedExpertise.map((topic) => (
              <div className="discipline-column" key={topic.label}>
                <div className="discipline-value-area">
                  <div className="discipline-bar-stack" style={{ height: topic.height + "%" }}>
                    <strong>{topic.value}</strong>
                    <i style={{ backgroundColor: topic.color }} />
                  </div>
                </div>
                <span>{topic.label}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="analytics-actions">
        <article className="analytics-card engagement-ranking-card">
          <header>
            <h2>Most active guest lecturers</h2>
            <p>Guest lecturers with the highest event participation this semester</p>
          </header>
          <div className="engagement-ranking-list">
            {mostActiveGuestLecturers.map((lecturer) => (
              <div key={lecturer.name}>
                <span className="lecturer-initials">
                  {lecturer.name.split(" ").slice(-2).map((part) => part[0]).join("")}
                </span>
                <p>
                  <strong>{lecturer.name}</strong>
                  <small>{lecturer.expertise}</small>
                </p>
                <span>
                  <b>{lecturer.eventsAttended}</b> events
                </span>
                <span>
                  <b>{lecturer.participationRate}%</b> attended
                </span>
                <Link href={`/dashboard/lecturers/${encodeURIComponent(lecturer.id)}`}>View</Link>
              </div>
            ))}
          </div>
          <Link className="directory-link" href="/dashboard/lecturers">View lecturer directory</Link>
        </article>

        <article className="analytics-card engagement-ranking-card">
          <header>
            <h2>Top unit coordinators</h2>
            <p>Coordinators with the highest guest lecturer participation</p>
          </header>
          <div className="engagement-ranking-list">
            {topCoordinatorEngagement.map((coordinator) => {
              return (
                <div key={coordinator.name}>
                  <span className="lecturer-initials">
                    {coordinator.name
                      .split(" ")
                      .slice(-2)
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <p>
                    <strong>{coordinator.name}</strong>
                    <small>{coordinator.unit}</small>
                  </p>
                  <span><b>{coordinator.guestLecturers}</b> lecturers</span>
                  <span><b>{coordinator.eventsHosted}</b> events</span>
                  <Link href={`/dashboard/coordinators/${encodeURIComponent(coordinator.id)}`}>View</Link>
                </div>
              );
            })}
          </div>
          <Link className="directory-link" href="/dashboard/coordinators">View coordinator directory</Link>
        </article>
      </section>
    </div>
  );
}
