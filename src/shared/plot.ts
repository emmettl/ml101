/**
 * A small responsive SVG plot. Below its base width the coordinate space matches CSS pixels
 * (see chart-size.ts), so labels stay legible on a phone. All colour comes from the `plot-*`
 * classes in tokens.css, which is why a theme change needs no redraw.
 */

import { applyChartSize, responsiveChartSize, type ChartSize } from "./chart-size";

const SVG_NS = "http://www.w3.org/2000/svg";

export type Point = readonly [number, number];

export interface PlotOptions {
  base: ChartSize;
  xRange: readonly [number, number];
  yRange: readonly [number, number];
  /** Plot y on a log10 scale; the range and all values must be positive. */
  yLog?: boolean;
  xLabel?: string;
  yLabel?: string;
  xTicks?: readonly number[];
  yTicks?: readonly number[];
  xFormat?: (value: number) => string;
  yFormat?: (value: number) => string;
  /** Keep the drawing area square-ish on phones rather than letting it flatten. */
  minimumHeightShare?: number;
}

export interface Plot {
  readonly svg: SVGSVGElement;
  readonly layer: SVGGElement;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly narrow: boolean;
  readonly xRange: readonly [number, number];
  readonly yRange: readonly [number, number];
  x(value: number): number;
  y(value: number): number;
  /** Data coordinates under a pointer event. */
  locate(event: { clientX: number; clientY: number }): { x: number; y: number };
  line(points: readonly Point[], className?: string): SVGPathElement;
  circle(x: number, y: number, radius: number, className?: string): SVGCircleElement;
  /** An upward triangle: the second class marker, distinguishable without colour. */
  triangle(x: number, y: number, radius: number, className?: string): SVGPathElement;
  /** A rectangle given by two opposite corners in data coordinates. */
  box(x0: number, y0: number, x1: number, y1: number, className?: string): SVGRectElement;
  segment(x0: number, y0: number, x1: number, y1: number, className?: string): SVGLineElement;
  guide(
    axis: "x" | "y",
    value: number,
    label?: string,
    className?: string,
    labelClass?: string,
  ): void;
  text(
    x: number,
    y: number,
    content: string,
    className?: string,
    anchor?: "start" | "middle" | "end",
  ): SVGTextElement;
}

export function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
  content?: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content !== undefined) element.textContent = content;
  return element;
}

/** Round tick values covering a range. */
export function niceTicks(minimum: number, maximum: number, target = 5): number[] {
  const span = maximum - minimum;
  if (!(span > 0)) return [minimum];
  const rough = span / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let value = Math.ceil(minimum / step) * step; value <= maximum + step * 1e-9; value += step)
    ticks.push(Math.abs(value) < step * 1e-9 ? 0 : Number(value.toPrecision(12)));
  return ticks;
}

/** Whole powers of ten covering a positive range. */
export function decadeTicks(minimum: number, maximum: number): number[] {
  const ticks: number[] = [];
  for (
    let power = Math.ceil(Math.log10(minimum));
    power <= Math.floor(Math.log10(maximum));
    power++
  )
    ticks.push(10 ** power);
  return ticks;
}

export function formatCompact(value: number): string {
  const size = Math.abs(value);
  if (size === 0) return "0";
  if (size >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (size >= 100) return value.toFixed(0);
  if (size >= 10) return value.toFixed(1).replace(/\.0$/, "");
  if (size >= 1) return value.toFixed(2).replace(/\.?0+$/, "");
  if (size >= 0.01) return value.toFixed(2);
  return value.toPrecision(1);
}

function plotLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector<SVGGElement>(":scope > g[data-plot-layer]");
  if (existing) {
    existing.replaceChildren();
    return existing;
  }
  const layer = svgElement("g", { "data-plot-layer": "" });
  svg.prepend(layer);
  return layer;
}

/** Clears the plot layer (leaving drag handles and inspectors alone) and draws the axes. */
export function createPlot(svg: SVGSVGElement, options: PlotOptions): Plot {
  const size = responsiveChartSize(svg, options.base, options.minimumHeightShare ?? 0.72);
  applyChartSize(svg, size);
  svg.classList.add("plot");
  const layer = plotLayer(svg);
  const { width, height } = size;
  const narrow = width < 480;
  const left = (narrow ? 40 : 52) + (options.yLabel ? 14 : 0);
  const right = narrow ? 10 : 18;
  const top = 16;
  const bottom = (narrow ? 26 : 30) + (options.xLabel ? 16 : 0);
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const [x0, x1] = options.xRange;
  const [y0, y1] = options.yRange;
  const warp = options.yLog ? Math.log10 : (value: number) => value;
  const unwarp = options.yLog ? (value: number) => 10 ** value : (value: number) => value;
  const floor = options.yLog ? y0 : -Infinity;
  const x = (value: number) => left + ((value - x0) / (x1 - x0)) * plotWidth;
  const y = (value: number) =>
    top + ((warp(y1) - warp(Math.max(value, floor))) / (warp(y1) - warp(y0))) * plotHeight;

  const xFormat = options.xFormat ?? formatCompact;
  const yFormat = options.yFormat ?? formatCompact;
  const thin = <T>(ticks: readonly T[], keep: number): T[] =>
    ticks.length <= keep
      ? [...ticks]
      : ticks.filter((_, index) => index % Math.ceil(ticks.length / keep) === 0);
  const xTicks = thin(options.xTicks ?? niceTicks(x0, x1, narrow ? 4 : 6), narrow ? 5 : 9);
  const yTicks = thin(
    options.yTicks ?? (options.yLog ? decadeTicks(y0, y1) : niceTicks(y0, y1, 5)),
    narrow ? 5 : 8,
  );

  for (const tick of yTicks) {
    layer.append(
      svgElement("line", {
        x1: left,
        x2: width - right,
        y1: y(tick),
        y2: y(tick),
        class: "plot-grid",
      }),
      svgElement(
        "text",
        { x: left - 7, y: y(tick) + 4, "text-anchor": "end", class: "plot-axis" },
        yFormat(tick),
      ),
    );
  }
  for (const tick of xTicks) {
    layer.append(
      svgElement("line", {
        x1: x(tick),
        x2: x(tick),
        y1: top,
        y2: height - bottom,
        class: "plot-grid",
      }),
      svgElement(
        "text",
        { x: x(tick), y: height - bottom + 16, "text-anchor": "middle", class: "plot-axis" },
        xFormat(tick),
      ),
    );
  }
  layer.append(
    svgElement("rect", {
      x: left,
      y: top,
      width: plotWidth,
      height: plotHeight,
      fill: "none",
      class: "plot-frame",
    }),
  );
  if (options.xLabel)
    layer.append(
      svgElement(
        "text",
        { x: left + plotWidth / 2, y: height - 5, "text-anchor": "middle", class: "plot-title" },
        options.xLabel,
      ),
    );
  if (options.yLabel) {
    const middle = top + plotHeight / 2;
    layer.append(
      svgElement(
        "text",
        {
          x: 12,
          y: middle,
          "text-anchor": "middle",
          class: "plot-title",
          transform: `rotate(-90 12 ${middle})`,
        },
        options.yLabel,
      ),
    );
  }

  const clipId = `${svg.id || "plot"}-clip`;
  const clip = svgElement("clipPath", { id: clipId });
  clip.append(svgElement("rect", { x: left, y: top, width: plotWidth, height: plotHeight }));
  layer.append(clip);
  const clipped = svgElement("g", { "clip-path": `url(#${clipId})` });
  layer.append(clipped);

  const finite = (value: number) => (Number.isFinite(value) ? value : 0);
  const bound = (value: number) => Math.max(-1e5, Math.min(1e5, finite(value)));

  return {
    svg,
    layer,
    width,
    height,
    left,
    right,
    top,
    bottom,
    narrow,
    xRange: options.xRange,
    yRange: options.yRange,
    x,
    y,
    locate(event) {
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / (rect.width || 1)) * width;
      const py = ((event.clientY - rect.top) / (rect.height || 1)) * height;
      const share = (top + plotHeight - py) / plotHeight;
      return {
        x: x0 + ((px - left) / plotWidth) * (x1 - x0),
        y: unwarp(warp(y0) + share * (warp(y1) - warp(y0))),
      };
    },
    line(points, className = "") {
      const d = points
        .filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py))
        .map(
          ([px, py], index) =>
            `${index ? "L" : "M"}${bound(x(px)).toFixed(1)},${bound(y(py)).toFixed(1)}`,
        )
        .join(" ");
      const element = svgElement("path", { d, class: `plot-line ${className}`.trim() });
      clipped.append(element);
      return element;
    },
    circle(cx, cy, radius, className = "") {
      const element = svgElement("circle", {
        cx: bound(x(cx)).toFixed(1),
        cy: bound(y(cy)).toFixed(1),
        r: radius,
        class: `plot-point ${className}`.trim(),
      });
      clipped.append(element);
      return element;
    },
    triangle(cx, cy, radius, className = "") {
      const px = bound(x(cx));
      const py = bound(y(cy));
      const r = radius * 1.25;
      const d = `M${px.toFixed(1)},${(py - r).toFixed(1)} L${(px + r * 0.95).toFixed(1)},${(py + r * 0.75).toFixed(1)} L${(px - r * 0.95).toFixed(1)},${(py + r * 0.75).toFixed(1)} Z`;
      const element = svgElement("path", { d, class: `plot-point ${className}`.trim() });
      clipped.append(element);
      return element;
    },
    box(bx0, by0, bx1, by1, className = "plot-square") {
      const px0 = bound(x(bx0));
      const px1 = bound(x(bx1));
      const py0 = bound(y(by0));
      const py1 = bound(y(by1));
      const element = svgElement("rect", {
        x: Math.min(px0, px1).toFixed(1),
        y: Math.min(py0, py1).toFixed(1),
        width: Math.abs(px1 - px0).toFixed(1),
        height: Math.abs(py1 - py0).toFixed(1),
        class: className,
      });
      clipped.append(element);
      return element;
    },
    segment(sx0, sy0, sx1, sy1, className = "plot-residual") {
      const element = svgElement("line", {
        x1: bound(x(sx0)).toFixed(1),
        y1: bound(y(sy0)).toFixed(1),
        x2: bound(x(sx1)).toFixed(1),
        y2: bound(y(sy1)).toFixed(1),
        class: className,
      });
      clipped.append(element);
      return element;
    },
    guide(axis, value, label, className = "", labelClass = "") {
      const horizontal = axis === "y";
      const at = horizontal ? y(value) : x(value);
      if (!Number.isFinite(at)) return;
      if (horizontal ? at < top || at > height - bottom : at < left || at > width - right) return;
      layer.append(
        svgElement("line", {
          x1: horizontal ? left : at,
          x2: horizontal ? width - right : at,
          y1: horizontal ? at : top,
          y2: horizontal ? at : height - bottom,
          class: `plot-guide ${className}`.trim(),
        }),
      );
      if (!label) return;
      layer.append(
        svgElement(
          "text",
          horizontal
            ? { x: width - right - 5, y: at - 6, "text-anchor": "end" }
            : { x: at + 5, y: top + 12, "text-anchor": "start" },
          label,
        ),
      );
      layer.lastElementChild?.setAttribute("class", `plot-label ${labelClass}`.trim());
    },
    text(tx, ty, content, className = "plot-label", anchor = "middle") {
      const element = svgElement(
        "text",
        {
          x: bound(x(tx)).toFixed(1),
          y: bound(y(ty)).toFixed(1),
          "text-anchor": anchor,
          class: className,
        },
        content,
      );
      layer.append(element);
      return element;
    },
  };
}

/** Redraw when the chart's own box changes size (layout shifts as well as window resizes). */
export function redrawOnResize(elements: readonly Element[], redraw: () => void): void {
  let frame = 0;
  let lastWidths = elements.map(() => -1);
  const observer = new ResizeObserver(() => {
    const widths = elements.map((element) => Math.round(element.clientWidth));
    if (widths.every((value, index) => value === lastWidths[index])) return;
    lastWidths = widths;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(redraw);
  });
  elements.forEach((element) => observer.observe(element));
}
