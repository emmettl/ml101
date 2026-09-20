/**
 * Calm live regions. The generated readouts are rewritten on every slider movement and, while
 * a model trains, on every animation frame. Marked `aria-live` directly, that floods a screen
 * reader with half-finished sentences. Instead each readout loses its own `aria-live` and gets
 * a visually hidden twin that is updated only once the text has stopped changing, so a
 * listener hears one complete sentence per adjustment and one when training pauses.
 */

const SETTLE_MS = 900;

/** Feedback a learner asked for directly is short and should be heard at once. */
const IMMEDIATE =
  ".quiz-feedback, .predict-feedback, .lesson-completion, .dock-position, .glossary-count";

export function calmLiveRegions(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[aria-live="polite"]').forEach((source) => {
    if (source.matches(IMMEDIATE) || source.dataset.calmed) return;
    source.dataset.calmed = "true";
    source.removeAttribute("aria-live");

    const twin = document.createElement("div");
    twin.className = "visually-hidden";
    twin.setAttribute("role", "status");
    twin.setAttribute("aria-live", "polite");
    source.after(twin);

    let timer = 0;
    let spoken = source.textContent?.trim() ?? "";
    new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const text = source.textContent?.trim() ?? "";
        if (text === spoken) return;
        spoken = text;
        twin.textContent = text;
      }, SETTLE_MS);
    }).observe(source, { childList: true, characterData: true, subtree: true });
  });
}

/** Column headers announce with their cells, and each table is named by its panel's heading. */
export function labelTables(root: ParentNode = document): void {
  root.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    table.querySelectorAll("thead th").forEach((cell) => cell.setAttribute("scope", "col"));
    const heading = table.closest("section")?.querySelector<HTMLElement>("h2[id]");
    if (heading && !table.hasAttribute("aria-labelledby"))
      table.setAttribute("aria-labelledby", heading.id);
  });
}
