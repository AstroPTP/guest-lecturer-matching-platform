export const expertiseTopics = [
  "Accounting",
  "Banking & Finance",
  "Business Analytics",
  "Business Ethics",
  "Corporate Governance",
  "Corporate Law",
  "Economics",
  "Employment Law",
  "Entrepreneurship",
  "Finance & Investment",
  "Human Resource Management",
  "International Business",
  "International Trade Law",
  "Management",
  "Marketing Strategy",
  "Risk Management",
  "Taxation Law",
  "ESG & Sustainability",
] as const;

export type ExpertiseTopic = (typeof expertiseTopics)[number];

export interface ExpertiseTopicMetric {
  label: ExpertiseTopic;
  value: number;
  height: number;
  color: string;
}

export const topRequestedExpertise: readonly ExpertiseTopicMetric[] = [
  { label: "Marketing Strategy", value: 34, height: 100, color: "#2563eb" },
  { label: "Management", value: 31, height: 91, color: "#7c3aed" },
  { label: "Business Analytics", value: 27, height: 79, color: "#0891b2" },
  { label: "Entrepreneurship", value: 24, height: 71, color: "#ea580c" },
  { label: "Finance & Investment", value: 19, height: 56, color: "#16a34a" },
];
