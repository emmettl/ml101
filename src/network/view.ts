/** Drawing shared by the classification lessons and labs: the decision map and the wiring diagram. */

import type { HeatLayer } from "../shared/heat";
import { createPlot, svgElement, type Plot } from "../shared/plot";
import { ramp, tokenRgb } from "../shared/tokens";
import {
  PLANE,
  backpropagate,
  forward,
  probability,
  probabilityGrid,
  type LabelledPoint,
  type Network,
} from "./engine";

const GRID = 56;

export interface DecisionOptions {
  base: { width: number; height: number };
  threshold?: number;
  heldOut?: readonly LabelledPoint[];
  picked?: LabelledPoint;
  /** Circle the training points the model currently gets wrong. */
  markWrong?: boolean;
}

/**
 * The model's opinion of every spot on the plane, shaded from one class colour through blank
 * (unsure) to the other, with the examples on top. Circles are class 0, triangles class 1.
 */
export function drawDecision(
  svg: SVGSVGElement,
  heat: HeatLayer,
  network: Network,
  points: readonly LabelledPoint[],
  options: DecisionOptions,
): Plot {
  const plot = createPlot(svg, {
    base: options.base,
    xRange: PLANE,
    yRange: PLANE,
    xLabel: "Input 1",
    yLabel: "Input 2",
    minimumHeightShare: 0.85,
  });
  const stops = [tokenRgb("--class-a"), tokenRgb("--surface"), tokenRgb("--class-b")];
  // Soften towards the surface colour so the examples stay legible on top.
  const surface = stops[1];
  heat.draw(plot, probabilityGrid(network, GRID, GRID), GRID, GRID, (p) => {
    const colour = ramp(stops, p);
    return [
      colour[0] * 0.42 + surface[0] * 0.58,
      colour[1] * 0.42 + surface[1] * 0.58,
      colour[2] * 0.42 + surface[2] * 0.58,
    ];
  });
  const threshold = options.threshold ?? 0.5;
  const mark = (point: LabelledPoint, radius: number, extra: string) => {
    const wrong =
      options.markWrong && probability(network, point.x, point.y) >= threshold !== (point.label === 1);
    const picked = options.picked === point;
    const classes = `${point.label ? "class-b" : "class-a"} ${extra} ${wrong ? "wrong" : ""} ${picked ? "picked" : ""}`;
    if (point.label) plot.triangle(point.x, point.y, radius, classes);
    else plot.circle(point.x, point.y, radius, classes);
  };
  options.heldOut?.forEach((point) => mark(point, 3.2, "faint"));
  points.forEach((point) => mark(point, 4.6, ""));
  return plot;
}

export type DiagramMode = "weights" | "blame";

/**
 * The network as wiring. Line thickness is the size of each weight (or, in blame mode, how
 * strongly one chosen example wants that weight changed); colour is its sign.
 */
export function drawDiagram(
  svg: SVGSVGElement,
  network: Network,
  mode: DiagramMode,
  example?: LabelledPoint,
): void {
  const width = 560;
  const height = 300;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const layers = network.sizes;
  const column = (layer: number) => 60 + (layer / (layers.length - 1)) * (width - 120);
  const row = (layer: number, unit: number) =>
    40 + ((unit + 0.5) / layers[layer]) * (height - 80) + (layers[layer] === 1 ? 0 : 0);

  const values =
    mode === "blame" && example ? backpropagate(network, [example]).weights : network.weights;
  const largest = Math.max(1e-9, ...values.flatMap((layer) => Array.from(layer, Math.abs)));
  for (let layer = 0; layer < values.length; layer += 1) {
    const fanIn = layers[layer];
    for (let j = 0; j < layers[layer + 1]; j += 1)
      for (let i = 0; i < fanIn; i += 1) {
        const value = values[layer][j * fanIn + i];
        const share = Math.abs(value) / largest;
        if (share < 0.02) continue;
        svg.append(
          svgElement("line", {
            x1: column(layer),
            y1: row(layer, i),
            x2: column(layer + 1),
            y2: row(layer + 1, j),
            class: `net-edge ${value < 0 ? "negative" : ""}`.trim(),
            "stroke-width": (0.6 + 5.4 * share).toFixed(2),
            "stroke-opacity": (0.25 + 0.7 * share).toFixed(2),
          }),
        );
      }
  }
  const activity = example ? forward(network, example.x, example.y) : undefined;
  for (let layer = 0; layer < layers.length; layer += 1)
    for (let unit = 0; unit < layers[layer]; unit += 1) {
      const node = svgElement("circle", {
        cx: column(layer),
        cy: row(layer, unit),
        r: 11,
        class: "net-node",
      });
      if (activity && layer > 0) {
        const level = Math.min(1, Math.abs(activity[layer][unit]));
        node.setAttribute("fill-opacity", (0.25 + 0.75 * level).toFixed(2));
      }
      svg.append(node);
    }
  const labels = ["inputs", ...layers.slice(1, -1).map((_, index) => `hidden ${index + 1}`), "output"];
  labels.forEach((text, layer) =>
    svg.append(
      svgElement(
        "text",
        { x: column(layer), y: height - 10, "text-anchor": "middle", class: "net-label" },
        text,
      ),
    ),
  );
}

/** Nearest example to a spot on the plane, for click-to-pick. */
export function nearestPoint(
  points: readonly LabelledPoint[],
  x: number,
  y: number,
): LabelledPoint | undefined {
  let best: LabelledPoint | undefined;
  let distance = Infinity;
  for (const point of points) {
    const d = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (d < distance) {
      distance = d;
      best = point;
    }
  }
  return best;
}
