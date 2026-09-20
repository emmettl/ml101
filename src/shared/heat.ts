/**
 * A heatmap drawn on a small canvas that sits exactly behind a plot's drawing area. The grid
 * is painted at its own low resolution and the browser smooths it up to size, so a 48×48
 * landscape costs one `putImageData` instead of thousands of SVG rectangles. Axes, points and
 * labels stay in the SVG on top.
 */

import type { Plot } from "./plot";
import type { Rgb } from "./tokens";

export interface HeatLayer {
  /**
   * `values` is row-major with row 0 at the bottom of the plot (the lowest y). `colour` maps a
   * cell value to RGB.
   */
  draw(
    plot: Plot,
    values: ArrayLike<number>,
    columns: number,
    rows: number,
    colour: (value: number) => Rgb,
  ): void;
}

export function createHeatLayer(host: HTMLElement): HeatLayer {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const context = canvas.getContext("2d");

  return {
    draw(plot, values, columns, rows, colour) {
      if (!context) return;
      if (canvas.width !== columns || canvas.height !== rows) {
        canvas.width = columns;
        canvas.height = rows;
      }
      const plotWidth = plot.width - plot.left - plot.right;
      const plotHeight = plot.height - plot.top - plot.bottom;
      canvas.style.left = `${(plot.left / plot.width) * 100}%`;
      canvas.style.top = `${(plot.top / plot.height) * 100}%`;
      canvas.style.width = `${(plotWidth / plot.width) * 100}%`;
      canvas.style.height = `${(plotHeight / plot.height) * 100}%`;

      const image = context.createImageData(columns, rows);
      for (let row = 0; row < rows; row += 1) {
        const target = (rows - 1 - row) * columns;
        for (let column = 0; column < columns; column += 1) {
          const [r, g, b] = colour(values[row * columns + column]);
          const offset = (target + column) * 4;
          image.data[offset] = r;
          image.data[offset + 1] = g;
          image.data[offset + 2] = b;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    },
  };
}
