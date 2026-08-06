export default function DiscoveryTagGroup({ label, items }: { label: string; items: string[] }) {
  const validItems = items.filter((item) => item.trim().length > 0);

  if (validItems.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>

      <div className="flex flex-wrap gap-2">
        {validItems.map((item) => (
          <span key={item} className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
