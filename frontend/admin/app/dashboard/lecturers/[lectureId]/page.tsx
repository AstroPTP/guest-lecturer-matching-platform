import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import arrowBackIcon from "@/assets/arrow_back.png";
import { guestLecturerDirectory } from "@/data/engagement-leaders";
import { lecturerEventHistory, type LecturerEventParticipation } from "@/data/lecturer-event-history";

interface LecturerActivityPageProps {
  params: Promise<{ lecturerId: string }>;
}

export default async function LecturerActivityPage({ params }: LecturerActivityPageProps) {
  const { lecturerId } = await params;
  const decodedId = decodeURIComponent(lecturerId);
  const lecturer = guestLecturerDirectory.find((candidate) => candidate.id === decodedId);

  if (!lecturer) notFound();

  const events = lecturerEventHistory[decodedId] ?? [];
  const participatedEvents = events.filter((event) => event.status === "Participated");
  const declinedEvents = events.filter((event) => event.status === "Declined");

  return (
    <div className="lecturer-activity-page">
      <Link className="profile-back-link" href="/dashboard/analytics">
        <Image alt="" aria-hidden="true" height={14} src={arrowBackIcon} width={14} />
        Back to Analytics
      </Link>
      <header className="lecturer-activity-heading">
        <div className="directory-avatar" aria-hidden="true">
          {lecturer.name.split(" ").slice(-2).map((part) => part[0]).join("")}
        </div>
        <div>
          <h1>{lecturer.name}</h1>
          <p>{lecturer.expertise} · {lecturer.eventsAttended} events attended</p>
        </div>
      </header>

      <div className="lecturer-event-sections">
        <EventHistorySection events={participatedEvents} title="Participated Events" />
        <EventHistorySection events={declinedEvents} title="Declined Events" />
      </div>
    </div>
  );
}

function EventHistorySection({
  events,
  title,
}: {
  events: readonly LecturerEventParticipation[];
  title: string;
}) {
  return (
    <section className="lecturer-events-card">
      <header><h2>{title}</h2><span>{events.length}</span></header>
      {events.length > 0 ? (
        <div className="lecturer-events-list">
          {events.map((event) => (
            <article key={event.id}>
              <div><strong>{event.title}</strong><small>{event.id} · {event.date}</small></div>
              <span>{event.format}</span>
              <p><small>Unit Coordinator</small><strong>{event.coordinator}</strong></p>
              <b className={`event-participation-status ${event.status.toLowerCase()}`}>{event.status}</b>
            </article>
          ))}
        </div>
      ) : (
        <p className="lecturer-events-empty">No events in this category.</p>
      )}
    </section>
  );
}
