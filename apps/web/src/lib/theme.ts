/**
 * Light / dark / system. The choice lives in localStorage and on `<html data-theme>`; "system"
 * means no attribute, so the `prefers-color-scheme` rule in globals.css decides.
 * A tiny inline script in the root layout applies a saved choice before first paint (no flash).
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_KEY = "yolt-theme";
export const THEME_EVENT = "yolt-theme-change";

/** Runs in <head> before paint. Kept as a string so the layout can inline it. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function readThemePreference(): ThemePreference {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

export function applyTheme(pref: ThemePreference) {
  if (pref === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Private windows can block storage; the choice then lasts for this page view only.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** What the page looks like right now, resolving "system" through the OS setting. */
export function effectiveTheme(): "light" | "dark" {
  const pref = readThemePreference();
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function subscribeTheme(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}
