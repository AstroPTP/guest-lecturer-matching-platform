const ROLE_LABELS: Record<string, string> = {
  guest_speaker: "Guest lecturer",
  unit_coordinator: "Unit coordinator",
  ccae_admin: "Administrator",
};

export function requestRoleLabel(role: string | null): string {
  return (role && ROLE_LABELS[role]) || "Account";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWhen(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
