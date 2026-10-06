"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyTheme, effectiveTheme, readThemePreference, subscribeTheme, type ThemePreference } from "@/lib/theme";
import { IconButton } from "./icon-button";

/**
 * Header button: flips between light and dark. Both icons are always rendered and CSS shows the one
 * that matches the current theme, so the server and the first client render agree.
 */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <IconButton
      plain
      label="Switch between light and dark"
      className={className}
      onClick={() => applyTheme(effectiveTheme() === "dark" ? "light" : "dark")}
    >
      <Moon className="ic ic-24 theme-moon" aria-hidden="true" />
      <Sun className="ic ic-24 theme-sun" aria-hidden="true" />
    </IconButton>
  );
}

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Footer selector with the third choice, "System", which follows the phone or laptop setting. */
export function ThemeSelect() {
  const pref = useSyncExternalStore(subscribeTheme, readThemePreference, () => "system" as ThemePreference);
  return (
    <div role="group" aria-label="Theme" className="seg">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={pref === o.value} className={pref === o.value ? "is-on" : undefined} onClick={() => applyTheme(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
