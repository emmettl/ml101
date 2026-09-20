import {
  DESCENT_START,
  INTERCEPT_RANGE,
  SLOPE_RANGE,
  X_RANGE,
  Y_RANGE,
  bestSquaredFit,
  criticalLearningRate,
  descentStep,
  gradient,
  loss,
  lossGrid,
  makeData,
  predict,
  runDescent,
  type DataPoint,
  type Line,
} from "../fit/engine";
import source from "../fit/engine.ts?raw";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { seededRandom, type Random } from "../shared/random";
import { THEME_EVENT } from "../shared/theme";
import { ramp, tokenRgb } from "../shared/tokens";
import { createTransport } from "../shared/transport";

const GRID = 48;
const SUMMARY_STEPS = 60;
const WALK_LIMIT = 400;
const BATCH_SEED = 7;

interface Params extends Record<string, number | string> {
  learningRate: number;
  batch: number;
  speed: number;
}

const defaults: Params = { learningRate: 0.05, batch: 24, speed: 8 };
const params: Params = { ...defaults };

const data = makeData(20260920);
const best = bestSquaredFit(data);
const floor = loss(best, data);
const critical = criticalLearningRate(data);
const grid = lossGrid(data, "squared", GRID, GRID);

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "learningRate",
    label: "Learning rate (stride)",
    min: -3,
    max: -0.45,
    step: 0.01,
    toParam: (position) => 10 ** position,
    fromParam: (value) => Math.log10(value),
    format: (value) => value.toFixed(3),
    help: `Each notch multiplies the stride, so the slider covers 0.001 to 0.35. For these examples the largest safe rate is ${critical.toFixed(3)}.`,
  },
  {
    type: "select",
    key: "batch",
    label: "Examples looked at per step",
    options: [
      { value: "24", label: "All 24: exact slope, steady path" },
      { value: "8", label: "A random 8" },
      { value: "4", label: "A random 4: rough slope, jittery path" },
      { value: "1", label: "Just 1: very cheap, very noisy" },
    ],
    help: "Fewer examples per step is cheaper and noisier. This is stochastic gradient descent.",
  },
  {
    type: "select",
    key: "speed",
    label: "Playback speed",
    options: [
      { value: "2", label: "Slow: 2 steps a second" },
      { value: "8", label: "Normal: 8 steps a second" },
      { value: "40", label: "Fast: 40 steps a second" },
    ],
  },
];

const dataChart = byId<SVGSVGElement>("descent-data-chart");
const mapChart = byId<SVGSVGElement>("descent-map-chart");
const curveChart = byId<SVGSVGElement>("descent-curve-chart");
const heat = createHeatLayer(byId("descent-map-host"));
const playButton = byId<HTMLButtonElement>("descent-play");

let walk: Line[] = [DESCENT_START];
let walkLosses: number[] = [loss(DESCENT_START, data)];
let random: Random = seededRandom(BATCH_SEED);
let ranAway = false;

function batchOf(): readonly DataPoint[] {
  if (params.batch >= data.length) return data;
  return Array.from({ length: params.batch }, () => data[Math.floor(random() * data.length)]);
}

function restartWalk(): void {
  walk = [DESCENT_START];
  walkLosses = [loss(DESCENT_START, data)];
  random = seededRandom(BATCH_SEED);
  ranAway = false;
}

/** One live step. Returns false when there is no point taking another. */
function stepWalk(): boolean {
  if (ranAway || walk.length > WALK_LIMIT) return false;
  const next = descentStep(walk[walk.length - 1], batchOf(), params.learningRate);
  const miss = loss(next, data);
  walk.push(next);
  walkLosses.push(miss);
  if (!Number.isFinite(miss) || miss > 1e6) {
    ranAway = true;
    return false;
  }
  const settled = params.batch >= data.length && miss <= floor * 1.0005;
  return !settled;
}

const transport = createTransport({
  step: stepWalk,
  draw: drawWalk,
  rate: () => params.speed,
  limit: WALK_LIMIT,
  onState: (running) => {
    playButton.textContent = running ? "Pause" : "Play";
  },
});

function heatColour(): (value: number) => readonly [number, number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const value of grid) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const logLow = Math.log(low);
  const span = Math.log(high) - logLow || 1;
  const stops = [tokenRgb("--heat-low"), tokenRgb("--heat-mid"), tokenRgb("--heat-high")];
  return (value) => ramp(stops, (Math.log(value) - logLow) / span);
}

function walkOutcome(): string {
  const steps = walk.length - 1;
  const miss = walkLosses[steps];
  if (steps === 0)
    return `Standing at the start: tilt ${DESCENT_START.slope.toFixed(2)}, lift ${DESCENT_START.intercept.toFixed(2)}, a miss of ${miss.toFixed(2)}. The bottom of the valley is ${floor.toFixed(2)}. Press Step and watch which way the dot moves.`;
  if (ranAway)
    return `Gone after ${steps} steps. The dot left the map and the miss passed a million. Each step pointed downhill, but at ${params.learningRate.toFixed(3)} the stride is longer than the valley is wide, so every step lands higher on the far side than the last. Anything above ${critical.toFixed(3)} does this.`;
  const last = walk[steps];
  const rising = walkLosses.filter((value, index) => index > 0 && value > walkLosses[index - 1]);
  if (miss > walkLosses[0] && params.batch >= data.length)
    return `After ${steps} steps the miss is ${miss.toFixed(0)}, higher than the ${walkLosses[0].toFixed(2)} it started with, and ${rising.length} of those steps made things worse. The dot is swinging from one wall of the valley to the other, further each time. This stride is too long; it will not recover.`;
  const share = (miss - floor) / (walkLosses[0] - floor);
  const where =
    share < 0.001
      ? `It has arrived: after ${steps} steps the miss is ${miss.toFixed(2)}, the lowest a straight line can reach.`
      : `After ${steps} steps the miss is ${miss.toFixed(2)}, down from ${walkLosses[0].toFixed(2)}, with ${(share * 100).toFixed(share < 0.1 ? 1 : 0)}% of the descent still to go.`;
  const shape =
    params.batch < data.length
      ? ` With ${params.batch} example${params.batch === 1 ? "" : "s"} per step the slope is only an estimate, so the path wanders and ${rising.length} of the ${steps} steps went uphill. It still trends down, and near the bottom it will keep jittering rather than settle.`
      : rising.length > 0
        ? ` The stride is long enough to overshoot across the narrow direction of the valley: ${rising.length} steps went uphill before it recovered.`
        : params.learningRate > critical * 0.5
          ? " Look at the zig-zag: each step crosses the valley floor and the next one crosses back."
          : " The path bends because the valley is steep across and shallow along: descent fixes the steep direction first.";
  return `${where} The knobs are at tilt ${last.slope.toFixed(2)}, lift ${last.intercept.toFixed(2)}.${shape}`;
}

function drawWalk(): void {
  const current = walk[walk.length - 1];
  const dataPlot = createPlot(dataChart, {
    base: { width: 560, height: 420 },
    xRange: X_RANGE,
    yRange: Y_RANGE,
    xLabel: "Input",
    yLabel: "Answer",
    minimumHeightShare: 0.8,
  });
  dataPlot.line(
    X_RANGE.map((x) => [x, predict(best, x)] as const),
    "best",
  );
  dataPlot.line(X_RANGE.map((x) => [x, predict(current, x)] as const));
  for (const point of data) dataPlot.circle(point.x, point.y, 4.5);

  const mapPlot = createPlot(mapChart, {
    base: { width: 560, height: 420 },
    xRange: SLOPE_RANGE,
    yRange: INTERCEPT_RANGE,
    xLabel: "Tilt",
    yLabel: "Lift",
    minimumHeightShare: 0.8,
  });
  heat.draw(mapPlot, grid, GRID, GRID, heatColour());
  mapPlot.circle(best.slope, best.intercept, 9, "goal");
  mapPlot.line(
    walk.map((line) => [line.slope, line.intercept] as const),
    "path",
  );
  for (const line of walk.slice(0, -1).slice(-40))
    mapPlot.circle(line.slope, line.intercept, 2.5, "here");
  mapPlot.circle(current.slope, current.intercept, 7, "here");

  byId("descent-outcome").textContent = walkOutcome();
}

function drawSummary(): void {
  const run = runDescent(data, params.learningRate, SUMMARY_STEPS, params.batch, BATCH_SEED);
  const last = run.losses.at(-1) ?? 0;
  const plot = createPlot(curveChart, {
    base: { width: 900, height: 300 },
    xRange: [0, SUMMARY_STEPS],
    yRange: [0.5, 1e6],
    yLog: true,
    xLabel: "Step",
    yLabel: "Miss (×10 per line)",
    yTicks: [1, 10, 100, 1000, 1e4, 1e5, 1e6],
    yFormat: (value) => (value >= 1000 ? `${value / 1000}k` : String(value)),
  });
  plot.guide("y", floor, `best possible ${floor.toFixed(2)}`, "calm");
  plot.line(
    run.losses.map((value, step) => [step, value] as const),
    run.diverged ? "warn" : "",
  );

  const verdict = run.diverged
    ? "Runs away"
    : run.settledAt === undefined
      ? "Still crawling"
      : "Arrives";
  renderStats(byId("descent-stats"), [
    {
      label: "Miss after 60 steps",
      value: run.diverged ? "over 1,000,000" : last.toFixed(2),
      tone: run.diverged ? "bad" : last <= floor * 1.01 ? "good" : undefined,
    },
    {
      label: "Steps to the bottom",
      value: run.settledAt === undefined ? "not reached" : String(run.settledAt),
    },
    { label: "Largest safe rate", value: critical.toFixed(3) },
    { label: "Verdict", value: verdict, tone: run.diverged ? "bad" : undefined },
  ]);
  byId("descent-simulation-status").textContent =
    `Current · ${SUMMARY_STEPS} steps from the same start · learning rate ${params.learningRate.toFixed(3)} · ${params.batch >= data.length ? "all 24 examples" : `${params.batch} random example${params.batch === 1 ? "" : "s"}`} per step · best possible miss ${floor.toFixed(2)}`;

  const full = params.batch >= data.length;
  byId("descent-name").textContent = full ? "Full-batch descent" : "Mini-batch descent (SGD)";
  byId("descent-description").textContent = full
    ? "Every step measures the slope on all 24 examples, so the direction is exact and the path is smooth. Accurate, and expensive when the examples number in billions."
    : `Every step measures the slope on ${params.batch} random example${params.batch === 1 ? "" : "s"}. The direction is only roughly right, but each step costs ${Math.round(data.length / params.batch)} times less.`;

  // The arithmetic of the first ten full-batch-style steps at this rate.
  const rows: HTMLTableRowElement[] = [];
  let line = DESCENT_START;
  let previous = loss(line, data);
  for (let step = 0; step <= 10 && Number.isFinite(previous) && previous < 1e9; step += 1) {
    const slope = gradient(line, data);
    const tr = document.createElement("tr");
    const change =
      step === 0
        ? "start"
        : `${loss(line, data) - previous >= 0 ? "+" : "−"}${Math.abs(loss(line, data) - previous).toFixed(2)}`;
    const cells = [
      String(step),
      line.slope.toFixed(3),
      line.intercept.toFixed(3),
      slope.slope.toFixed(2),
      slope.intercept.toFixed(2),
      loss(line, data).toFixed(2),
      change,
    ];
    cells.forEach((text, column) => {
      const cell = document.createElement("td");
      cell.textContent = text.replace(/^-/, "−");
      if (column === 6 && step > 0)
        cell.className = loss(line, data) > previous ? "event-negative" : "event-positive";
      tr.append(cell);
    });
    rows.push(tr);
    previous = loss(line, data);
    line = descentStep(line, data, params.learningRate);
  }
  byId("descent-ledger").replaceChildren(...rows);
}

function onSettingChange(key: string): void {
  if (key !== "speed") {
    transport.pause();
    restartWalk();
    drawSummary();
  }
  drawWalk();
}

const panel = renderControls(
  byId("descent-controls"),
  "descent",
  controls,
  params,
  onSettingChange,
);

playButton.addEventListener("click", () => {
  if (!transport.running && (ranAway || walk.length > WALK_LIMIT)) restartWalk();
  transport.toggle();
});
byId("descent-step").addEventListener("click", () => transport.stepOnce());
byId("descent-restart").addEventListener("click", () => {
  transport.pause();
  restartWalk();
  drawWalk();
});
byId("descent-reset").addEventListener("click", () => {
  transport.pause();
  Object.assign(params, defaults);
  panel.sync();
  restartWalk();
  drawSummary();
  drawWalk();
});

mountCodePeek(byId("code-peek"), {
  summary: "gradient descent is a dozen lines, at any scale",
  source,
  marker: "descent",
  python: `import numpy as np

def step(slope, intercept, x, y, rate):
    error = slope * x + intercept - y
    grad_slope = np.mean(2 * error * x)      # uphill, for each knob
    grad_intercept = np.mean(2 * error)
    return slope - rate * grad_slope, intercept - rate * grad_intercept

slope, intercept = -0.6, 4.2
for _ in range(60):
    batch = np.random.choice(len(x), size=4)   # a random handful: SGD
    slope, intercept = step(slope, intercept, x[batch], y[batch], 0.05)`,
});

drawSummary();
drawWalk();
redrawOnResize([dataChart, mapChart, curveChart], () => {
  drawSummary();
  drawWalk();
});
window.addEventListener(THEME_EVENT, drawWalk);
initLabPage();
