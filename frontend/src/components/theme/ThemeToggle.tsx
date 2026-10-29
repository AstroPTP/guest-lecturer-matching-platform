"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, type Theme } from "./themePolicy";
import { applyTheme, readStoredTheme, writeStoredTheme } from "./themeStorage";

const OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "system", label: "System", hint: "Follow this device" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

/**
 * The stored preference is an external store, so it is read as one.
 *
 * useSyncExternalStore rather than an effect that sets state: the value lives
 * outside React, the server cannot know it, and this is the hook built for
 * exactly that. It also means a change in one tab reaches the others, because
 * the browser fires a storage event for them.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

/** Fired in this tab, where the storage event does not reach. */
const THEME_CHANGE_EVENT = "glmp:theme";

/** On the server there is no stored value, and no way to guess one. */
function readServerTheme(): Theme {
  return DEFAULT_THEME;
}

function choose(theme: Theme) {
  writeStoredTheme(theme);
  applyTheme(window.location.pathname, theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * Light, dark, or follow the device.
 *
 * Three explicit choices rather than a two-state switch, because a switch
 * cannot express "follow the system" and somebody on a device that changes at
 * sunset would have to keep correcting it.
 *
 * Rendered only inside the signed-in dashboard. Public pages are always light,
 * so they have nothing to switch.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, readServerTheme);

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 ${className}`}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.hint}
            title={option.hint}
            onClick={() => choose(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              selected
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
