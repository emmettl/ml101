import {
  accuracy,
  asNetwork,
  createNetwork,
  crossEntropy,
  fromNetwork,
  makeDataset,
  neuronProbability,
  splitDataset,
  train,
  type LabelledPoint,
  type Neuron,
} from "../network/engine";
import source from "../network/engine.ts?raw";
import { drawDecision } from "../network/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize, type Plot } from "../shared/plot";
import { nextSeed, seededRandom } from "../shared/random";
import { attachHorizontalInspector } from "../shared/svg-interaction";
import { THEME_EVENT } from "../shared/theme";

const DEFAULT_SEED = 20260920;

type Pattern = "overlap" | "blobs" | "xor";

interface Params extends Record<string, number | string> {
  pattern: Pattern;
  threshold: number;
  wx: number;
  wy: number;
  bias: number;
}

const defaults: Params = { pattern: "overlap", threshold: 0.5, wx: 0, wy: 0, bias: 0 };
const params: Params = { ...defaults };
let seed = DEFAULT_SEED;
let points: LabelledPoint[] = [];

const PATTERNS: Record<Pattern, { name: string; description: string }> = {
  overlap: {
    name: "Overlapping clusters",
    description:
      "Two clusters that genuinely mix in the middle, like most real problems. No line gets everything right, so the cut-off decides which mistakes you make.",
  },
  blobs: {
    name: "Separate clusters",
    description:
      "Two clusters with clear air between them. Almost any sensible cut-off gives the same answer, so the choice hardly matters.",
  },
  xor: {
    name: "Opposite corners",
    description:
      "Each class sits in two opposite corners. One neuron draws one line, and no line separates them, however it is trained and wherever you cut.",
  },
};

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "pattern",
    label: "Pattern",
    options: [
      { value: "overlap", label: "Overlapping clusters" },
      { value: "blobs", label: "Separate clusters" },
      { value: "xor", label: "Opposite corners (XOR)" },
    ],
    help: "Changing the pattern retrains the neuron from scratch.",
  },
  {
    type: "range",
    key: "threshold",
    label: "Cut-off for “triangle”",
    min: 0.05,
    max: 0.95,
    step: 0.01,
    format: (value) => value.toFixed(2),
    help: "How sure the neuron must be before an example is called a triangle.",
  },
  {
    type: "range",
    key: "wx",
    label: "Weight on input 1",
    min: -12,
    max: 12,
    step: 0.1,
    format: (value) => value.toFixed(1),
  },
  {
    type: "range",
    key: "wy",
    label: "Weight on input 2",
    min: -12,
    max: 12,
    step: 0.1,
    format: (value) => value.toFixed(1),
  },
  {
    type: "range",
    key: "bias",
    label: "Bias",
    min: -8,
    max: 8,
    step: 0.1,
    format: (value) => value.toFixed(1),
  },
];

const mapChart = byId<SVGSVGElement>("neuron-map-chart");
const stripChart = byId<SVGSVGElement>("neuron-strip-chart");
const heat = createHeatLayer(byId("neuron-map-host"));
let stripPlot: Plot | undefined;

const neuron = (): Neuron => ({ wx: params.wx, wy: params.wy, bias: params.bias });

function loadPattern(): void {
  const all =
    params.pattern === "overlap"
      ? makeDataset("blobs", seed, 200, 0.3)
      : makeDataset(params.pattern, seed);
  points = splitDataset(all).train;
}

function trainNeuron(): void {
  const network = createNetwork([], "tanh", 5);
  train(network, points, 1500, 0.5, 16, 9);
  let learned = fromNetwork(network);
  const flipped = { wx: -learned.wx, wy: -learned.wy, bias: -learned.bias };
  if (accuracy(asNetwork(flipped), points) > accuracy(network, points)) learned = flipped;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  params.wx = clamp(learned.wx, 12);
  params.wy = clamp(learned.wy, 12);
  params.bias = clamp(learned.bias, 8);
}

interface Tally {
  flagged: number;
  falseAlarms: number;
  misses: number;
  right: number;
}

function tally(threshold: number): Tally {
  const current = neuron();
  const result: Tally = { flagged: 0, falseAlarms: 0, misses: 0, right: 0 };
  for (const point of points) {
    const called = neuronProbability(current, point.x, point.y) >= threshold;
    if (called) result.flagged += 1;
    if (called && !point.label) result.falseAlarms += 1;
    if (!called && point.label) result.misses += 1;
    if (called === (point.label === 1)) result.right += 1;
  }
  return result;
}

const inspector = attachHorizontalInspector(stripChart, () => {
  if (!stripPlot) return null;
  const plot = stripPlot;
  return {
    width: plot.width,
    left: plot.left,
    right: plot.right,
    top: plot.top,
    bottom: plot.height - plot.bottom,
    minimum: 0.05,
    maximum: 0.95,
    plotMinimum: 0,
    plotMaximum: 1,
    step: 0.01,
    value: params.threshold,
    label: "Cut-off",
    inspect: (value) => {
      const at = tally(value);
      return {
        title: `Cut-off ${value.toFixed(2)}`,
        rows: [
          { label: "False alarms", value: String(at.falseAlarms) },
          { label: "Misses", value: String(at.misses) },
          { label: "Right overall", value: `${((at.right / points.length) * 100).toFixed(0)}%` },
        ],
      };
    },
    onSelect: (value) => {
      if (Math.abs(value - params.threshold) < 1e-9) return;
      params.threshold = value;
      panel.sync();
      render();
    },
  };
});

function drawStrip(): void {
  stripPlot = createPlot(stripChart, {
    base: { width: 900, height: 250 },
    xRange: [0, 1],
    yRange: [0, 2],
    xLabel: "Neuron's confidence that the example is a triangle",
    xTicks: [0, 0.25, 0.5, 0.75, 1],
    xFormat: (value) => `${Math.round(value * 100)}%`,
    yTicks: [],
    minimumHeightShare: 0.8,
  });
  const plot = stripPlot;
  plot.box(params.threshold, 0, 1, 2, "plot-band");
  plot.guide("x", params.threshold, `cut-off ${params.threshold.toFixed(2)}`, "calm", "strong");
  // Spread each class over its own lane with a repeatable jitter so dots do not pile up.
  const random = seededRandom(17);
  const current = neuron();
  for (const point of points) {
    const p = neuronProbability(current, point.x, point.y);
    const lane = (point.label ? 1.5 : 0.5) + (random() - 0.5) * 0.7;
    const wrong = p >= params.threshold !== (point.label === 1);
    const classes = `${point.label ? "class-b" : "class-a"} ${wrong ? "wrong" : ""}`;
    if (point.label) plot.triangle(p, lane, 3.6, classes);
    else plot.circle(p, lane, 3.6, classes);
  }
  plot.text(0.01, 1.86, "triangles", "plot-label", "start");
  plot.text(0.01, 0.1, "circles", "plot-label", "start");
  stripChart.setAttribute(
    "aria-label",
    `Every example placed by the neuron's confidence. Cut-off at ${params.threshold.toFixed(2)}.`,
  );
  inspector.refresh();
}

function outcome(at: Tally, surprise: number): string {
  const share = at.right / points.length;
  if (params.pattern === "xor")
    return `${(share * 100).toFixed(0)}% right, with an average surprise of ${surprise.toFixed(2)}, which is what a coin flip scores. The shading is nearly blank everywhere: the best single line is no line at all, so the neuron has learned to shrug. Moving the cut-off only changes which half it shrugs towards.`;
  const lean =
    params.threshold > 0.6
      ? ` At a cut-off of ${params.threshold.toFixed(2)} the neuron must be very sure before it says triangle, so it raises few false alarms (${at.falseAlarms}) and lets more triangles through (${at.misses}).`
      : params.threshold < 0.4
        ? ` At a cut-off of ${params.threshold.toFixed(2)} a faint suspicion is enough, so it catches nearly every triangle (${at.misses} missed) and raises more false alarms (${at.falseAlarms}).`
        : ` At the even-handed cut-off of ${params.threshold.toFixed(2)} it makes ${at.falseAlarms} false alarms and ${at.misses} misses.`;
  const floor =
    params.pattern === "overlap"
      ? " The ringed examples sit where the two clusters mix. Retraining will not rescue them; they are this problem's error floor."
      : "";
  return `${at.right} of ${points.length} right, average surprise ${surprise.toFixed(2)}.${lean}${floor}`;
}

function drawLedger(): void {
  byId("neuron-ledger").replaceChildren(
    ...[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((cut) => {
      const at = tally(cut);
      const triangles = points.filter((point) => point.label === 1).length;
      const tr = document.createElement("tr");
      if (Math.abs(cut - params.threshold) < 0.05) tr.classList.add("selected-observation");
      const precision = at.flagged ? (at.flagged - at.falseAlarms) / at.flagged : undefined;
      [
        cut.toFixed(1),
        String(at.flagged),
        String(at.falseAlarms),
        String(at.misses),
        `${((at.right / points.length) * 100).toFixed(0)}%`,
        precision === undefined ? "none flagged" : `${(precision * 100).toFixed(0)}%`,
        `${(((triangles - at.misses) / triangles) * 100).toFixed(0)}%`,
      ].forEach((text) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        tr.append(cell);
      });
      return tr;
    }),
  );
}

function render(): void {
  const network = asNetwork(neuron());
  const at = tally(params.threshold);
  const surprise = crossEntropy(network, points);
  byId("neuron-name").textContent = PATTERNS[params.pattern].name;
  byId("neuron-description").textContent = PATTERNS[params.pattern].description;
  drawDecision(mapChart, heat, network, points, {
    base: { width: 900, height: 470 },
    threshold: params.threshold,
    markWrong: true,
  });
  drawStrip();
  renderStats(byId("neuron-stats"), [
    { label: "Right overall", value: `${((at.right / points.length) * 100).toFixed(0)}%` },
    { label: "False alarms", value: String(at.falseAlarms) },
    { label: "Misses", value: String(at.misses) },
    { label: "Average surprise", value: surprise.toFixed(2) },
  ]);
  byId("neuron-simulation-status").textContent =
    `Current · ${points.length} examples · one neuron, three knobs · cut-off ${params.threshold.toFixed(2)} · weights ${params.wx.toFixed(1)} and ${params.wy.toFixed(1)}, bias ${params.bias.toFixed(1)}`;
  byId("neuron-outcome").textContent = outcome(at, surprise);
  drawLedger();
}

const panel = renderControls(byId("neuron-controls"), "neuron", controls, params, (key) => {
  if (key === "pattern") {
    loadPattern();
    trainNeuron();
    panel.sync();
  }
  render();
});

function retrain(): void {
  trainNeuron();
  panel.sync();
  render();
}

byId("neuron-train").addEventListener("click", retrain);
byId("neuron-resample").addEventListener("click", () => {
  seed = nextSeed(seed);
  loadPattern();
  retrain();
});
byId("neuron-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  seed = DEFAULT_SEED;
  loadPattern();
  retrain();
});

mountCodePeek(byId("code-peek"), {
  summary: "a neuron, and the sweep that finds every knob's slope",
  source,
  marker: "backprop",
  python: `import numpy as np

def neuron(w, b, X):                     # X: one row per example
    return 1 / (1 + np.exp(-(X @ w + b)))  # weighted sum, then squish

def step(w, b, X, y, rate):
    blame = neuron(w, b, X) - y          # guess minus answer
    w -= rate * X.T @ blame / len(y)     # same rule as the straight line
    b -= rate * blame.mean()
    return w, b

called_triangle = neuron(w, b, X) >= cut_off   # the policy, not the model`,
});

loadPattern();
trainNeuron();
panel.sync();
render();
redrawOnResize([mapChart, stripChart], render);
window.addEventListener(THEME_EVENT, render);
initLabPage();
