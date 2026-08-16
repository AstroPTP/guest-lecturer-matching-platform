export const expertiseTopics: string[] = [
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
];

export interface ExperienceLevelOption {
  value: string;
  title: string;
  description: string;
}

export const experienceLevels: ExperienceLevelOption[] = [
  {
    value: "early-career",
    title: "Early Career",
    description: "1–3 years of industry or professional experience.",
  },
  {
    value: "mid-career",
    title: "Mid Career",
    description: "4–7 years of industry or professional experience.",
  },
  {
    value: "senior-professional",
    title: "Senior Professional",
    description: "8–15 years of industry or professional experience.",
  },
  {
    value: "executive-leader",
    title: "Executive / Industry Leader",
    description: "15+ years of experience, or a senior leadership role.",
  },
];
export const deliveryFocusOptions: string[] = ["Seminar/Lecture", "Case Study", "Interactive Workshop", "Discussion Lead", "AMA Session"];

export interface WeekDayOption {
  value: string;
  shortLabel: string;
  label: string;
}
export const weekDays: WeekDayOption[] = [
  { value: "monday", shortLabel: "M", label: "Monday" },
  { value: "tuesday", shortLabel: "T", label: "Tuesday" },
  { value: "wednesday", shortLabel: "W", label: "Wednesday" },
  { value: "thursday", shortLabel: "T", label: "Thursday" },
  { value: "friday", shortLabel: "F", label: "Friday" },
];

export interface SelectOption {
  value: string;
  label: string;
}

export const formatOptions: SelectOption[] = [
  { value: "face-to-face", label: "Face-to-Face" },
  { value: "online", label: "Online" },
  { value: "pre-recorded", label: "Pre-recorded" },
];

export const sessionDurationOptions: SelectOption[] = [
  { value: "30-minutes", label: "30 minutes" },
  { value: "60-minutes", label: "60 minutes" },
  { value: "90-minutes", label: "90 minutes" },
  { value: "2-hours", label: "2 hours" },
  { value: "flexible", label: "Flexible" },
];


export const guestLecturerAudienceSizeOptions: SelectOption[] = [
  { value: "small", label: "Small — up to 30 people" },
  { value: "medium", label: "Medium — 31 to 100 people" },
  { value: "large", label: "Large — more than 100 people" },
  { value: "no-preference", label: "No preference" },
];


export const unitCoordinatorAudienceSizeOptions: SelectOption[] = [
  { value: "small", label: "Small — up to 30 students" },
  { value: "medium", label: "Medium — 31 to 100 students" },
  { value: "large", label: "Large — more than 100 students" },
  { value: "unknown", label: "Not confirmed yet" },
];


export const guestLecturerAvailabilityFrequencyOptions: SelectOption[] = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every fortnight" },
  { value: "monthly", label: "Once a month" },
  { value: "on-request", label: "Available on request" },
];
