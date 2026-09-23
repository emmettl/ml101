/** Drawing tiny pictures, filters and feature maps as grids of cells. */

import { ramp, tokenRgb } from "../shared/tokens";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A grid of cells. Values in [0, 1] are drawn light to dark; with `diverging`, negative values
 * take one class colour and positive the other, so a filter's weights can be read.
 */
export function renderGrid(
  host: Element,
  values: ArrayLike<number>,
  columns: number,
  rows: number,
  options: { diverging?: boolean; label?: string } = {},
): void {
  host.replaceChildren();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${columns} ${rows}`);
  svg.setAttribute("class", "pixel-grid");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", options.label ?? `A ${columns} by ${rows} grid of values`);
  let largest = 1e-9;
  for (let at = 0; at < values.length; at += 1) largest = Math.max(largest, Math.abs(values[at]));
  const paper = tokenRgb("--surface");
  const ink = tokenRgb("--ink");
  const negative = tokenRgb("--class-a");
  const positive = tokenRgb("--class-b");
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1) {
      const value = values[row * columns + column];
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(column));
      rect.setAttribute("y", String(row));
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      const colour = options.diverging
        ? ramp([negative, paper, positive], 0.5 + (0.5 * value) / largest)
        : ramp(
            [paper, ink],
            Math.max(0, Math.min(1, value / (options.diverging ? largest : Math.max(1, largest)))),
          );
      rect.setAttribute("fill", `rgb(${colour.map(Math.round).join(" ")})`);
      svg.append(rect);
    }
  host.append(svg);
}
