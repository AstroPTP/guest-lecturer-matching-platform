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
  /** Shown only while that feature is switched on, so the Help never describes something that is not there. */
  feature?: "suggestions";
}

/** A short explainer for one feature, shown as a list of plain sentences. */
export interface HelpSection {
  title: string;
  lines: string[];
}

export interface HelpContent {
  intro: string;
  journey: HelpStep[];
  guides: HelpGuide[];
  /** Shown only when the feature it describes is switched on. */
  suggestions?: HelpSection;
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
      question: "How do coordinators find me?",
      answer:
        "They can browse Discovery, or, while CCAE has ranked matching switched on (it is off by default), ask Suggested speakers for lecturers who suit a session. Your topics, availability and profile decide whether you appear.",
      feature: "suggestions",
    },
    {
      question: "How can I be suggested more often?",
      answer:
        "Keep your topics and availability up to date. Add every topic you can speak on, and the days and hours you are free.",
      feature: "suggestions",
    },
    {
      question: "Will I still be suggested if I was invited recently?",
      answer: "Yes, just a little lower, so others get a turn.",
      feature: "suggestions",
    },
    {
      question: "Who can see my details?",
      answer:
        "Only signed-in unit coordinators and the CCAE administrators. A suggestion shows your name, role, photo and shared topics, plus broad ranges for how recently and how often you have had a session, but never your email.",
      feature: "suggestions",
    },
    {
      question: "I dismissed a coordinator by mistake.",
      answer: "In Discovery, open Dismissed Profiles. You can restore them or express interest from there.",
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
  suggestions: {
    title: "Suggested speakers",
    lines: [
      "Suggested speakers is an option CCAE can turn on, and it is off by default. You are seeing this because it is on. It is a ranked shortlist of guest lecturers. You can enter a date, a time and the topics you need, or leave any of them blank: with no topics it uses your own expertise, and with no date or time any time suits.",
      "A lecturer is listed only when four things are true: they are eligible (a finished profile, consent to be matched, and not someone you dismissed or unmatched), they are available for the date and time you gave, they share at least one of your topics, and they pass the reliability check (not measured yet, so everyone passes for now).",
      "Lecturers who pass are ranked by a score: fit counts most, then time since last session, then fewer sessions so far.",
      "Nobody is hidden for being popular. A lecturer with many sessions simply ranks lower, and moves back up as time passes.",
      "The line above the list shows how many lecturers passed each rule, so you can see where the list narrowed. If it is empty, try a different time, a nearby date or more topics.",
      "To act on a suggestion, choose Express interest. Once you are matched, invite the lecturer from Event.",
    ],
  },
  faqs: [
    {
      question: "Why can't I invite a lecturer to an event?",
      answer:
        "Events can only be sent to matched lecturers. Express interest in Discovery; once they express interest too, they appear in the event form.",
    },
    {
      question: "What is Suggested speakers?",
      answer:
        "An option CCAE can turn on, off by default. While it is on, it gives you a shortlist of guest lecturers who could suit one of your sessions, best match first. Give it a date, time and topics, or leave them blank to use your own expertise.",
      feature: "suggestions",
    },
    {
      question: "Why is someone near the top?",
      answer:
        "They match your topics best. Lecturers who have waited longer, or been invited less often, also rank a little higher so everyone gets a turn.",
      feature: "suggestions",
    },
    {
      question: "Why can't I see a speaker I know?",
      answer:
        "They may be unavailable at that time, not cover your topics, not have finished their profile, or be someone you dismissed or ended a match with. Try another time or fewer topics, or look for them in Discovery.",
      feature: "suggestions",
    },
    {
      question: "Do I have to use it?",
      answer:
        "No. Discovery works as it always has, and Suggested speakers is just another way to find people while CCAE has it on.",
      feature: "suggestions",
    },
    {
      question: "What happens after I press Express interest?",
      answer:
        "Your interest is saved. If the lecturer has already shown interest in you, you are matched straight away; otherwise you are matched when they show interest back.",
      feature: "suggestions",
    },
    {
      question: "The end time is rejected.",
      answer: "The end time must be later than the start time. Adjust either and send the invitation again.",
    },
    ...sharedFaqs,
  ],
};

export const HELP_CONTENT: Record<Exclude<UserRole, "ccaeAdmin">, HelpContent> = {
  guestLecturer,
  unitCoordinator,
};
