"use client";

import Image, { type StaticImageData } from "next/image";
import { MATCHING_SUGGESTIONS_ENABLED } from "@/config/features";
import { HELP_CONTENT, type HelpStep } from "@/constants/helpContent";
import { useSuggestionsOn } from "@/lib/hooks/useSuggestionsOn";

interface HelpPageContentProps {
  role: "guestLecturer" | "unitCoordinator";
  /** Optional illustration shown beside the introduction. */
  heroImage?: StaticImageData;
}

const ROLE_TITLES = {
  guestLecturer: "Guest lecturer guide",
  unitCoordinator: "Unit coordinator guide",
} as const;

/**
 * The in-app user guide: how the platform works end to end, step-by-step
 * guides for each screen, and answers to common questions.
 *
 * Guides and questions use native <details> elements, so they open with a
 * keyboard and are announced correctly by screen readers with no script.
 */
export default function HelpPageContent({ role, heroImage }: HelpPageContentProps) {
  const content = HELP_CONTENT[role];
  // Ranked matching is off until an administrator switches it on, so its
  // section and questions appear only once the API says it is on. A guide with
  // no such section has nothing to wait for, so it does not ask.
  const suggestionsOn = useSuggestionsOn(Boolean(content.suggestions));
  const showSuggestions = MATCHING_SUGGESTIONS_ENABLED && suggestionsOn === true;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-10">
      <header className="flex flex-col gap-6 rounded-2xl bg-white p-8 shadow-sm md:flex-row md:items-center">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Help</p>
          <h1 className="mt-2 text-3xl font-bold text-[#242424]">{ROLE_TITLES[role]}</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-700">{content.intro}</p>
        </div>
        {heroImage ? (
          <Image
            src={heroImage}
            alt=""
            className="h-40 w-full max-w-xs rounded-xl object-contain md:h-44"
            unoptimized
            priority
          />
        ) : null}
      </header>

      <section aria-labelledby="journey-heading" className="rounded-2xl bg-white p-8 shadow-sm">
        <h2 id="journey-heading" className="text-xl font-semibold text-[#242424]">
          How it works
        </h2>
        <JourneyDiagram steps={content.journey} />
      </section>

      <section aria-labelledby="guides-heading" className="rounded-2xl bg-white p-8 shadow-sm">
        <h2 id="guides-heading" className="text-xl font-semibold text-[#242424]">
          Step-by-step guides
        </h2>
        <div className="mt-4 divide-y divide-gray-200">
          {content.guides.map((guide) => (
            <details key={guide.title} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-1 text-base font-medium text-[#242424] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                {guide.title}
                <Chevron />
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-relaxed text-gray-700">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>

      {showSuggestions && content.suggestions ? (
        <section
          id="suggested-speakers"
          aria-labelledby="suggested-speakers-heading"
          className="scroll-mt-24 rounded-2xl bg-white p-8 shadow-sm"
        >
          <h2 id="suggested-speakers-heading" className="text-xl font-semibold text-[#242424]">
            {content.suggestions.title}
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-sm leading-relaxed text-gray-700">
            {content.suggestions.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="faq-heading" className="rounded-2xl bg-white p-8 shadow-sm">
        <h2 id="faq-heading" className="text-xl font-semibold text-[#242424]">
          Frequently asked questions
        </h2>
        <div className="mt-4 divide-y divide-gray-200">
          {content.faqs
            .filter((faq) => faq.feature !== "suggestions" || showSuggestions)
            .map((faq) => (
            <details key={faq.question} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-1 text-base font-medium text-[#242424] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                {faq.question}
                <Chevron />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-gray-700">
        Still stuck? Contact the CCAE team through your Curtin contact, and mention the screen you were on.
      </p>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-5 w-5 shrink-0 text-gray-600 transition-transform group-open:rotate-180 motion-reduce:transition-none"
    >
      <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The journey as numbered steps joined by a line: a row on wide screens, a
 * column on phones. Plain markup rather than an image, so it scales, reads
 * correctly to screen readers as an ordered list, and costs nothing to load.
 */
function JourneyDiagram({ steps }: { steps: HelpStep[] }) {
  return (
    <ol className="relative mt-6 grid gap-6 md:grid-cols-6 md:gap-3">
      <span
        aria-hidden="true"
        className="absolute left-5 top-5 bottom-5 w-0.5 bg-blue-100 md:left-[8%] md:right-[8%] md:top-5 md:bottom-auto md:h-0.5 md:w-auto"
      />
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-4 md:flex-col md:items-center md:gap-3 md:text-center">
          <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white ring-4 ring-white">
            {index + 1}
          </span>
          <span>
            <span className="block text-sm font-semibold text-[#242424]">{step.title}</span>
            <span className="mt-1 block text-xs leading-snug text-gray-700">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
