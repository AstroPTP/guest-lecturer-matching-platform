interface SectionPlaceholderProps {
  title: string;
  description: string;
  /** Why the section is not in this release, in plain words for the client. */
  reason?: string;
}

/**
 * A section held back until the client confirms it is wanted.
 *
 * The client asked for the administrator role to be kept minimal, so anything
 * beyond the agreed metrics waits for an explicit yes rather than being
 * shipped by default.
 */
export function SectionPlaceholder({ title, description, reason }: SectionPlaceholderProps) {
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Admin workspace</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <section className="panel empty-state">
        <span>Awaiting client decision</span>
        <h2>{title} is not part of this release.</h2>
        <p>
          {reason ??
            "The client asked for the administrator role to be kept minimal, so this section is held back until it is confirmed as wanted."}
        </p>
      </section>
    </>
  );
}
