import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import arrowBackIcon from "@/assets/arrow_back.png";
import { coordinatorEventHistory, type CoordinatorEventActivity } from "@/data/coordinator-event-history";
import { coordinatorDirectory } from "@/data/engagement-leaders";

interface CoordinatorActivityPageProps {
  params: Promise<{ coordinatorId: string }>;
}

export default async function CoordinatorActivityPage({ params }: CoordinatorActivityPageProps) {
  const { coordinatorId } = await params;
  const decodedId = decodeURIComponent(coordinatorId);
  const coordinator = coordinatorDirectory.find((candidate) => candidate.id === decodedId);

  if (!coordinator) notFound();

  const events = coordinatorEventHistory[decodedId] ?? [];
  const hostedEvents = events.filter((event) => event.status === "Hosted");
  const cancelledEvents = events.filter((event) => event.status === "Cancelled");

  return (
    <div className="lecturer-activity-page">
      <Link className="profile-back-link" href="/dashboard/analytics">
        <Image alt="" aria-hidden="true" height={14} src={arrowBackIcon} width={14} />
        Back to Analytics
      </Link>
      <header className="lecturer-activity-heading">
        <div className="directory-avatar" aria-hidden="true">
          {coordinator.name.split(" ").slice(-2).map((part) => part[0]).join("")}
        </div>
        <div>
          <h1>{coordinator.name}</h1>
          <p>{coordinator.unit} · {coordinator.eventsHosted} events hosted</p>
        </div>
      </header>

      <div className="lecturer-event-sections">
        <CoordinatorEventSection events={hostedEvents} title="Hosted Events" />
        <CoordinatorEventSection events={cancelledEvents} title="Cancelled Events" />
      </div>
    </div>
  );
}

function CoordinatorEventSection({
  events,
  title,
}: {
  events: readonly CoordinatorEventActivity[];
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
              <p><small>Guest Lecturers</small><strong>{event.guestLecturers}</strong></p>
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
