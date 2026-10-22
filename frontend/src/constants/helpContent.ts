import type { UserRole } from "@/types/shared/userRole";

/**
 * The words on the in-app Help page, kept apart from the layout so they can be
 * updated as features change without touching any component.
 *
 * Every step and answer describes what the application does today. Where a
 * feature behaves differently for the two roles, each role has its own text.
 */

export interface HelpStep {
  title: string;
  detail: string;
}

export interface HelpGuide {
  title: string;
  steps: string[];
}

export interface HelpFaq {
  question: string;
  answer: string;
}

export interface HelpContent {
  intro: string;
  journey: HelpStep[];
  guides: HelpGuide[];
  faqs: HelpFaq[];
}

const sharedFaqs: HelpFaq[] = [
  {
    question: "I didn't receive my verification code. What should I do?",
    answer:
      "Check your junk or spam folder first. If it is not there, use Resend code on the verification screen to send a new one.",
  },
  {
    question: "I forgot my password.",
    answer:
      "On the sign-in page, choose Forgot password? and follow the steps.",
  },
  {
    question: "Who can see my profile?",
    answer:
      "Only people signed in to the platform: guest lecturers see unit coordinators, unit coordinators see guest lecturers, and the CCAE administrators can see every account.",
  },
  {
    question: "How do I change my password or email details?",
    answer: "Open Settings. Account holds your details, and Password & Security lets you change your password.",
  },
  {
    question: "How do I get notifications on my phone or computer?",
    answer:
      "Open Settings and choose Notifications, then turn them on for this device. On an iPhone or iPad, first tap Share and Add to Home Screen, open GLMP from the Home Screen, then turn them on (iOS 16.4 or later). On Android, use Install app from the browser menu, then allow notifications. On a computer, click Allow when your browser asks. If Notifications is not in Settings, they are not switched on for this site yet.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Open Settings and choose Delete Account. This cannot be undone: your profile, matches and messages are removed.",
  },
];

const guestLecturer: HelpContent = {
  intro:
    "Share your industry experience with Curtin students. Build a profile once, then connect with unit coordinators looking for guest lecturers in your area.",
  journey: [
    { title: "Register", detail: "Create an account and choose Guest Lecturer." },
    { title: "Verify", detail: "Enter the code sent to your email." },
    { title: "Build your profile", detail: "Your background, expertise, availability and consent." },
    { title: "Discover", detail: "Express interest in unit coordinators you would like to work with." },
    { title: "Match", detail: "When you both express interest, you are matched." },
    { title: "Lecture", detail: "Message the coordinator and accept their event invitation." },
  ],
  guides: [
    {
      title: "Complete or update your profile",
      steps: [
        "Open My Profile from the menu.",
        "Edit any section: basic information, expertise, engagement preferences or consent.",
        "Save each section. Coordinators see the updated profile straight away.",
      ],
    },
    {
      title: "Find unit coordinators",
      steps: [
        "Open Discovery to see unit coordinators and the units they teach.",
        "Express interest in a coordinator you would like to work with, or dismiss one that is not a fit.",
        "Use Filters to narrow the list by field, expertise topics, delivery format, available days or location, then choose Apply Filters.",
        "Changed your mind? Open Dismissed Profiles to restore a coordinator or express interest after all.",
      ],
    },
    {
      title: "See your matches",
      steps: [
        "Open Match. A coordinator appears here once you have both expressed interest.",
        "Use the search box to find a match by name or topic.",
        "Open a matched profile to see their full details.",
      ],
    },
    {
      title: "Message a coordinator",
      steps: [
        "Open Message and choose a matched coordinator.",
        "Type your message and send it. Messages are only available between matched users.",
      ],
    },
    {
      title: "Respond to an event invitation",
      steps: [
        "When a coordinator invites you to give a guest lecture, it appears under Event.",
        "Review the title, date, time and location.",
        "Accept or decline. Completed, declined and cancelled events stay in your history.",
      ],
    },
  ],
  faqs: [
    {
      question: "Why can't I message a coordinator yet?",
      answer: "Messaging opens once you are matched, which happens when you have both expressed interest.",
    },
    {
      question: "I dismissed a coordinator by mistake.",
      answer: "In Discovery, open Dismissed Profiles. You can restore them or express interest from there.",
    },
    {
      question: "How do I accept a session?",
      answer:
        "When a coordinator invites you, a session card appears in your chat with them, and the invitation also shows under Event. Check the date, time and place, then choose Accept or Decline.",
    },
    {
      question: "How do I add it to my calendar?",
      answer:
        "Once you have accepted, choose Add to calendar on the session card. You can download a file that opens in Outlook, Apple Calendar or Google Calendar, or open the session straight in Google Calendar. Times are Perth time.",
    },
    ...sharedFaqs,
  ],
};

const unitCoordinator: HelpContent = {
  intro:
    "Find industry guest lecturers for your units. Describe what your unit needs, then connect with lecturers whose expertise fits.",
  journey: [
    { title: "Register", detail: "Create an account and choose Unit Coordinator." },
    { title: "Verify", detail: "Enter the code sent to your email." },
    { title: "Describe your unit", detail: "Your unit, the expertise it needs and your preferences." },
    { title: "Discover", detail: "Express interest in guest lecturers who suit your unit." },
    { title: "Match", detail: "When you both express interest, you are matched." },
    { title: "Invite", detail: "Message the lecturer and send an event invitation." },
  ],
  guides: [
    {
      title: "Complete or update your profile",
      steps: [
        "Open My Profile from the menu.",
        "Edit any section: basic information, the expertise your unit needs, engagement preferences or consent.",
        "Save each section. Guest lecturers see the updated profile straight away.",
      ],
    },
    {
      title: "Find guest lecturers",
      steps: [
        "Open Discovery to see guest lecturers and their expertise.",
        "Express interest in a lecturer who suits your unit, or dismiss one that is not a fit.",
        "Use Filters to narrow the list by expertise topics, delivery format, session duration, audience size, available days or location, then choose Apply Filters.",
        "Changed your mind? Open Dismissed Profiles to restore a lecturer or express interest after all.",
      ],
    },
    {
      title: "See your matches",
      steps: [
        "Open Match. A lecturer appears here once you have both expressed interest.",
        "Use the search box to find a match by name or topic.",
        "Open a matched profile to see their full details.",
      ],
    },
    {
      title: "Invite a lecturer to an event",
      steps: [
        "Open Event and choose to create an event.",
        "Select a matched guest lecturer. Only matched lecturers can be invited.",
        "Enter the event title, description, date, start and end time, and location, then choose Send Invitation.",
        "Track the reply under Event. You can mark an event as completed or cancel it.",
      ],
    },
    {
      title: "Message a lecturer",
      steps: [
        "Open Message and choose a matched lecturer.",
        "Type your message and send it. Messages are only available between matched users.",
      ],
    },
  ],
  faqs: [
    {
      question: "Why can't I invite a lecturer to an event?",
      answer:
        "Events can only be sent to matched lecturers. Express interest in Discovery; once they express interest too, they appear in the event form.",
    },
    {
      question: "The end time is rejected.",
      answer: "The end time must be later than the start time. Adjust either and send the invitation again.",
    },
    {
      question: "How do I schedule a session from the chat?",
      answer:
        "Open Message and choose a matched lecturer, then choose Schedule a session. The form is filled in from your profile and theirs. Add the date and start time, change anything you like, and choose Send Invitation. The session then appears as a card in the chat.",
    },
    {
      question: "How do I add a session to my calendar?",
      answer:
        "When the lecturer accepts, the card shows Confirmed. Choose Add to calendar on the card in the chat, or under Event. You can download a file that opens in Outlook, Apple Calendar or Google Calendar, or open the session straight in Google Calendar. Times are Perth time.",
    },
    ...sharedFaqs,
  ],
};

export const HELP_CONTENT: Record<Exclude<UserRole, "ccaeAdmin">, HelpContent> = {
  guestLecturer,
  unitCoordinator,
};
