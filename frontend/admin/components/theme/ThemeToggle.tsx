"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

type Theme = "system" | "light" | "dark";

const OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "system", label: "System", hint: "Follow this device" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

/** Fired in this tab, where the storage event does not reach. */
const THEME_CHANGE_EVENT = "glmp:theme";

/**
 * The stored preference lives outside React, so it is read with the hook built
 * for that rather than with an effect that sets state. The storage event
 * carries a change in one tab to the others at no cost.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    return "system";
  }
}

/** On the server there is no stored value, and no way to guess one. */
function readServerTheme(): Theme {
  return "system";
}

function apply(theme: Theme) {
  const root = document.documentElement;

  // System writes no attribute, so the stylesheet's media query decides and
  // keeps following the device when it changes at sunset.
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }

  try {
    if (theme === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Storage refused, in a private window. The attribute above still themes
    // this page; only the memory of the choice is lost.
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, readServerTheme);

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.hint}
          title={option.hint}
          onClick={() => apply(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
