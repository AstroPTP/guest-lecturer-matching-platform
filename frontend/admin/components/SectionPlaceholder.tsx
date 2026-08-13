interface SectionPlaceholderProps {
  title: string;
  description: string;
}

export function SectionPlaceholder({ title, description }: SectionPlaceholderProps) {
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
        <span>Coming next</span>
        <h2>{title} is ready to connect.</h2>
        <p>The route and layout are in place. Connect the corresponding admin API before adding production data and actions.</p>
      </section>
    </>
  );
}
