/** Bars that grow left or right from a centre line: used for a model's weights and for word leans. */

export interface LeanBar {
  label: string;
  value: number;
  /** What the number means in words, shown beside the bar. */
  note: string;
}

export function renderLeanBars(host: HTMLElement, bars: readonly LeanBar[], extent: number): void {
  host.replaceChildren(
    ...bars.map((bar) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = bar.label;
      const track = document.createElement("span");
      track.className = "track";
      track.setAttribute("aria-hidden", "true");
      const fill = document.createElement("span");
      fill.className = "fill";
      const width = Math.min(50, (Math.abs(bar.value) / extent) * 50);
      fill.style.left = bar.value < 0 ? `${50 - width}%` : "50%";
      fill.style.width = `${width}%`;
      track.append(fill);
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = bar.note;
      item.append(label, track, note);
      return item;
    }),
  );
}
