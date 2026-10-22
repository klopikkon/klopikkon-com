/**
 * Theme toggle. The blocking script in the document head already set
 * data-theme from localStorage or prefers-color-scheme, so the first paint
 * matches. This module only wires the control and later system changes.
 * The storage key must stay "amt-theme" (same as the head script).
 */
const STORAGE_KEY = "amt-theme";
const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function apply(theme) {
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0e141c" : "#f3f0e8");
  if (!toggle) return;
  const next = theme === "dark" ? "light" : "dark";
  toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  toggle.setAttribute("aria-label", `Switch to ${next} theme`);
}

apply(root.dataset.theme === "dark" ? "dark" : "light");

toggle?.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode: the choice still applies for this view */
  }
  apply(next);
});

const media = window.matchMedia("(prefers-color-scheme: dark)");
media.addEventListener("change", (event) => {
  if (storedTheme()) return;
  apply(event.matches ? "dark" : "light");
});
