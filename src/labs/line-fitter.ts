import {
  INTERCEPT_RANGE,
  OUTLIER,
  SLOPE_RANGE,
  X_RANGE,
  Y_RANGE,
  bestFit,
  loss,
  lossGrid,
  makeData,
  predict,
  type DataPoint,
  type Line,
  type LossKind,
} from "../fit/engine";
import source from "../fit/engine.ts?raw";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { syncHandles } from "../shared/drag";
import { createHeatLayer } from "../shared/heat";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { nextSeed } from "../shared/random";
import { THEME_EVENT } from "../shared/theme";
import { ramp, tokenRgb } from "../shared/tokens";

const GRID = 48;
const DEFAULT_SEED = 20260920;

interface Params extends Record<string, number | string> {
  slope: number;
  intercept: number;
  kind: LossKind;
  outlier: "off" | "on";
}

const defaults: Params = { slope: 0.2, intercept: 3, kind: "squared", outlier: "off" };
const params: Params = { ...defaults };
let seed = DEFAULT_SEED;
let points: DataPoint[] = makeData(seed);

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "slope",
    label: "Tilt (slope)",
    min: SLOPE_RANGE[0],
    max: SLOPE_RANGE[1],
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
  {
    type: "range",
    key: "intercept",
    label: "Lift (intercept)",
    min: INTERCEPT_RANGE[0],
    max: INTERCEPT_RANGE[1],
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
  {
    type: "select",
    key: "kind",
    label: "How the miss is measured",
    options: [
      { value: "squared", label: "Squared: big misses count far more" },
      { value: "absolute", label: "Plain distance: every unit counts the same" },
    ],
    help: "The choice changes the shape of the landscape, and so where its lowest point is.",
  },
  {
    type: "select",
    key: "outlier",
    label: "One far-away example",
    options: [
      { value: "off", label: "Off" },
      { value: "on", label: "On: a flat that rented for almost nothing" },
    ],
    help: "A single odd example, shown in red. Watch what it does to the best line.",
  },
];

const dataChart = byId<SVGSVGElement>("fit-data-chart");
const mapChart = byId<SVGSVGElement>("fit-map-chart");
const heat = createHeatLayer(byId("fit-map-host"));
const panel = renderControls(byId("fit-controls"), "fit", controls, params, () => render());

function examples(): DataPoint[] {
  return params.outlier === "on" ? [...points, OUTLIER] : points;
}

function clampLine(line: Line): Line {
  const clamp = (value: number, [low, high]: readonly [number, number]) =>
    Math.max(low, Math.min(high, value));
  return {
    slope: clamp(line.slope, SLOPE_RANGE),
    intercept: clamp(line.intercept, INTERCEPT_RANGE),
  };
}

function drawData(data: readonly DataPoint[], line: Line): void {
  const plot = createPlot(dataChart, {
    base: { width: 560, height: 420 },
    xRange: X_RANGE,
    yRange: Y_RANGE,
    xLabel: "Input",
    yLabel: "Answer",
    minimumHeightShare: 0.8,
  });
  const pixelsPerUnitX = plot.x(1) - plot.x(0);
  const pixelsPerUnitY = plot.y(0) - plot.y(1);
  for (const point of data) {
    const guess = predict(line, point.x);
    if (params.kind === "squared") {
      const side = (Math.abs(guess - point.y) * pixelsPerUnitY) / pixelsPerUnitX;
      plot.box(point.x, point.y, point.x + side, guess);
    } else {
      plot.segment(point.x, point.y, point.x, guess);
    }
  }
  plot.line(X_RANGE.map((x) => [x, predict(line, x)] as const));
  data.forEach((point, index) =>
    plot.circle(point.x, point.y, 5, index >= points.length ? "outlier" : ""),
  );
  syncHandles(
    dataChart,
    plot,
    points.map((point, index) => ({ x: point.x, y: point.y, label: `Example ${index + 1}` })),
    {
      onMove(index, x, y) {
        points[index] = { x, y };
        render();
      },
    },
  );
}

function drawMap(data: readonly DataPoint[], line: Line, best: Line): void {
  const plot = createPlot(mapChart, {
    base: { width: 560, height: 420 },
    xRange: SLOPE_RANGE,
    yRange: INTERCEPT_RANGE,
    xLabel: "Tilt",
    yLabel: "Lift",
    minimumHeightShare: 0.8,
  });
  const grid = lossGrid(data, params.kind, GRID, GRID);
  let low = Infinity;
  let high = -Infinity;
  for (const value of grid) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  // Colour by log-miss so the valley floor keeps its detail.
  const logLow = Math.log(low);
  const span = Math.log(high) - logLow || 1;
  const stops = [tokenRgb("--heat-low"), tokenRgb("--heat-mid"), tokenRgb("--heat-high")];
  heat.draw(plot, grid, GRID, GRID, (value) => ramp(stops, (Math.log(value) - logLow) / span));
  plot.circle(best.slope, best.intercept, 9, "goal");
  plot.circle(line.slope, line.intercept, 7, "here");
  syncHandles(
    mapChart,
    plot,
    [{ x: line.slope, y: line.intercept, label: "Current knob setting" }],
    {
      onMove(_index, x, y) {
        params.slope = x;
        params.intercept = y;
        panel.sync();
        render();
      },
    },
  );
}

function outcome(current: number, floor: number, data: readonly DataPoint[], line: Line): string {
  const ratio = current / floor;
  const unit = params.kind === "squared" ? "squared units" : "units";
  const worst = data
    .map((point) => Math.abs(predict(line, point.x) - point.y))
    .reduce((a, b) => Math.max(a, b), 0);
  const where =
    ratio < 1.01
      ? `You are at the bottom of the valley: the miss is ${current.toFixed(2)} ${unit}, and no setting of these two knobs does better.`
      : ratio < 1.25
        ? `You are on the valley floor, ${((ratio - 1) * 100).toFixed(0)}% above the lowest point. The miss is ${current.toFixed(2)} against a best possible ${floor.toFixed(2)}.`
        : `You are on a hillside. The miss is ${current.toFixed(2)} ${unit}, ${ratio.toFixed(1)} times the best possible ${floor.toFixed(2)}.`;
  const odd =
    params.outlier === "on"
      ? params.kind === "squared"
        ? " The red example is pulling the whole valley towards itself: squaring makes one large miss outweigh many small ones."
        : " The red example barely moves the valley: measured by plain distance, it is one vote among 25."
      : "";
  return `${where} The worst single example is off by ${worst.toFixed(1)}.${odd}`;
}

function drawLedger(data: readonly DataPoint[], line: Line, total: number): void {
  const rows = data
    .map((point, index) => {
      const guess = predict(line, point.x);
      const off = guess - point.y;
      const counts = params.kind === "squared" ? off * off : Math.abs(off);
      return { index, point, guess, off, counts };
    })
    .sort((a, b) => b.counts - a.counts);
  byId("fit-ledger").replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      const share = total > 0 ? row.counts / (total * data.length) : 0;
      const cells = [
        row.index >= points.length ? "Far-away example" : `Example ${row.index + 1}`,
        row.point.x.toFixed(2),
        row.point.y.toFixed(2),
        row.guess.toFixed(2),
        `${row.off >= 0 ? "+" : "−"}${Math.abs(row.off).toFixed(2)}`,
        row.counts.toFixed(2),
        `${(share * 100).toFixed(1)}%`,
      ];
      cells.forEach((text, column) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (column === 6 && share > 0.15) cell.className = "event-negative";
        tr.append(cell);
      });
      return tr;
    }),
  );
}

function render(): void {
  const data = examples();
  const line: Line = { slope: params.slope, intercept: params.intercept };
  const best = bestFit(data, params.kind);
  const current = loss(line, data, params.kind);
  const floor = loss(best, data, params.kind);

  byId("fit-name").textContent = params.kind === "squared" ? "Squared miss" : "Plain-distance miss";
  byId("fit-description").textContent =
    params.kind === "squared"
      ? "Each example's error is squared before averaging, so an example twice as far off counts four times as much. This is the default almost everywhere."
      : "Each example's error counts in proportion to its size. Large misses get no extra weight, which makes the fit hard to bully.";

  drawData(data, line);
  drawMap(data, line, best);
  renderStats(byId("fit-stats"), [
    {
      label: "Your miss",
      value: current.toFixed(2),
      tone: current / floor < 1.05 ? "good" : undefined,
    },
    { label: "Best possible", value: floor.toFixed(2) },
    { label: "Best tilt", value: best.slope.toFixed(2) },
    { label: "Best lift", value: best.intercept.toFixed(2) },
  ]);
  byId("fit-simulation-status").textContent =
    `Current · ${data.length} examples · ${params.kind === "squared" ? "squared" : "plain-distance"} miss · best setting solved exactly`;
  byId("fit-outcome").textContent = outcome(current, floor, data, line);
  drawLedger(data, line, current);
}

byId("fit-snap").addEventListener("click", () => {
  Object.assign(params, clampLine(bestFit(examples(), params.kind)));
  panel.sync();
  render();
});
byId("fit-resample").addEventListener("click", () => {
  seed = nextSeed(seed);
  points = makeData(seed);
  render();
});
byId("fit-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  seed = DEFAULT_SEED;
  points = makeData(seed);
  panel.sync();
  render();
});

mountCodePeek(byId("code-peek"), {
  summary: "the whole of “how wrong is this line?” in eight lines",
  source,
  marker: "loss",
  python: `import numpy as np

def loss(slope, intercept, x, y, kind="squared"):
    error = slope * x + intercept - y
    if kind == "squared":
        return np.mean(error ** 2)
    return np.mean(np.abs(error))

# The best squared fit has a formula:
slope, intercept = np.polyfit(x, y, deg=1)`,
});

render();
redrawOnResize([dataChart, mapChart], render);
window.addEventListener(THEME_EVENT, render);
initLabPage();
