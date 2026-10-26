"use client";

import { useId } from "react";
import type { DiscoverySort, DiscoverySortOption } from "@/types/discovery/discoverySortTypes";

interface DiscoverySortControlProps {
  value: DiscoverySort;
  options: DiscoverySortOption[];
  onChange: (sort: DiscoverySort) => void;
}

/**
 * The "Sort by" choice on Discovery. A native select, so it opens from the
 * keyboard and is announced by screen readers with no script. The change is
 * also spoken through a status line, because the list below it changes order
 * without the page moving.
 */
export default function DiscoverySortControl({ value, options, onChange }: DiscoverySortControlProps) {
  const id = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2 shadow-sm">
      <label htmlFor={id} className="whitespace-nowrap text-sm font-semibold text-gray-800">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as DiscoverySort)}
        className="min-h-9 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="sr-only" role="status">
        {selected ? `Sorted by ${selected.label}` : ""}
      </p>
    </div>
  );
}
