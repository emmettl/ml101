import {
  accuracy,
  createNetwork,
  crossEntropy,
  makeDataset,
  parameterCount,
  probability,
  sampleBatch,
  splitDataset,
  train,
  trainStep,
  type Activation,
  type DatasetKind,
  type LabelledPoint,
  type Network,
} from "../network/engine";
import source from "../network/engine.ts?raw";
import { drawDecision, drawDiagram, nearestPoint, type DiagramMode } from "../network/view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize, type Plot } from "../shared/plot";
import { nextSeed, seededRandom, type Random } from "../shared/random";
import { THEME_EVENT } from "../shared/theme";
import { createTransport } from "../shared/transport";

const DATA_SEED = 20260920;
const SUMMARY_STEPS = 1500;
const LIVE_LIMIT = 6000;
const BATCH = 16;

interface Params extends Record<string, number | string> {
  pattern: DatasetKind;
  layers: number;
  units: number;
  activation: Activation;
  learningRate: number;
  speed: number;
}

const defaults: Params = {
  pattern: "circle",
  layers: 1,
  units: 8,
  activation: "tanh",
  learningRate: 0.3,
  speed: 100,
};
const params: Params = { ...defaults };

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "pattern",
    label: "Pattern",
    options: [
      { value: "blobs", label: "Two clusters" },
      { value: "xor", label: "Opposite corners (XOR)" },
      { value: "circle", label: "Ring around a centre" },
      { value: "spiral", label: "Two spiral arms" },
    ],
  },
  {
    type: "select",
    key: "layers",
    label: "Hidden layers",
    options: [
      { value: "1", label: "One" },
      { value: "2", label: "Two" },
    ],
  },
  {
    type: "range",
    key: "units",
    label: "Neurons per hidden layer",
    min: 1,
    max: 8,
    step: 1,
    format: (value) => String(value),
  },
  {
    type: "select",
    key: "activation",
    label: "The bend in each hidden neuron",
    options: [
      { value: "tanh", label: "tanh: a smooth S" },
      { value: "relu", label: "ReLU: flat, then a ramp" },
    ],
    help: "Any bend will do; without one the layers collapse into a single line.",
  },
  {
    type: "range",
    key: "learningRate",
    label: "Learning rate",
    min: -2.5,
    max: 0.5,
    step: 0.05,
    toParam: (position) => 10 ** position,
    fromParam: (value) => Math.log10(value),
    format: (value) => (value < 0.1 ? value.toFixed(3) : value.toFixed(2)),
  },
  {
    type: "select",
    key: "speed",
    label: "Playback speed",
    options: [
      { value: "25", label: "Slow: 25 steps a second" },
      { value: "100", label: "Normal: 100 steps a second" },
      { value: "500", label: "Fast: 500 steps a second" },
    ],
  },
];

const mapChart = byId<SVGSVGElement>("play-map-chart");
const diagram = byId<SVGSVGElement>("play-diagram");
const curveChart = byId<SVGSVGElement>("play-curve-chart");
const heat = createHeatLayer(byId("play-map-host"));
const playButton = byId<HTMLButtonElement>("play-play");
const modeButton = byId<HTMLButtonElement>("play-mode");

let startSeed = 5;
let training: LabelledPoint[] = [];
let heldOut: LabelledPoint[] = [];
let network: Network;
let batchRandom: Random;
let steps = 0;
let history: { step: number; train: number; held: number }[] = [];
let picked: LabelledPoint | undefined;
let mode: DiagramMode = "weights";
let mapPlot: Plot | undefined;
let ledgerKey = "";

const hidden = (): number[] => Array.from({ length: params.layers }, () => params.units);
const shape = (): string => [2, ...hidden(), 1].join(" → ");

function loadData(): void {
  ({ train: training, heldOut } = splitDataset(makeDataset(params.pattern, DATA_SEED)));
  picked = undefined;
}

function restart(): void {
  network = createNetwork(hidden(), params.activation, startSeed);
  batchRandom = seededRandom(9);
  steps = 0;
  history = [];
  record();
}

function record(): void {
  history.push({
    step: steps,
    train: crossEntropy(network, training),
    held: crossEntropy(network, heldOut),
  });
}

function stepOnce(): boolean {
  trainStep(network, sampleBatch(training, BATCH, batchRandom), params.learningRate);
  steps += 1;
  if (steps % 10 === 0) record();
  const last = history[history.length - 1];
  if (!Number.isFinite(last.train)) return false;
  return steps < LIVE_LIMIT;
}

const transport = createTransport({
  step: stepOnce,
  draw: drawLive,
  rate: () => params.speed,
  limit: LIVE_LIMIT,
  onState: (running) => {
    playButton.textContent = running ? "Pause" : "Play";
  },
});

function liveOutcome(): string {
  const seen = accuracy(network, training);
  const unseen = accuracy(network, heldOut);
  const last = history[history.length - 1];
  if (steps === 0)
    return `Step 0. The ${parameterCount(network)} knobs are random, so the map is noise and the network gets ${(seen * 100).toFixed(0)}% right by accident. Its average surprise is ${last.train.toFixed(2)}; a coin flip scores 0.69. Press Play.`;
  if (!Number.isFinite(last.train))
    return `The numbers overflowed after ${steps} steps. A learning rate of ${params.learningRate.toFixed(2)} is too long a stride for this network, exactly as in the Descent Lab. Lower it and press New start.`;
  const gap = last.held - last.train;
  const verdict =
    unseen >= 0.95
      ? "It has the pattern."
      : steps < 300
        ? "Still early: look for the first straight edges appearing in the shading."
        : seen < 0.9
          ? "It has stalled short. Either the network is too small for this pattern, or this random start was unlucky. Try New start, then more neurons."
          : "Nearly there.";
  const gapNote =
    gap > 0.15
      ? ` Held-out surprise (${last.held.toFixed(2)}) is running well above training surprise (${last.train.toFixed(2)}): the first sign of lesson 02.`
      : "";
  return `Step ${steps.toLocaleString("en-GB")}. ${(seen * 100).toFixed(0)}% right on the examples it trains on, ${(unseen * 100).toFixed(0)}% on the 40 it has never seen, average surprise ${last.train.toFixed(2)}. ${verdict}${gapNote}`;
}

function drawLive(): void {
  mapPlot = drawDecision(mapChart, heat, network, training, {
    base: { width: 560, height: 470 },
    heldOut,
    picked,
  });
  drawDiagram(diagram, network, mode, picked);
  byId("play-diagram-caption").textContent =
    mode === "blame" && picked
      ? "Blame from the selected example: thicker means “change me more”"
      : "The knobs: thicker means larger";

  const top = Math.max(0.8, ...history.map((entry) => Math.max(entry.train, entry.held)));
  const plot = createPlot(curveChart, {
    base: { width: 900, height: 260 },
    xRange: [0, Math.max(500, steps)],
    yRange: [0, Math.min(3, top * 1.05)],
    xLabel: "Step",
    yLabel: "Average surprise",
  });
  plot.guide("y", Math.LN2, "a coin flip: 0.69", "calm");
  plot.line(
    history.map((entry) => [entry.step, entry.train] as const),
    "train thin",
  );
  plot.line(
    history.map((entry) => [entry.step, entry.held] as const),
    "held thin",
  );
  byId("play-outcome").textContent =
    liveOutcome() +
    (picked
      ? ` Selected example: a ${picked.label ? "triangle" : "circle"} at (${picked.x.toFixed(2)}, ${picked.y.toFixed(2)}), which the network puts at ${(probability(network, picked.x, picked.y) * 100).toFixed(0)}% triangle.`
      : "");
}

function reading(unseen: number, seen: number): string {
  if (unseen >= 0.95) return "Captured";
  return seen - unseen > 0.08 ? "Memorising" : "Too simple";
}

function drawSummary(): void {
  const copy = createNetwork(hidden(), params.activation, startSeed);
  train(copy, training, SUMMARY_STEPS, params.learningRate, BATCH, 9);
  const seen = accuracy(copy, training);
  const unseen = accuracy(copy, heldOut);
  const finite = Number.isFinite(crossEntropy(copy, training));
  renderStats(byId("play-stats"), [
    { label: "Knobs", value: String(parameterCount(copy)) },
    { label: "Right on training", value: finite ? `${(seen * 100).toFixed(0)}%` : "overflowed" },
    {
      label: "Right on held-out",
      value: finite ? `${(unseen * 100).toFixed(0)}%` : "overflowed",
      tone: unseen >= 0.95 ? "good" : undefined,
    },
    { label: "Reading", value: finite ? reading(unseen, seen) : "Diverged" },
  ]);
  byId("play-simulation-status").textContent =
    `Current · ${shape()} · ${params.activation} · ${SUMMARY_STEPS.toLocaleString("en-GB")} steps of ${BATCH} examples at learning rate ${params.learningRate.toFixed(2)} · 160 training examples, 40 held out`;
  byId("play-name").textContent = shape();
  byId("play-description").textContent =
    `Two inputs, ${params.layers === 1 ? "one hidden layer" : "two hidden layers"} of ${params.units} ${params.units === 1 ? "neuron" : "neurons"}, one output: ${parameterCount(copy)} knobs, every one of them set by gradient descent and none by hand.`;

  // The sweep is eight full trainings, so redo it only when something it depends on changes.
  const key = [params.pattern, params.activation, params.learningRate, startSeed].join("|");
  if (key === ledgerKey) {
    byId("play-ledger")
      .querySelectorAll("tr")
      .forEach((row, index) =>
        row.classList.toggle(
          "selected-observation",
          params.layers === 1 && index + 1 === params.units,
        ),
      );
    return;
  }
  ledgerKey = key;
  byId("play-ledger").replaceChildren(
    ...Array.from({ length: 8 }, (_, index) => {
      const units = index + 1;
      const candidate = createNetwork([units], params.activation, startSeed);
      train(candidate, training, SUMMARY_STEPS, params.learningRate, BATCH, 9);
      const rowSeen = accuracy(candidate, training);
      const rowUnseen = accuracy(candidate, heldOut);
      const surprise = crossEntropy(candidate, heldOut);
      const label = Number.isFinite(surprise) ? reading(rowUnseen, rowSeen) : "Diverged";
      const tr = document.createElement("tr");
      if (params.layers === 1 && units === params.units) tr.classList.add("selected-observation");
      [
        String(units),
        String(parameterCount(candidate)),
        `${(rowSeen * 100).toFixed(0)}%`,
        `${(rowUnseen * 100).toFixed(0)}%`,
        Number.isFinite(surprise) ? surprise.toFixed(2) : "overflowed",
        label,
      ].forEach((text, column) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (column === 5)
          cell.className = label === "Captured" ? "event-positive" : "event-neutral";
        tr.append(cell);
      });
      return tr;
    }),
  );
}

function rebuild(): void {
  transport.pause();
  restart();
  drawSummary();
  drawLive();
}

const panel = renderControls(byId("play-controls"), "play", controls, params, (key) => {
  if (key === "speed") return;
  if (key === "pattern") loadData();
  rebuild();
});

playButton.addEventListener("click", () => {
  if (!transport.running && steps >= LIVE_LIMIT) restart();
  transport.toggle();
});
byId("play-step").addEventListener("click", () => {
  transport.pause();
  for (let index = 0; index < 25; index += 1) if (!stepOnce()) break;
  drawLive();
});
byId("play-restart").addEventListener("click", () => {
  startSeed = nextSeed(startSeed);
  rebuild();
});
byId("play-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  startSeed = 5;
  panel.sync();
  loadData();
  rebuild();
});
modeButton.addEventListener("click", () => {
  mode = mode === "weights" ? "blame" : "weights";
  modeButton.setAttribute("aria-pressed", String(mode === "blame"));
  modeButton.textContent =
    mode === "blame" ? "Show the knobs themselves" : "Show blame for the selected example";
  if (mode === "blame" && !picked) picked = training[0];
  drawLive();
});
byId("play-pick").addEventListener("click", () => {
  // The keyboard route to what a click on the map does: step through the training examples.
  const at = picked ? training.indexOf(picked) : -1;
  picked = training[(at + 7) % training.length];
  drawLive();
});
mapChart.addEventListener("click", (event) => {
  if (!mapPlot) return;
  const { x, y } = mapPlot.locate(event);
  picked = nearestPoint(training, x, y);
  drawLive();
});

mountCodePeek(byId("code-peek"), {
  summary: "backpropagation, in full",
  source,
  marker: "backprop",
  python: `import numpy as np

def forward(layers, x):
    outputs = [x]
    for W, b in layers[:-1]:
        outputs.append(np.tanh(W @ outputs[-1] + b))        # hidden: sum, then bend
    W, b = layers[-1]
    outputs.append(1 / (1 + np.exp(-(W @ outputs[-1] + b))))  # output: a probability
    return outputs

def step(layers, x, y, rate):
    outputs = forward(layers, x)
    blame = outputs[-1] - y                      # guess minus answer
    for (W, b), inp in zip(reversed(layers), reversed(outputs[:-1])):
        earlier = (W.T @ blame) * (1 - inp ** 2)  # hand blame back along the wires
        W -= rate * np.outer(blame, inp)          # knob <- knob - rate x slope
        b -= rate * blame
        blame = earlier`,
});

loadData();
restart();
drawSummary();
drawLive();
redrawOnResize([mapChart, curveChart], drawLive);
window.addEventListener(THEME_EVENT, drawLive);
initLabPage();
