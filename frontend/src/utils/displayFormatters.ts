export function formatStoredValue(value?: string): string {
  if (!value) {
    return "";
  }

  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// Stored profile values don't always use the option value's form: the database
// can hold "60 MINUTES" where the option is "60-minutes". Comparing on a
// normalized form (lowercase, whitespace as hyphens) lets both match.
export function normalizeOptionValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

// Shows a stored value as its option's label, matching on either the option's
// value or its label. A value with no matching option is shown as stored,
// title-cased if it is all capitals ("INFORMATION SYSTEMS").
export function formatOptionLabel(value: string, options: { value: string; label: string }[]): string {
  const target = normalizeOptionValue(value);
  const option = options.find((item) => normalizeOptionValue(item.value) === target || normalizeOptionValue(item.label) === target);
  if (option) {
    return option.label;
  }
  return value === value.toUpperCase() ? value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : value;
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function formatTimeRange(from?: string, to?: string, fallback = ""): string {
  if (!from || !to) return fallback;
  return from + " – " + to;
}

