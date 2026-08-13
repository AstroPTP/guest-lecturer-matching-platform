export type EventFormatName =
  | "Seminar/Lecture"
  | "Case Study"
  | "Interactive Workshop"
  | "Discussion Lead"
  | "AMA Session";

export interface EventFormatMetric {
  label: EventFormatName;
  value: number;
  height: number;
  color: string;
}

export const eventFormats: readonly EventFormatMetric[] = [
  { label: "Seminar/Lecture", value: 22, height: 88, color: "#2563eb" },
  { label: "Case Study", value: 17, height: 68, color: "#7c3aed" },
  { label: "Interactive Workshop", value: 13, height: 52, color: "#0891b2" },
  { label: "Discussion Lead", value: 9, height: 36, color: "#ea580c" },
  { label: "AMA Session", value: 7, height: 28, color: "#16a34a" },
];
