export default function DiscoveryValue({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>

      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-700">{value}</p>
    </div>
  );
}
