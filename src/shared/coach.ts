/** "Try this" chips under a lab's summary: one click applies a setup and says what to watch. The share button sits with them. */

import { coachMovesFor, type CoachMove } from "./coach-moves";
import { applySetup, shareButton, showSetupInUrl } from "./setup";

export function mountCoach(): void {
  const moves = coachMovesFor(location.pathname);
  const anchor = document.querySelector(".variant-summary");
  if (moves.length === 0 || !anchor) return;
  const nav = document.createElement("nav");
  nav.className = "coach";
  nav.setAttribute("aria-label", "Try this");
  const label = document.createElement("span");
  label.className = "coach-label";
  label.textContent = "Try this";
  const list = document.createElement("div");
  list.className = "coach-moves";
  const note = document.createElement("p");
  note.className = "coach-note";
  note.setAttribute("aria-live", "polite");
  const chips = moves.map((move) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = move.label;
    chip.addEventListener("click", () => pick(move, chip));
    return chip;
  });
  const pick = (move: CoachMove, chip: HTMLButtonElement): void => {
    applySetup(move.setup);
    showSetupInUrl(move.setup);
    for (const other of chips) other.setAttribute("aria-pressed", String(other === chip));
    note.textContent = move.watch;
  };
  list.append(...chips, shareButton());
  nav.append(label, list, note);
  anchor.after(nav);
}
