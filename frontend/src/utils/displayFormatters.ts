export function formatStoredValue(value?: string): string {
  if (!value) {
    return "";
  }

  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
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

