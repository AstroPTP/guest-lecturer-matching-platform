import type { CheckStatus, SecurityCategory, SystemCheck } from "@/types/admin";

/**
 * How the System Analytics page writes numbers, times and statuses.
 *
 * Kept apart from the page so the rules (which unit means what, what a missing
 * figure reads as) sit in one place and the page only lays things out.
 */

export const NOT_AVAILABLE = "Not available";

const wholeNumber = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const fixedOneDecimal = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Own-property test, so "constructor" or "toString" from the API is never mistaken for a known key. */
function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** A whole-number figure such as a head count, or "Not available". */
export function formatCount(value: number | null | undefined): string {
  return isNumber(value) ? wholeNumber.format(value) : NOT_AVAILABLE;
}

/** Bytes as B, KB, MB, GB or TB (1024 based), to one decimal place. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!isNumber(bytes) || bytes < 0) return NOT_AVAILABLE;
  if (bytes < 1024) return `${wholeNumber.format(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  // Rounding 1023.96 KB to "1,024 KB" would read oddly beside "1 MB", so the
  // rounded value decides when to move up a unit.
  while (Math.round(value * 10) / 10 >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${oneDecimal.format(value)} ${units[index]}`;
}

/** A percentage with one decimal place: 42.5%. */
export function formatPercent(value: number | null | undefined): string {
  return isNumber(value) ? `${fixedOneDecimal.format(value)}%` : NOT_AVAILABLE;
}

/** Milliseconds, with a decimal only where it carries information. */
export function formatMilliseconds(value: number | null | undefined): string {
  if (!isNumber(value)) return NOT_AVAILABLE;
  return `${(value < 10 ? oneDecimal : wholeNumber).format(value)} ms`;
}

/** A length of time as its two largest units: "3 d 4 h", "4 h 12 min", "7 min 5 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!isNumber(seconds) || seconds < 0) return NOT_AVAILABLE;
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${secs} s`;
  return `${secs} s`;
}

type UnitKind = "bytes" | "percent" | "milliseconds" | "seconds" | "other";

/** Multipliers for the byte units a backend might report a size in. */
const BYTE_UNITS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

/** What a check with no unit measures, by its key. */
const UNIT_BY_KEY: Record<SystemCheck["key"], UnitKind> = {
  api: "milliseconds",
  database: "milliseconds",
  database_size: "bytes",
  disk: "percent",
  memory: "percent",
  cpu: "percent",
  error_rate: "percent",
  retention: "other",
};

function unitKind(unit: string | null, key: SystemCheck["key"]): UnitKind {
  const normalised = unit?.trim().toLowerCase() ?? "";
  if (normalised === "") return UNIT_BY_KEY[key] ?? "other";
  if (has(BYTE_UNITS, normalised)) return "bytes";
  if (["%", "percent", "percentage", "pct"].includes(normalised)) return "percent";
  if (["ms", "millisecond", "milliseconds"].includes(normalised)) return "milliseconds";
  if (["s", "sec", "secs", "second", "seconds"].includes(normalised)) return "seconds";
  return "other";
}

/**
 * A measurement the way its unit calls for. An unrecognised unit is written
 * after the number as it came ("12 days"), which is better than guessing.
 */
export function formatMeasurement(
  value: number | null | undefined,
  unit: string | null,
  key: SystemCheck["key"],
): string {
  if (!isNumber(value)) return NOT_AVAILABLE;

  switch (unitKind(unit, key)) {
    case "bytes":
      return formatBytes(value * (BYTE_UNITS[unit?.trim().toLowerCase() ?? ""] ?? 1));
    case "percent":
      return formatPercent(value);
    case "milliseconds":
      return formatMilliseconds(value);
    case "seconds":
      return formatDuration(value);
    default:
      return unit ? `${oneDecimal.format(value)} ${unit.trim()}` : oneDecimal.format(value);
  }
}

/** "Warning at 70.0%, critical at 90.0%", or null when the check has no thresholds. */
export function describeThreshold(check: SystemCheck): string | null {
  const threshold = check.threshold;
  if (!threshold) return null;

  const parts: string[] = [];
  if (isNumber(threshold.warning)) {
    parts.push(`Warning at ${formatMeasurement(threshold.warning, check.unit, check.key)}`);
  }
  if (isNumber(threshold.critical)) {
    parts.push(`critical at ${formatMeasurement(threshold.critical, check.unit, check.key)}`);
  }
  if (parts.length === 0) return null;

  const sentence = parts.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : when;
}

/** Local time of day, to the second: 10:42:05 am. */
export function formatTime(value: string | null | undefined): string {
  const when = validDate(value);
  if (!when) return "an unknown time";
  return when.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** Local date and time: 20 Oct, 10:42:05 am. */
export function formatDateTime(value: string | null | undefined): string {
  const when = validDate(value);
  if (!when) return "an unknown time";
  return when.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const STATUS_LABELS: Record<CheckStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

/** Narrows a value from the API to a status the page has a label and style for. */
export function toCheckStatus(value: unknown): CheckStatus {
  return typeof value === "string" && has(STATUS_LABELS, value) ? (value as CheckStatus) : "unknown";
}

const CATEGORY_LABELS: Record<SecurityCategory, string> = {
  auth_failure: "Failed authentication",
  admin_forbidden: "Admin access denied",
  rate_limited: "Rate limited",
  server_error: "Server error",
};

/** A security event category in plain words. An unrecognised one is still shown, not hidden. */
export function categoryLabel(category: string): string {
  if (has(CATEGORY_LABELS, category)) return CATEGORY_LABELS[category as SecurityCategory];
  const spaced = category.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Unknown";
}
