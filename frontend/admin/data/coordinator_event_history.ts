export type CoordinatorEventStatus = "Hosted" | "Cancelled";

export interface CoordinatorEventActivity {
  id: string;
  title: string;
  date: string;
  format: string;
  guestLecturers: number;
  status: CoordinatorEventStatus;
}

export const coordinatorEventHistory: Readonly<Record<string, readonly CoordinatorEventActivity[]>> = {
  "#UC-1048": [
    { id: "EV-2041", title: "Ethical Leadership in Practice", date: "18 Jul 2026", format: "Interactive Workshop", guestLecturers: 4, status: "Hosted" },
    { id: "EV-1962", title: "Finance Industry Insights", date: "25 Jun 2026", format: "Seminar/Lecture", guestLecturers: 5, status: "Hosted" },
    { id: "EV-1864", title: "AI in Business Discussion", date: "23 May 2026", format: "Discussion Lead", guestLecturers: 3, status: "Cancelled" },
  ],
  "#UC-1102": [
    { id: "EV-1988", title: "Corporate Responsibility Forum", date: "02 Jul 2026", format: "Discussion Lead", guestLecturers: 4, status: "Hosted" },
    { id: "EV-1879", title: "Digital Campaign AMA", date: "29 May 2026", format: "AMA Session", guestLecturers: 3, status: "Hosted" },
    { id: "EV-1812", title: "People Management Forum", date: "08 May 2026", format: "Case Study", guestLecturers: 2, status: "Cancelled" },
  ],
  "#UC-1186": [
    { id: "EV-2033", title: "Building a Modern Brand", date: "15 Jul 2026", format: "Interactive Workshop", guestLecturers: 3, status: "Hosted" },
    { id: "EV-2018", title: "Analytics for Business Decisions", date: "10 Jul 2026", format: "Seminar/Lecture", guestLecturers: 4, status: "Hosted" },
  ],
  "#UC-1214": [
    { id: "EV-2056", title: "Investment Decisions Under Pressure", date: "22 Jul 2026", format: "Case Study", guestLecturers: 3, status: "Hosted" },
    { id: "EV-1931", title: "Data Storytelling Workshop", date: "18 Jun 2026", format: "Interactive Workshop", guestLecturers: 2, status: "Hosted" },
  ],
};
