import type { Metadata } from "next";
import Image from "next/image";
import heroImage from "@/assets/help/help-administrator.svg";

interface Guide {
  title: string;
  steps: string[];
}

const GUIDES: Guide[] = [
  {
    title: "Read the dashboard",
    steps: [
      "Dashboard shows profiles created, users signed in during the last 30 days, contacts made and matches made, counted live.",
      "Analytics breaks contacts down by outcome and by unit coordinator.",
      "Choose Download usage report (CSV) on Analytics to open the same figures in a spreadsheet.",
    ],
  },
  {
    title: "Deactivate or reactivate an account",
    steps: [
      "Open Users and choose View profile on the person.",
      "Choose Deactivate Account and confirm. They are signed out on their next action and hidden from coordinators. Nothing is deleted.",
      "To undo it, open the same profile and choose Reactivate Account.",
    ],
  },
  {
    title: "Approve new guest lecturers",
    steps: [
      "Open Verification Queue to see new guest lecturer profiles.",
      "Choose Approve to accept a profile, or Reject to deactivate the account.",
      "Approval only hides new profiles while Require admin approval is on in Settings. The notice at the top of the queue says which mode is active.",
    ],
  },
  {
    title: "Deal with a reported user",
    steps: [
      "Open Reports to see reports users have raised about other accounts.",
      "Choose Dismiss if no action is needed, or Deactivate account to lock the account.",
      "Either decision closes the report and is recorded in the Audit Log.",
    ],
  },
  {
    title: "Change the matching rules",
    steps: [
      "Open Settings.",
      "Switch Require admin approval on or off.",
      "Set Contact limit (days): how often a guest lecturer can receive a contact request. 90 is about three months; 0 turns the limit off.",
      "Choose Save settings. The change applies straight away and is recorded in the Audit Log.",
    ],
  },
  {
    title: "Control Suggested speakers",
    steps: [
      "Open Settings and find the Suggested speakers card. Suggested speakers is the ranked shortlist of guest lecturers a unit coordinator gets for a session.",
      "Use the On/Off switch to turn it off for everyone. Coordinators then see a message that an administrator turned it off. If the server sets MATCHING_SUGGESTIONS_ENABLED to false, it stays off whatever the switch says.",
      "Pick a preset for how the list is ranked: Balanced (65/20/15, the default), Topic first (80/10/10) or Share the work (50/30/20). The three numbers are topic fit, time since last session and fewer sessions so far.",
      "Choose Custom to set your own three weights. They must add up to 100, and topic fit must be at least 50 so it always counts most.",
      "Set the half-life: after that many days without a session, the time-since-last-session score has risen halfway to its maximum. A shorter half-life brings lecturers back sooner.",
      "Choose Save, or Reset to defaults to put the weights back to Balanced and the half-life back to 90 days (the On/Off switch is left as it is). The change applies straight away and is recorded in the Audit Log with the old and new values.",
    ],
  },
  {
    title: "Check who changed what",
    steps: [
      "Open Audit Log to see every administrator action and user report, newest first.",
      "Narrow the list by date range, category or role, or search by person, action or target.",
    ],
  },
];

interface SystemTopic {
  title: string;
  paragraphs: { lead?: string; text: string }[];
}

const SYSTEM_TOPICS: SystemTopic[] = [
  {
    title: "What Healthy, Warning, Unavailable and Unknown mean",
    paragraphs: [
      { lead: "Healthy.", text: "The check ran and the result is inside its limits. Nothing needs doing." },
      {
        lead: "Warning.",
        text: "The result is slow, near or past a limit, or overdue. The system still works, but it is worth looking into soon, before it becomes a problem.",
      },
      {
        lead: "Unavailable.",
        text: "A required part of the system is not responding, such as the database. Something needs doing now.",
      },
      {
        lead: "Unknown.",
        text: "This host cannot measure it, for example because the server does not report that figure or nothing is set up to measure it. Unknown is not a fault in itself. The message on the card says why.",
      },
      { text: "Every status shows a word and a shape as well as a colour, so it can be read without telling colours apart." },
    ],
  },
  {
    title: "What the storage and usage numbers mean",
    paragraphs: [
      {
        lead: "Database size",
        text: "is the space the platform's data takes up. When a size limit is set, the bar shows how much of it is used. Photos storage is the space taken by uploaded profile photos.",
      },
      {
        lead: "Disk and Memory",
        text: "show how full the server's disk and memory are. The memory figure also says how much of it this server process uses on its own.",
      },
      {
        lead: "Largest tables",
        text: "lists the biggest database tables by size, with their row counts. It shows where the space is going.",
      },
      {
        lead: "Usage",
        text: "counts people who were active in the last 24 hours and 7 days, and the new accounts, match requests and messages of the last 7 days, plus the photos stored. Not available means the figure could not be read. It does not mean zero.",
      },
    ],
  },
  {
    title: "What the security counts mean, and when they reset",
    paragraphs: [
      {
        text: "Failed authentications are requests refused because the sign-in token was missing or not valid. Admin access denied counts requests for administrator pages from people without the administrator role. Rate limited counts requests refused for arriving too fast. Server errors counts requests that failed inside the platform.",
      },
      {
        lead: "The counts reset when the server restarts.",
        text: "They are kept in the server's memory, not in the database. A low count soon after a restart does not mean things have been quiet. The page says when the server started, and the totals count from then.",
      },
      {
        lead: "Failed sign-ins are seen in Auth0.",
        text: "Signing in happens at the identity provider, not in this platform, so a wrong password or a blocked account is recorded there. Open the Auth0 dashboard and go to Monitoring, then Logs.",
      },
    ],
  },
  {
    title: "Who sets the limits, and how often the page updates",
    paragraphs: [
      {
        text: "The warning and critical limits are set by environment variables on the server, by whoever hosts the system. This page only shows them and cannot change them. To change a limit, ask the host.",
      },
      {
        text: "The page reads the system when it opens, once a minute while the tab is open and visible, and whenever you choose Refresh. It pauses while the tab is hidden.",
      },
    ],
  },
];

const FAQS = [
  {
    question: "Who can open this portal?",
    answer:
      "Only accounts with the CCAE administrator role. Anyone else is sent back to the sign-in page with a message, and the server refuses their requests as well.",
  },
  {
    question: "A coordinator says they cannot contact a lecturer.",
    answer:
      "The lecturer was probably contacted recently and is inside the contact limit, so the request is refused until the limit has passed. You can change or turn off the limit in Settings.",
  },
  {
    question: "What do the presets do?",
    answer:
      "They set how the Suggested speakers shortlist is ranked. Balanced favours the best topic match with a nudge towards fairness, Topic first favours the best topic match above all, and Share the work gives lecturers who have had fewer sessions a better chance.",
  },
  {
    question: "What happens when I switch Suggested speakers off?",
    answer:
      "Coordinators see a message that an administrator turned it off, and the shortlist stops until you switch it back on. Discovery, matches and messages carry on as normal.",
  },
  {
    question: "Is every change to Suggested speakers recorded?",
    answer: "Yes. Each change to these settings goes into the Audit Log with who made it and the old and new values.",
  },
  {
    question: "Does deactivating an account delete anything?",
    answer: "No. The profile, matches and messages are kept, and the account can be reactivated at any time.",
  },
  {
    question: "Why is 'signed in, last 30 days' lower than the number of accounts?",
    answer: "It only counts people who used the platform in the last 30 days. Sign-ins are recorded from the day this version went live.",
  },
  {
    question: "Where do I see confirmed sessions?",
    answer:
      "Open Events in the menu and choose accepted in the Status filter. Each row shows the title, date, coordinator and guest lecturer. You are also told in your notifications each time a guest lecture is confirmed or cancelled, and the notice links to the same page.",
  },
  {
    question: "What does the bell show?",
    answer:
      "The number of notifications you have not read yet. Choose the bell to open them, newest first, with a dot on the unread ones. Use Mark all read to clear the number, or follow a notice to the page it is about. The number updates about every 30 seconds while the page is open.",
  },
  {
    question: "Can I use the portal in dark mode?",
    answer: "Yes. Use the Light, System and Dark switch in the top bar. System follows your device setting.",
  },
];

export const metadata: Metadata = { title: "Help" };

/**
 * The administrator's guide: what each section is for and how to carry out
 * the common tasks. Native <details> elements keep it keyboard accessible
 * with no script.
 */
export default function AdminHelpPage() {
  return (
    <div className="help-page">
      <header className="help-hero">
        <div>
          <span className="help-eyebrow">Help</span>
          <h1>Administrator guide</h1>
          <p>How to read the platform figures, look after accounts, and adjust the rules guest lecturers and unit coordinators work within.</p>
        </div>
        <Image alt="" aria-hidden="true" className="help-hero-image" priority src={heroImage} unoptimized />
      </header>

      <section aria-labelledby="admin-guides" className="help-card">
        <h2 id="admin-guides">Step-by-step guides</h2>
        {GUIDES.map((guide) => (
          <details key={guide.title}>
            <summary>{guide.title}</summary>
            <ol>
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </section>

      <section aria-labelledby="admin-system" className="help-card">
        <h2 id="admin-system">System Analytics</h2>
        {SYSTEM_TOPICS.map((topic) => (
          <details key={topic.title}>
            <summary>{topic.title}</summary>
            {topic.paragraphs.map((paragraph) => (
              <p key={paragraph.text}>
                {paragraph.lead ? <strong>{paragraph.lead} </strong> : null}
                {paragraph.text}
              </p>
            ))}
          </details>
        ))}
      </section>

      <section aria-labelledby="admin-faqs" className="help-card">
        <h2 id="admin-faqs">Frequently asked questions</h2>
        {FAQS.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
