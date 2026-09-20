/**
 * The phone-width control dock. On a narrow screen a lab's settings panel is pinned to the
 * bottom of the viewport and shows one control at a time, with previous / next buttons, so the
 * chart being changed stays in view above it. CSS does the pinning (`.controls.is-dock` in
 * lab.css); this module adds the pager and keeps track of which control is showing.
 *
 * Swiping between controls is deliberately not offered: a horizontal swipe is how a slider is
 * dragged, and the two gestures would fight.
 */

export const DOCK_QUERY = "(max-width: 680px)";

export function initControlDock(query = DOCK_QUERY): void {
  const controls = document.querySelector<HTMLElement>(".controls");
  const head = controls?.querySelector<HTMLElement>(".controls-head");
  if (!controls || !head) return;
  const blocks = [...controls.querySelectorAll<HTMLElement>(".control-block")];
  if (blocks.length === 0) return;

  const pager = document.createElement("div");
  pager.className = "dock-pager";
  pager.setAttribute("role", "group");
  pager.setAttribute("aria-label", "Choose a setting");
  const button = (label: string, text: string): HTMLButtonElement => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "dock-step";
    node.setAttribute("aria-label", label);
    node.textContent = text;
    return node;
  };
  const previous = button("Previous setting", "‹");
  const next = button("Next setting", "›");
  const position = document.createElement("span");
  position.className = "dock-position";
  position.setAttribute("aria-live", "polite");
  pager.append(previous, position, next);
  head.prepend(pager);

  const narrow = window.matchMedia(query);
  let active = 0;

  const show = (): void => {
    blocks.forEach((block, index) => block.classList.toggle("is-active", index === active));
    position.textContent = `${active + 1} of ${blocks.length}`;
    previous.disabled = active === 0;
    next.disabled = active === blocks.length - 1;
  };
  const apply = (): void => {
    controls.classList.toggle("is-dock", narrow.matches);
    pager.hidden = !narrow.matches;
    show();
  };

  previous.addEventListener("click", () => {
    active = Math.max(0, active - 1);
    show();
  });
  next.addEventListener("click", () => {
    active = Math.min(blocks.length - 1, active + 1);
    show();
  });
  // A control changed from elsewhere (a predict prompt, Reset) should be the one on show.
  controls.addEventListener("change", (event) => {
    const index = blocks.findIndex((block) => block.contains(event.target as Node));
    if (index >= 0 && index !== active) {
      active = index;
      show();
    }
  });
  narrow.addEventListener("change", apply);
  apply();
}
