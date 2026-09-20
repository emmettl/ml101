/** The ladder chart shared by lesson 08 and the Scale Ladder lab. */

import { applyChartSize, responsiveChartSize } from "../shared/chart-size";
import { svgElement } from "../shared/plot";
import { LADDER, inWords, type Rung } from "./engine";

export interface Marker {
  name: string;
  parameters: number;
}

/**
 * One horizontal bar per model on a logarithmic scale: each gridline is a thousand times the
 * last. `chosen` is highlighted; `marker`, if given, is drawn as an extra bar in its place.
 */
export function drawLadder(svg: SVGSVGElement, chosen: number, marker?: Marker): void {
  const rungs: (Rung | (Marker & { custom: true }))[] = [...LADDER];
  if (marker) {
    const at = rungs.findIndex((rung) => rung.parameters > marker.parameters);
    rungs.splice(at < 0 ? rungs.length : at, 0, { ...marker, custom: true });
  }
  const rowHeight = 27;
  const size = responsiveChartSize(svg, { width: 900, height: 44 + rungs.length * rowHeight }, 1);
  applyChartSize(svg, size);
  svg.replaceChildren();
  svg.classList.add("plot");
  const { width } = size;
  const narrow = width < 560;
  const left = narrow ? 118 : 190;
  const right = narrow ? 58 : 96;
  const top = 26;
  const span = width - left - right;
  const x = (parameters: number) => left + (Math.log10(Math.max(1, parameters)) / 12) * span;

  for (let power = 0; power <= 12; power += 3) {
    svg.append(
      svgElement("line", {
        x1: x(10 ** power),
        x2: x(10 ** power),
        y1: top,
        y2: top + rungs.length * rowHeight,
        class: "plot-grid",
      }),
      svgElement(
        "text",
        { x: x(10 ** power), y: top - 8, "text-anchor": "middle", class: "plot-axis" },
        power === 0 ? "1" : inWords(10 ** power).replace("1 ", ""),
      ),
    );
  }
  rungs.forEach((rung, index) => {
    const y = top + index * rowHeight;
    const custom = "custom" in rung;
    const isChosen = custom || (!marker && index === chosen);
    svg.append(
      svgElement(
        "text",
        {
          x: left - 8,
          y: y + 17,
          "text-anchor": "end",
          class: isChosen ? "plot-label strong" : "plot-label",
        },
        narrow && rung.name.length > 17 ? `${rung.name.slice(0, 16)}…` : rung.name,
      ),
      svgElement("rect", {
        x: left,
        y: y + 5,
        width: Math.max(2, x(rung.parameters) - left).toFixed(1),
        height: rowHeight - 10,
        rx: 2,
        class:
          `plot-bar ${isChosen ? "chosen" : "course" in rung && rung.course ? "course" : ""}`.trim(),
      }),
      svgElement(
        "text",
        { x: x(rung.parameters) + 6, y: y + 17, class: "plot-axis" },
        inWords(rung.parameters),
      ),
    );
  });
}
