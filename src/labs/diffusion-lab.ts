import {
  STEPS,
  createDenoiser,
  distanceToShape,
  knobCount,
  makeSchedule,
  makeShape,
  sample,
  shareNearShape,
  type Denoiser,
  type Point,
  type Shape,
  type TrainProgress,
  type TrainRequest,
} from "../diffusion/engine";
import source from "../diffusion/engine.ts?raw";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";
import { nextSeed, seededRandom } from "../shared/random";

const SEED = 20260920;
const DRAWN = 400;
const PLANE = [-1.3, 1.3] as const;
const schedule = makeSchedule();

interface Params extends Record<string, number | string> {
  shape: string;
  hidden: number;
  budget: number;
  step: number;
}

const defaults: Params = { shape: "ring", hidden: 64, budget: 3000, step: STEPS };
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const NAMES: Record<string, string> = {
  ring: "a ring",
  spiral: "a spiral",
  moons: "two moons",
  heart: "a heart",
};

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "shape",
    label: "The shape to learn",
    options: [
      { value: "ring", label: "A ring" },
      { value: "heart", label: "A heart" },
      { value: "moons", label: "Two moons" },
      { value: "spiral", label: "A spiral" },
    ],
    help: "600 points on the shape are all the network ever sees. It never sees the shape whole.",
  },
  {
    type: "select",
    key: "hidden",
    label: "Neurons per hidden layer",
    options: [
      { value: "32", label: "32" },
      { value: "64", label: "64" },
    ],
  },
  {
    type: "select",
    key: "budget",
    label: "Training steps",
    options: [
      { value: "1000", label: "1,000: a quick look" },
      { value: "3000", label: "3,000" },
      { value: "6000", label: "6,000: about ten seconds" },
    ],
  },
  {
    type: "range",
    key: "step",
    label: "The drawing, step by step",
    min: 0,
    max: STEPS,
    step: 1,
    format: (value) =>
      value === 0 ? "0: pure noise" : value === STEPS ? `${STEPS}: finished` : String(value),
    help: "Slide back to watch the drawing emerge from noise.",
  },
];

const cloudChart = byId<SVGSVGElement>("draw-cloud");
const lossChart = byId<SVGSVGElement>("draw-loss");
let truth: Point[] = makeShape(params.shape as Shape, 400, SEED + 2);
let model: Denoiser = createDenoiser(params.hidden, SEED + 7);
let clouds: Point[][] = [];
let losses: { steps: number; loss: number }[] = [];
let finished = false;
let drawSeed = 5;
let job = 0;
let worker: Worker | undefined;
let noiseDistance = 0;

function redraw(): void {
  clouds = sample(model, schedule, DRAWN, seededRandom(drawSeed));
  noiseDistance = distanceToShape(clouds[0], truth);
}

function drawCloud(): void {
  const cloud = clouds[Math.min(params.step, clouds.length - 1)];
  const plot = createPlot(cloudChart, {
    base: { width: 760, height: 460 },
    xRange: PLANE,
    yRange: PLANE,
    xTicks: [],
    yTicks: [],
    minimumHeightShare: 0.85,
  });
  for (const point of truth) plot.circle(point.x, point.y, 2.2, "faint");
  for (const point of cloud) plot.circle(point.x, point.y, 3.4, "drawn");
}

function drawLoss(): void {
  const plot = createPlot(lossChart, {
    base: { width: 900, height: 220 },
    xRange: [0, params.budget],
    yRange: [0, Math.max(0.6, ...losses.map((entry) => entry.loss)) * 1.05],
    xLabel: "Training steps",
    yLabel: "Squared error of the noise guess",
    xFormat: (value) => String(Math.round(value)),
  });
  plot.guide("y", 1, "guessing zero: 1.0", "calm");
  if (losses.length > 1)
    plot.line(
      losses.map((entry) => [entry.steps, entry.loss] as const),
      "train",
    );
}

function story(distance: number, near: number): string {
  const step = Math.min(params.step, STEPS);
  const name = NAMES[params.shape];
  if (!finished && model.steps === 0)
    return "The network has not trained yet, so its guesses at the noise are random and the drawing stays a cloud. Training is under way.";
  if (step === 0)
    return `Step 0 of ${STEPS}: pure noise, ${DRAWN} points drawn at random. The average distance from a point to the shape is ${distance.toFixed(2)}. Everything that follows is the network subtracting the noise it thinks it sees, a little at a time.`;
  if (step < STEPS)
    return `Step ${step} of ${STEPS}. The average distance to ${name} has fallen from ${noiseDistance.toFixed(2)} to ${distance.toFixed(2)}.${step <= STEPS / 2 ? " The first half of the drawing undoes the stages where the shape was drowned beyond recognition, so it moves the cloud as a whole and the shape is not yet visible; it appears in the last third." : " The shape is forming: these last steps undo the lightly drowned stages, where the guess at the noise is precise."}`;
  const verdict =
    near > 0.85
      ? `A clean drawing: ${percent(near)} of the points lie within 0.1 of ${name}, and no point of the shape itself was ever handed to the sampler. It drew from what the noise-guesser learned.`
      : near > 0.6
        ? `A recognisable drawing: ${percent(near)} of the points lie within 0.1 of ${name}. The rest are smudged, mostly where the shape is thin or turns sharply. More training sharpens it; look at the loss curve for whether more would help.`
        : `A rough drawing: only ${percent(near)} of the points are within 0.1 of ${name}. ${params.shape === "spiral" ? "A thin spiral is the hardest of the four: the arms are close together, and a small network's guess at the noise blurs them." : "This small network and short training have not learned the shape's detail."} Train for longer, or compare with the ring.`;
  return `${verdict} The average distance to the shape is ${distance.toFixed(3)}, against ${noiseDistance.toFixed(2)} for pure noise${finished ? "" : ", with training still running"}.`;
}

function report(): void {
  const step = Math.min(params.step, clouds.length - 1);
  const cloud = clouds[step];
  const distance = distanceToShape(cloud, truth);
  const near = shareNearShape(cloud, truth);
  drawCloud();
  drawLoss();
  renderStats(byId("draw-stats"), [
    { label: "Knobs", value: knobCount(model).toLocaleString("en-GB") },
    { label: "Training steps so far", value: model.steps.toLocaleString("en-GB") },
    {
      label: "Average distance to the shape",
      value: distance.toFixed(3),
      tone: distance < 0.06 ? "good" : undefined,
    },
    {
      label: "Points within 0.1 of the shape",
      value: percent(near),
      tone: near > 0.85 ? "good" : near < 0.5 ? "bad" : undefined,
    },
    { label: "Same, for pure noise", value: percent(shareNearShape(clouds[0], truth)) },
  ]);
  byId("draw-ledger").replaceChildren(
    ...[0, 10, 20, 30, 40, 50, STEPS].map((at) => {
      const row = document.createElement("tr");
      const here = clouds[Math.min(at, clouds.length - 1)];
      const cells = [
        String(at),
        `${percent(schedule.keep[Math.max(0, Math.min(STEPS - 1, STEPS - at - 1))])}`,
        distanceToShape(here, truth).toFixed(3),
        percent(shareNearShape(here, truth)),
      ];
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
  byId("draw-outcome").textContent = story(distance, near);
  byId("draw-name").textContent =
    `${NAMES[params.shape]}, ${params.hidden} neurons per layer, ${params.budget.toLocaleString("en-GB")} steps`;
  byId("draw-description").textContent =
    `${knobCount(model).toLocaleString("en-GB")} knobs, trained ${model.steps.toLocaleString("en-GB")} steps to guess the noise in drowned points of ${NAMES[params.shape]}. Drawing ${DRAWN} points from pure noise in ${STEPS} steps, ${percent(shareNearShape(clouds[clouds.length - 1], truth))} of them finish within 0.1 of the shape, from ${percent(shareNearShape(clouds[0], truth))} at the start.`;
  byId("draw-simulation-status").textContent = finished
    ? `Current · ${NAMES[params.shape]} · ${params.hidden} neurons · ${model.steps} steps · drawing at step ${step} of ${STEPS}`
    : `Training… ${model.steps} of ${params.budget} steps`;
}

function train(): void {
  job += 1;
  const mine = job;
  finished = false;
  losses = [];
  truth = makeShape(params.shape as Shape, 400, SEED + 2);
  model = createDenoiser(params.hidden, SEED + 7);
  redraw();
  report();
  worker?.postMessage({ stop: true });
  worker ??= new Worker(new URL("./diffusion-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<TrainProgress>) => {
    if (event.data.id !== mine) return;
    model = event.data.model;
    losses.push({ steps: event.data.steps, loss: event.data.loss });
    finished = event.data.done;
    if (finished || event.data.steps % 1000 === 0) redraw();
    report();
  };
  const request: TrainRequest = {
    id: mine,
    shape: params.shape as Shape,
    hidden: params.hidden,
    budget: params.budget,
    seed: SEED,
  };
  worker.postMessage(request);
}

const panel = renderControls(byId("draw-controls"), "draw", controls, params, (key) => {
  if (key === "step") report();
  else train();
});

byId("draw-again").addEventListener("click", () => {
  drawSeed = nextSeed(drawSeed);
  redraw();
  report();
});

byId("draw-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  drawSeed = 5;
  train();
});

mountCodePeek(byId("code-peek"), {
  summary: "the whole of diffusion: drown, learn to guess the noise, draw by removing it",
  source,
  marker: "denoise",
  pythonCaption: "The same three pieces, as a library would write them",
  python: `# Training: the network learns one thing, to guess the noise in a drowned example.
for x0 in batches(points):
    t = randint(0, T)
    noise = randn_like(x0)
    xt = sqrt(keep[t]) * x0 + sqrt(1 - keep[t]) * noise      # drown
    loss = ((model(xt, t) - noise) ** 2).mean()               # lesson 00's squared error
    loss.backward(); optimiser.step()

# Drawing: start from noise and remove the guessed noise a little at a time.
x = randn(count, 2)
for t in reversed(range(T)):
    x = (x - beta[t] / sqrt(1 - keep[t]) * model(x, t)) / sqrt(1 - beta[t])
    if t > 0:
        x += sqrt(posterior_variance[t]) * randn_like(x)      # keep exploring until the end
# A picture model is exactly this with x of shape (3, 512, 512) and a much larger network.`,
});

train();
redrawOnResize([cloudChart, lossChart], () => {
  drawCloud();
  drawLoss();
});
initLabPage();
