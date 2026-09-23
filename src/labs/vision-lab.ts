import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { seededRandom, type Random } from "../shared/random";
import { THEME_EVENT } from "../shared/theme";
import {
  KERNEL,
  MAP,
  SHAPES,
  SIZE,
  accuracy,
  createModel,
  featureMap,
  knobCount,
  makePictures,
  predict,
  trainStep,
  type Design,
  type Model,
  type Picture,
} from "../vision/engine";
import source from "../vision/engine.ts?raw";
import { renderGrid } from "../vision/view";

const SEED = 20260920;
const STEPS = 1200;
const CHUNK = 60;
const BATCH = 16;
const TEST = 200;

interface Params extends Record<string, number | string> {
  design: string;
  units: number;
  shift: number;
  noise: number;
  rate: number;
}

const defaults: Params = { design: "dense", units: 32, shift: 0, noise: 0.2, rate: 0.2 };
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const SHAPE_NAMES = ["a bar", "a cross", "a ring", "a corner"];

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "design",
    label: "Network",
    options: [
      { value: "dense", label: "Fully connected: every pixel wired to every neuron" },
      { value: "conv", label: "Convolutional: small filters slid over the picture" },
    ],
  },
  {
    type: "select",
    key: "units",
    label: "Filters, or hidden neurons",
    options: [
      { value: "4", label: "4" },
      { value: "8", label: "8" },
      { value: "16", label: "16" },
      { value: "32", label: "32" },
    ],
  },
  {
    type: "range",
    key: "shift",
    label: "How far training shapes wander from the centre",
    min: 0,
    max: 3,
    step: 1,
    format: (value) => (value === 0 ? "not at all: always centred" : `up to ${value} pixels`),
    help: "The test pictures below always include shapes that wander up to 3 pixels, and shapes that stay centred.",
  },
  {
    type: "range",
    key: "noise",
    label: "Noise in the pictures",
    min: 0.1,
    max: 0.5,
    step: 0.1,
    format: (value) => value.toFixed(1),
  },
  {
    type: "select",
    key: "rate",
    label: "Learning rate",
    options: [
      { value: "0.05", label: "0.05" },
      { value: "0.2", label: "0.2" },
      { value: "0.5", label: "0.5" },
      { value: "2", label: "2: too big for the filters" },
    ],
  },
];

const lossChart = byId<SVGSVGElement>("see-loss");
let training: Picture[] = [];
let sameTest: Picture[] = [];
let shiftedTest: Picture[] = [];
let centredTest: Picture[] = [];
let model: Model;
let random: Random = seededRandom(SEED);
let losses: number[] = [];
let steps = 0;
let job = 0;

function data(): void {
  training = makePictures(400, params.shift, params.noise, SEED + 1);
  sameTest = makePictures(TEST, params.shift, params.noise, SEED + 2);
  shiftedTest = makePictures(TEST, 3, params.noise, SEED + 3);
  centredTest = makePictures(TEST, 0, params.noise, SEED + 4);
}

function fresh(): void {
  model = createModel(params.design as Design, params.units, SEED + 5);
  random = seededRandom(SEED + 6);
  losses = [];
  steps = 0;
}

function drawLoss(): void {
  const plot = createPlot(lossChart, {
    base: { width: 900, height: 220 },
    xRange: [0, STEPS],
    yRange: [0, Math.max(1.6, ...losses) * 1.05],
    xLabel: "Training steps",
    yLabel: "Surprise",
    xFormat: (value) => String(Math.round(value)),
  });
  plot.guide(
    "y",
    Math.log(SHAPES.length),
    `blind guessing: ${Math.log(SHAPES.length).toFixed(2)}`,
    "calm",
  );
  if (losses.length > 1)
    plot.line(
      losses.map((loss, at) => [at * CHUNK, loss] as const),
      "train",
    );
}

function drawGallery(): void {
  const host = byId("see-gallery");
  host.replaceChildren(
    ...shiftedTest.slice(0, 8).map((picture) => {
      const odds = predict(model, picture.pixels);
      let best = 0;
      for (let k = 1; k < odds.length; k += 1) if (odds[k] > odds[best]) best = k;
      const item = document.createElement("li");
      item.className = best === picture.label ? "right" : "wrong";
      const grid = document.createElement("div");
      renderGrid(grid, picture.pixels, SIZE, SIZE, {
        label: `A picture of ${SHAPE_NAMES[picture.label]}`,
      });
      const caption = document.createElement("span");
      caption.textContent = `${SHAPE_NAMES[picture.label]} · says ${SHAPE_NAMES[best]} (${percent(odds[best])})`;
      item.append(grid, caption);
      return item;
    }),
  );
}

function drawFilters(): void {
  const host = byId("see-filters");
  const caption = byId("see-filters-caption");
  host.replaceChildren();
  const shown = Math.min(model.units, 8);
  if (model.design === "conv") {
    caption.textContent = `The ${shown === model.units ? "" : `first ${shown} of the `}${model.units} learned filters, 3×3 each (blue negative, orange positive), and where each fires on one test picture`;
    const sample = shiftedTest[0];
    for (let f = 0; f < shown; f += 1) {
      const item = document.createElement("li");
      const filter = document.createElement("div");
      renderGrid(filter, model.weights1.subarray(f * 9, f * 9 + 9), KERNEL, KERNEL, {
        diverging: true,
        label: `Filter ${f + 1}`,
      });
      const map = document.createElement("div");
      renderGrid(map, featureMap(model, f, sample.pixels), MAP, MAP, {
        label: `Where filter ${f + 1} fires on a picture of ${SHAPE_NAMES[sample.label]}`,
      });
      const label = document.createElement("span");
      label.textContent = `filter ${f + 1}`;
      item.append(filter, map, label);
      host.append(item);
    }
  } else {
    caption.textContent = `The weights of ${shown === model.units ? "" : `the first ${shown} of `}${model.units} hidden neurons, one 12×12 picture each: what each neuron looks for, and where`;
    for (let h = 0; h < shown; h += 1) {
      const item = document.createElement("li");
      const weights = document.createElement("div");
      renderGrid(
        weights,
        model.weights1.subarray(h * SIZE * SIZE, (h + 1) * SIZE * SIZE),
        SIZE,
        SIZE,
        {
          diverging: true,
          label: `Neuron ${h + 1}'s weights`,
        },
      );
      const label = document.createElement("span");
      label.textContent = `neuron ${h + 1}`;
      item.append(weights, label);
      host.append(item);
    }
  }
}

function story(same: number, shifted: number, centred: number): string {
  const knobs = knobCount(model);
  const diverged = same < 0.4 && steps >= STEPS;
  if (diverged)
    return `Blind guessing scores 25%, and this network scores ${percent(same)} after ${STEPS} steps: the surprise never fell. A learning rate of ${params.rate} is too big a step for these knobs, exactly as in lesson 01, and the fix is the same.`;
  if (model.design === "dense" && params.shift === 0)
    return `${knobs.toLocaleString("en-GB")} knobs, and ${percent(same)} right on new pictures like the ones it trained on. Move the shapes up to three pixels and it scores ${percent(shifted)}, near blind guessing. Every neuron learned where the shape was, pixel by pixel, and a shape somewhere else lands on pixels it never learned about. Look at its weights below: they are pictures of centred shapes.`;
  if (model.design === "dense")
    return `${knobs.toLocaleString("en-GB")} knobs. Trained on shapes that wander, it scores ${percent(same)} on new ones that wander the same way${centred < same - 0.1 ? `, and only ${percent(centred)} on centred ones, which it saw fewer of` : ""}. It has had to learn each shape at every position separately, which is why it needs so many knobs and so much data.`;
  if (params.shift === 0)
    return `${knobs} knobs, ${model.units} filters, trained only on centred shapes: ${percent(same)} right on new centred pictures, and ${percent(shifted)} on shapes moved up to three pixels, which it never saw. One filter is slid over every position, so whatever it learned to detect, it detects anywhere. That is what sharing the knobs buys.`;
  return `${knobs} knobs, ${model.units} filters: ${percent(same)} right on new pictures, ${percent(shifted)} on shapes moved up to three pixels, ${percent(centred)} on centred ones. Look at the filters below: small detectors for edges and corners, each with a map of where it fired. The fully connected network needs more than ten times the knobs to do worse.`;
}

function report(): void {
  const same = accuracy(model, sameTest);
  const shifted = accuracy(model, shiftedTest);
  const centred = accuracy(model, centredTest);
  drawLoss();
  drawGallery();
  drawFilters();
  renderStats(byId("see-stats"), [
    { label: "Knobs", value: knobCount(model).toLocaleString("en-GB") },
    {
      label: "Right on new pictures, same wandering",
      value: percent(same),
      tone: same >= 0.9 ? "good" : undefined,
    },
    {
      label: "Right on shifted pictures",
      value: percent(shifted),
      tone: shifted >= 0.9 ? "good" : shifted < 0.5 ? "bad" : undefined,
    },
    { label: "Right on centred pictures", value: percent(centred) },
    { label: "Training steps", value: String(steps) },
  ]);
  byId("see-ledger").replaceChildren(
    ...SHAPES.map((shape, label) => {
      const row = document.createElement("tr");
      const score = (pictures: Picture[]) =>
        percent(
          accuracy(
            model,
            pictures.filter((p) => p.label === label),
          ),
        );
      const cells = [SHAPE_NAMES[label], score(sameTest), score(shiftedTest), score(centredTest)];
      row.append(
        ...cells.map((value, column) => {
          const cell = document.createElement(column === 0 ? "th" : "td");
          if (column === 0) cell.scope = "row";
          cell.textContent = value;
          return cell;
        }),
      );
      return row;
    }),
  );
  byId("see-outcome").textContent = story(same, shifted, centred);
  byId("see-name").textContent =
    `${model.design === "conv" ? "convolutional" : "fully connected"}, ${model.units} ${model.design === "conv" ? "filters" : "neurons"}, trained on ${params.shift === 0 ? "centred" : "wandering"} shapes`;
  byId("see-description").textContent =
    `${knobCount(model).toLocaleString("en-GB")} knobs trained for ${steps} steps on 400 pictures of four shapes${params.shift === 0 ? ", every one centred" : `, each moved up to ${params.shift} pixels`}. On ${TEST} new pictures: ${percent(same)} right when shapes wander as in training, ${percent(shifted)} when they wander up to three pixels, ${percent(centred)} when centred.`;
  byId("see-simulation-status").textContent =
    steps >= STEPS
      ? `Current · ${model.design === "conv" ? "convolutional" : "fully connected"} · ${model.units} ${model.design === "conv" ? "filters" : "neurons"} · training shapes ${params.shift === 0 ? "centred" : `wander up to ${params.shift}`} · noise ${params.noise.toFixed(1)} · rate ${params.rate} · ${STEPS} steps`
      : `Training… ${steps} of ${STEPS} steps`;
}

function train(): void {
  job += 1;
  const mine = job;
  data();
  fresh();
  const tick = (): void => {
    if (mine !== job) return;
    let loss = 0;
    for (let step = 0; step < CHUNK; step += 1) {
      const batch = Array.from(
        { length: BATCH },
        () => training[Math.floor(random() * training.length)],
      );
      loss += trainStep(model, batch, params.rate);
    }
    losses.push(loss / CHUNK);
    steps += CHUNK;
    if (steps % (CHUNK * 5) === 0 || steps >= STEPS) report();
    else byId("see-simulation-status").textContent = `Training… ${steps} of ${STEPS} steps`;
    if (steps < STEPS) requestAnimationFrame(tick);
  };
  byId("see-simulation-status").textContent = "Training…";
  requestAnimationFrame(tick);
}

const panel = renderControls(byId("see-controls"), "see", controls, params, train);

byId("see-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  train();
});

mountCodePeek(byId("code-peek"), {
  summary: "convolution itself: nine numbers slid over every position of a picture",
  source,
  marker: "convolve",
  pythonCaption: "The same two networks in PyTorch",
  python: `import torch.nn as nn

conv = nn.Sequential(                       # the convolutional design
    nn.Conv2d(1, 8, kernel_size=3),         # 8 filters of 3×3: 80 knobs
    nn.ReLU(),
    nn.AdaptiveMaxPool2d(1), nn.Flatten(),  # "how strongly did each filter fire, anywhere?"
    nn.Linear(8, 4),                        # 36 knobs
)

dense = nn.Sequential(                      # the fully connected design
    nn.Flatten(),
    nn.Linear(12 * 12, 32), nn.ReLU(),      # 4,640 knobs
    nn.Linear(32, 4),                       # 132 knobs
)
# Same loss, same optimiser, same loop as lesson 08's snippet. Only the wiring differs.`,
});

train();
redrawOnResize([lossChart], drawLoss);
window.addEventListener(THEME_EVENT, () => {
  drawGallery();
  drawFilters();
});
initLabPage();
