export const analyticsStats = [
  { key: "matches", label: "Match success rate", value: "81%" },
  { key: "acceptance", label: "Event acceptance rate", value: "72%" },
  { key: "lecturers", label: "Active guest lecturers", value: "38" },
  { key: "events", label: "Events created", value: "64" },
] as const;

export const monthlyRegistrations = [
  { label: "Feb", value: 46, height: 52, color: "#93c5fd" },
  { label: "Mar", value: 58, height: 65, color: "#60a5fa" },
  { label: "Apr", value: 51, height: 58, color: "#38bdf8" },
  { label: "May", value: 73, height: 82, color: "#2dd4bf" },
  { label: "Jun", value: 68, height: 76, color: "#818cf8" },
  { label: "Jul", value: 89, height: 100, color: "#2563eb" },
] as const;

export const eventFunnel = [
  { label: "Created", value: 64, width: 100, color: "#2563eb" },
  { label: "Sent", value: 52, width: 81, color: "#f59e0b" },
  { label: "Accepted", value: 37, width: 58, color: "#16a34a" },
] as const;
