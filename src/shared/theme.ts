/**
 * Light and dark themes. The choice lives on `<html data-theme>`; an inline script in the
 * page head applies a stored choice before first paint, and this module wires the toggle.
 * Anything drawn on a canvas listens for `THEME_EVENT` and repaints; SVG follows CSS.
 */

export type Theme = "light" | "dark";

export const THEME_EVENT = "ml101:theme";
const STORAGE_KEY = "ml101:theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  return explicit === "dark" || explicit === "light" ? explicit : systemTheme();
}

function announce(): void {
  window.dispatchEvent(new Event(THEME_EVENT));
}

function label(button: HTMLButtonElement): void {
  const next = currentTheme() === "dark" ? "light" : "dark";
  button.setAttribute("aria-label", `Switch to ${next} theme`);
  const text = button.querySelector("[data-theme-label]");
  if (text) text.textContent = next === "dark" ? "Dark" : "Light";
}

export function initTheme(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")];
  buttons.forEach((button) => {
    label(button);
    button.addEventListener("click", () => {
      const next: Theme = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // The theme still applies for this visit when storage is unavailable.
      }
      buttons.forEach(label);
      announce();
    });
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (document.documentElement.dataset.theme) return;
    buttons.forEach(label);
    announce();
  });
}
