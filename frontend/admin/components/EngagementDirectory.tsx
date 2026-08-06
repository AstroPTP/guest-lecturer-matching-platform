import Image from "next/image";
import Link from "next/link";
import arrowBackIcon from "@/assets/arrow_back.png";

export interface EngagementDirectoryRow {
  id: string;
  name: string;
  detail: string;
  primaryMetric: string;
  secondaryMetric: string;
  href?: string;
}

interface EngagementDirectoryProps {
  title: string;
  description: string;
  detailLabel: string;
  primaryMetricLabel: string;
  secondaryMetricLabel: string;
  rows: readonly EngagementDirectoryRow[];
}

export function EngagementDirectory({
  title,
  description,
  detailLabel,
  primaryMetricLabel,
  secondaryMetricLabel,
  rows,
}: EngagementDirectoryProps) {
  const hasActions = rows.some((row) => row.href);

  return (
    <div className="engagement-directory-page">
      <Link className="profile-back-link" href="/dashboard/analytics">
        <Image alt="" aria-hidden="true" height={14} src={arrowBackIcon} width={14} />
        Back to Analytics
      </Link>
      <header className="engagement-directory-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span>{rows.length} users</span>
      </header>

      <section className="engagement-directory-card">
        <div className="engagement-directory-scroll">
          <table className={`engagement-directory-table${hasActions ? " has-actions" : ""}`}>
            <thead>
              <tr>
                <th>User</th>
                <th>{detailLabel}</th>
                <th>{primaryMetricLabel}</th>
                <th>{secondaryMetricLabel}</th>
                {hasActions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="directory-user">
                      <span className="directory-avatar" aria-hidden="true">
                        {row.name.split(" ").slice(-2).map((part) => part[0]).join("")}
                      </span>
                      <p><strong>{row.name}</strong><small>ID: {row.id}</small></p>
                    </div>
                  </td>
                  <td>{row.detail}</td>
                  <td><strong>{row.primaryMetric}</strong></td>
                  <td><strong>{row.secondaryMetric}</strong></td>
                  {hasActions && (
                    <td className="engagement-directory-action">
                      {row.href && <Link href={row.href}>View</Link>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
