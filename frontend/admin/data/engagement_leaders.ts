export interface GuestLecturerParticipation {
  id: string;
  name: string;
  expertise: string;
  eventsAttended: number;
  participationRate: number;
}

export interface CoordinatorLecturerEngagement {
  id: string;
  name: string;
  unit: string;
  guestLecturers: number;
  eventsHosted: number;
}

export const guestLecturerDirectory: readonly GuestLecturerParticipation[] = [
  { id: "#GL-4108", name: "Dr. Elena Rodriguez", expertise: "Business Ethics", eventsAttended: 14, participationRate: 93 },
  { id: "#GL-3850", name: "Marcus Thorne", expertise: "Finance & Investment", eventsAttended: 12, participationRate: 88 },
  { id: "#GL-4042", name: "Ava Mitchell", expertise: "Marketing Strategy", eventsAttended: 10, participationRate: 83 },
  { id: "#GL-4921", name: "Michael Fernando", expertise: "Business Analytics", eventsAttended: 9, participationRate: 82 },
  { id: "#GL-5027", name: "Sofia Chen", expertise: "Corporate Governance", eventsAttended: 8, participationRate: 80 },
  { id: "#GL-5173", name: "Ryan Cole", expertise: "International Business", eventsAttended: 7, participationRate: 78 },
  { id: "#GL-5234", name: "Nadia Patel", expertise: "ESG & Sustainability", eventsAttended: 6, participationRate: 75 },
];

export const coordinatorDirectory: readonly CoordinatorLecturerEngagement[] = [
  { id: "#UC-1048", name: "Jordan Lee", unit: "Business Strategy", guestLecturers: 18, eventsHosted: 9 },
  { id: "#UC-1102", name: "Dr. Sarah Jenkins", unit: "Management", guestLecturers: 15, eventsHosted: 8 },
  { id: "#UC-1186", name: "Priya Nair", unit: "Business Analytics", guestLecturers: 12, eventsHosted: 7 },
  { id: "#UC-1214", name: "Daniel Wong", unit: "Finance", guestLecturers: 10, eventsHosted: 6 },
  { id: "#UC-1261", name: "Olivia Martin", unit: "Corporate Law", guestLecturers: 9, eventsHosted: 5 },
  { id: "#UC-1305", name: "Nathan Brooks", unit: "Economics", guestLecturers: 7, eventsHosted: 4 },
];

export const mostActiveGuestLecturers = guestLecturerDirectory.slice(0, 4);
export const topCoordinatorEngagement = coordinatorDirectory.slice(0, 4);
