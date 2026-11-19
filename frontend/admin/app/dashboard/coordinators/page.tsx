"use client";

import { useEffect, useState } from "react";
import { EngagementDirectory } from "@/components/EngagementDirectory";
import { facultyLabel } from "@/lib/faculty_labels";
import { getCoordinators, type CoordinatorSummary } from "@/services/adminApi";

export default function CoordinatorsPage() {
  const [rows, setRows] = useState<CoordinatorSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await getCoordinators();
        if (active) setRows(data);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return <p className="control-empty">Loading coordinators…</p>;
  }

  return (
    <EngagementDirectory
      title="Unit coordinators"
      description="Every unit coordinator, with the contact requests they have sent."
      detailLabel="Faculty"
      primaryMetricLabel="Requests sent"
      secondaryMetricLabel="Accepted"
      rows={rows.map((row) => ({
        id: row.id,
        name: row.name,
        detail: facultyLabel(row.faculty),
        primaryMetric: String(row.requests),
        secondaryMetric: String(row.accepted),
        href: row.userId ? `/dashboard/users/${encodeURIComponent(`#UC-${row.userId}`)}` : undefined,
      }))}
    />
  );
}
