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
    title: "Check who changed what",
    steps: [
      "Open Audit Log to see every administrator action and user report, newest first.",
      "Narrow the list by date range, category or role, or search by person, action or target.",
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
    question: "Does deactivating an account delete anything?",
    answer: "No. The profile, matches and messages are kept, and the account can be reactivated at any time.",
  },
  {
    question: "Why is 'signed in, last 30 days' lower than the number of accounts?",
    answer: "It only counts people who used the platform in the last 30 days. Sign-ins are recorded from the day this version went live.",
  },
  {
    question: "Can I use the portal in dark mode?",
    answer: "Yes. Use the Light, System and Dark switch in the top bar. System follows your device setting.",
  },
];

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
