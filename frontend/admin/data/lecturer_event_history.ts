export type EventParticipationStatus = "Participated" | "Declined";

export interface LecturerEventParticipation {
  id: string;
  title: string;
  date: string;
  format: string;
  coordinator: string;
  status: EventParticipationStatus;
}

export const lecturerEventHistory: Readonly<Record<string, readonly LecturerEventParticipation[]>> = {
  "#GL-4108": [
    { id: "EV-2041", title: "Ethical Leadership in Practice", date: "18 Jul 2026", format: "Interactive Workshop", coordinator: "Jordan Lee", status: "Participated" },
    { id: "EV-1988", title: "Corporate Responsibility Forum", date: "02 Jul 2026", format: "Discussion Lead", coordinator: "Dr. Sarah Jenkins", status: "Participated" },
    { id: "EV-1914", title: "Governance and Risk Panel", date: "12 Jun 2026", format: "AMA Session", coordinator: "Priya Nair", status: "Declined" },
  ],
  "#GL-3850": [
    { id: "EV-2056", title: "Investment Decisions Under Pressure", date: "22 Jul 2026", format: "Case Study", coordinator: "Daniel Wong", status: "Participated" },
    { id: "EV-1962", title: "Finance Industry Insights", date: "25 Jun 2026", format: "Seminar/Lecture", coordinator: "Jordan Lee", status: "Participated" },
    { id: "EV-1895", title: "Sustainable Finance Roundtable", date: "05 Jun 2026", format: "Discussion Lead", coordinator: "Olivia Martin", status: "Declined" },
  ],
  "#GL-4042": [
    { id: "EV-2033", title: "Building a Modern Brand", date: "15 Jul 2026", format: "Interactive Workshop", coordinator: "Priya Nair", status: "Participated" },
    { id: "EV-1947", title: "Customer Strategy Case Lab", date: "20 Jun 2026", format: "Case Study", coordinator: "Jordan Lee", status: "Participated" },
    { id: "EV-1879", title: "Digital Campaign AMA", date: "29 May 2026", format: "AMA Session", coordinator: "Dr. Sarah Jenkins", status: "Declined" },
  ],
  "#GL-4921": [
    { id: "EV-2018", title: "Analytics for Business Decisions", date: "10 Jul 2026", format: "Seminar/Lecture", coordinator: "Priya Nair", status: "Participated" },
    { id: "EV-1931", title: "Data Storytelling Workshop", date: "18 Jun 2026", format: "Interactive Workshop", coordinator: "Daniel Wong", status: "Participated" },
    { id: "EV-1864", title: "AI in Business Discussion", date: "23 May 2026", format: "Discussion Lead", coordinator: "Jordan Lee", status: "Declined" },
  ],
};
