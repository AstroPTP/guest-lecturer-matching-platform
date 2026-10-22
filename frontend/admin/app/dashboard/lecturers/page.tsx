"use client";

import { useEffect, useState } from "react";
import { EngagementDirectory } from "@/components/EngagementDirectory";
import { getLecturers, type LecturerSummary } from "@/services/adminApi";

export default function LecturersPage() {
  const [rows, setRows] = useState<LecturerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await getLecturers();
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
    return <p className="control-empty">Loading guest lecturers…</p>;
  }

  return (
    <EngagementDirectory
      title="Guest lecturers"
      description="Everybody registered as a guest lecturer. Open a profile to deactivate or reactivate it."
      detailLabel="Field"
      primaryMetricLabel="Account"
      secondaryMetricLabel="Last signed in"
      rows={rows.map((row) => ({
        id: row.id,
        name: row.name,
        detail: row.field,
        primaryMetric: row.status,
        secondaryMetric: row.lastSignIn,
        href: `/dashboard/users/${encodeURIComponent(`#GL-${row.id}`)}`,
      }))}
    />
  );
}
