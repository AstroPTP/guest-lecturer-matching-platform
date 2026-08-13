/**
 * Option lists shared between the Unit Coordinator onboarding forms
 * ("components/unit_coordinator/*Form.tsx") and the My Profile edit page
 * ("app/unit_coordinator/my_profile/page.tsx"). Verified identical in
 * both places before being centralized here.
 */

import type { SelectOption } from "@/constants/profileOptions/shared";

export const schoolDepartmentOptions: SelectOption[] = [
  {
    value: "accounting-economics-finance",
    label: "School of Accounting, Economics and Finance",
  },
  {
    value: "management-marketing",
    label: "School of Management and Marketing",
  },
  { value: "business-law", label: "Curtin Law School" },
  {
    value: "information-systems",
    label: "Information Systems and Business Analytics",
  },
  { value: "other", label: "Other Faculty of Business and Law area" },
];

export const academicRoleOptions: SelectOption[] = [
  { value: "unit-coordinator", label: "Unit Coordinator" },
  { value: "course-coordinator", label: "Course Coordinator" },
  { value: "lecturer", label: "Lecturer" },
  { value: "senior-lecturer", label: "Senior Lecturer" },
  { value: "associate-professor", label: "Associate Professor" },
  { value: "professor", label: "Professor" },
  { value: "academic-lead", label: "Academic Lead" },
];


export const formatOptions: SelectOption[] = [
  { value: "face-to-face", label: "Face-to-Face" },
  { value: "online", label: "Online" },
  { value: "pre-recorded", label: "Pre-recorded" },
];

export const engagementFrequencyOptions: SelectOption[] = [
  { value: "one-off", label: "One-off engagement" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "multiple-dates", label: "Multiple dates during semester" },
  { value: "not-confirmed", label: "Not confirmed yet" },
];
