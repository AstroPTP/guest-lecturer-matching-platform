import { STATUS_LABELS, toCheckStatus } from "@/lib/system_format";
import type { CheckStatus } from "@/types/admin";

/**
 * One drawing per status, each a different shape as well as a different
 * colour: a tick in a circle, an exclamation mark in a triangle, a cross in a
 * square, a question mark in a dashed circle. The word beside it says the
 * same thing a third time, so nobody has to tell colours apart to read it.
 */
function StatusIcon({ status }: { status: CheckStatus }) {
  const common = {
    "aria-hidden": true,
    fill: "none",
    focusable: false,
    height: 14,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 16 16",
    width: 14,
  };

  switch (status) {
    case "healthy":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" />
          <path d="M5 8.2l2.2 2.2L11 6" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M8 2l6.5 11.5h-13z" />
          <path d="M8 6.5v3" />
          <path d="M8 11.6v.1" />
        </svg>
      );
    case "unavailable":
      return (
        <svg {...common}>
          <rect height="12" rx="2" width="12" x="2" y="2" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" strokeDasharray="2.4 2.4" />
          <path d="M6.2 6.3a1.9 1.9 0 113.2 1.4c-.7.5-1.4.9-1.4 1.8" />
          <path d="M8 11.6v.1" />
        </svg>
      );
  }
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  // A status the page has no style for would otherwise render unstyled and
  // unlabelled. Reading it as "Unknown" is accurate: the page does not know it.
  const safe = toCheckStatus(status);
  return (
    <span className={`sys-badge sys-badge--${safe}`}>
      <StatusIcon status={safe} />
      <span>{STATUS_LABELS[safe]}</span>
    </span>
  );
}
