export function formatStoredValue(value?: string): string {
  if (!value) {
    return "";
  }

  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function getInitials(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((namePart) => namePart.charAt(0).toUpperCase()).join("");
}

