import {
  MAX_DEGREE,
  X_RANGE,
  Y_RANGE,
  bestDegree,
  evaluate,
  fitPolynomial,
  heldOutSamples,
  makeSamples,
  sweepDegrees,
  truth,
  verdict,
  type Sample,
  type SweepRow,
} from "../overfit/engine";
import source from "../overfit/engine.ts?raw";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize, type Plot, type Point } from "../shared/plot";
import { nextSeed } from "../shared/random";
import { attachHorizontalInspector } from "../shared/svg-interaction";

const DEFAULT_SEED = 20260920;
const PENALTY_OFF = -6;

interface Params extends Record<string, number | string> {
  degree: number;
  count: number;
  noise: number;
  /** log10 of the penalty strength; the bottom of the slider means "off". */
  penalty: number;
}

const defaults: Params = { degree: 6, count: 14, noise: 0.25, penalty: PENALTY_OFF };
const params: Params = { ...defaults };
let seed = DEFAULT_SEED;

const penaltyStrength = (): number => (params.penalty <= PENALTY_OFF ? 0 : 10 ** params.penalty);

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "degree",
    label: "Flexibility (degree)",
    min: 1,
    max: MAX_DEGREE,
    step: 1,
    format: (value) => `${value} · ${value + 1} knobs`,
    help: "1 is a straight line. Each step adds a knob and lets the curve bend once more.",
  },
  {
    type: "range",
    key: "count",
    label: "Training examples",
    min: 14,
    max: 80,
    step: 1,
    format: (value) => String(value),
    help: "The held-out set stays at 200 points and is never trained on.",
  },
  {
    type: "range",
    key: "noise",
    label: "Noise in the examples",
    min: 0.05,
    max: 0.6,
    step: 0.01,
    format: (value) => value.toFixed(2),
    help: "How far each example strays from the hidden wave. This sets the error floor.",
  },
  {
    type: "range",
    key: "penalty",
    label: "Penalty on wildness",
    min: PENALTY_OFF,
    max: 0,
    step: 0.1,
    format: (value) => (value <= PENALTY_OFF ? "off" : (10 ** value).toPrecision(1)),
    help: "A charge for large knob values, heaviest on the wiggliest terms. Regularisation.",
  },
];

const fitChart = byId<SVGSVGElement>("overfit-fit-chart");
const sweepChart = byId<SVGSVGElement>("overfit-sweep-chart");

let sweep: SweepRow[] = [];
let sweepPlot: Plot | undefined;

function miss(value: number): string {
  if (value >= 1e6) return "over 1,000,000";
  if (value >= 100) return Math.round(value).toLocaleString("en-GB");
  if (value >= 10) return value.toFixed(1);
  return value >= 0.01 ? value.toFixed(3) : value.toPrecision(1);
}

function curve(f: (x: number) => number): Point[] {
  return Array.from({ length: 321 }, (_, index) => {
    const x = X_RANGE[0] + (index / 320) * (X_RANGE[1] - X_RANGE[0]);
    return [x, f(x)] as const;
  });
}

const reading = (row: SweepRow): string => {
  const label = verdict(sweep, row.degree);
  return label === "too simple"
    ? "Too stiff"
    : label === "about right"
      ? "About right"
      : "Memorising";
};

const inspector = attachHorizontalInspector(sweepChart, () => {
  if (!sweepPlot || !sweep.length) return null;
  const plot = sweepPlot;
  return {
    width: plot.width,
    left: plot.left,
    right: plot.right,
    top: plot.top,
    bottom: plot.height - plot.bottom,
    minimum: 1,
    maximum: MAX_DEGREE,
    step: 1,
    value: params.degree,
    label: "Flexibility",
    inspect: (value) => {
      const row = sweep[Math.round(value) - 1];
      return {
        title: `Flexibility ${row.degree}`,
        rows: [
          { label: "Training miss", value: miss(row.trainError) },
          { label: "Held-out miss", value: miss(row.heldOutError) },
          { label: "Reading", value: reading(row) },
        ],
        points: [
          { y: plot.y(row.trainError), color: "var(--series-train)" },
          { y: plot.y(row.heldOutError), color: "var(--series-held)" },
        ],
      };
    },
    onSelect: (value) => {
      const chosen = Math.round(value);
      if (chosen === params.degree) return;
      params.degree = chosen;
      panel.sync();
      render();
    },
  };
});

function outcome(row: SweepRow, best: SweepRow): string {
  const label = verdict(sweep, row.degree);
  const penalised = penaltyStrength() > 0 ? " The penalty is holding the wiggly terms down." : "";
  if (label === "too simple")
    return `With ${row.degree + 1} knobs the curve is too stiff to follow the wave. It misses by ${miss(row.trainError)} on the ${params.count} points it trained on and ${miss(row.heldOutError)} on the 200 it never saw. The two scores agree, and both are poor: the fault is a lack of freedom, not a lack of data. The held-out miss is lowest at flexibility ${best.degree}.${penalised}`;
  if (label === "about right")
    return `With ${row.degree + 1} knobs the curve follows the wave and ignores the scatter: ${miss(row.trainError)} on its own points, ${miss(row.heldOutError)} on unseen ones. With noise at ${params.noise.toFixed(2)}, no model can average below about ${(params.noise ** 2).toFixed(3)} on fresh points, so this is close to the floor.${penalised}`;
  return `With ${row.degree + 1} knobs the curve threads its ${params.count} training points almost exactly, a miss of just ${miss(row.trainError)}. On the 200 points it never saw the miss is ${miss(row.heldOutError)}, ${(row.heldOutError / best.heldOutError).toFixed(0)} times worse than at flexibility ${best.degree}. Look between the solid points: that is where it goes wrong, because nothing there was holding it down.`;
}

function drawFit(train: readonly Sample[], heldOut: readonly Sample[]): void {
  const fit = fitPolynomial(train, params.degree, penaltyStrength());
  const plot = createPlot(fitChart, {
    base: { width: 900, height: 380 },
    xRange: X_RANGE,
    yRange: Y_RANGE,
    xLabel: "Input",
    yLabel: "Answer",
  });
  for (const sample of heldOut) plot.circle(sample.x, sample.y, 2.4, "held");
  plot.line(curve(truth), "truth");
  plot.line(curve((x) => evaluate(fit, x)));
  for (const sample of train) plot.circle(sample.x, sample.y, params.count > 40 ? 3.5 : 5);
}

function drawSweep(best: SweepRow): void {
  const values = sweep.flatMap((row) => [row.trainError, row.heldOutError]);
  const low = 10 ** Math.floor(Math.log10(Math.max(1e-6, Math.min(...values))));
  const high = 10 ** Math.ceil(Math.log10(Math.max(1, ...values)));
  sweepPlot = createPlot(sweepChart, {
    base: { width: 900, height: 320 },
    xRange: [1, MAX_DEGREE],
    yRange: [low, high],
    yLog: true,
    xLabel: "Flexibility (degree)",
    yLabel: "Miss (×10 per line)",
    xTicks: Array.from({ length: MAX_DEGREE }, (_, index) => index + 1),
    xFormat: (value) => String(value),
    yFormat: (value) => (value >= 1000 ? `${value / 1000}k` : String(Number(value.toPrecision(1)))),
  });
  sweepPlot.guide("x", best.degree, `lowest held-out: ${best.degree}`, "calm");
  sweepPlot.line(
    sweep.map((row) => [row.degree, row.trainError] as const),
    "train",
  );
  sweepPlot.line(
    sweep.map((row) => [row.degree, row.heldOutError] as const),
    "held",
  );
  const chosen = sweep[params.degree - 1];
  sweepPlot.circle(chosen.degree, chosen.trainError, 5);
  sweepPlot.circle(chosen.degree, chosen.heldOutError, 6, "here");
  sweepChart.setAttribute(
    "aria-label",
    `Training and held-out miss at each flexibility. Selected: ${chosen.degree}.`,
  );
  inspector.refresh();
}

function drawLedger(best: SweepRow): void {
  byId("overfit-ledger").replaceChildren(
    ...sweep.map((row) => {
      const tr = document.createElement("tr");
      if (row.degree === params.degree) tr.classList.add("selected-observation");
      if (row.degree === best.degree) tr.classList.add("best-row");
      const label = reading(row);
      const ratio = row.heldOutError / Math.max(row.trainError, 1e-12);
      [
        String(row.degree),
        String(row.degree + 1),
        miss(row.trainError),
        miss(row.heldOutError),
        ratio >= 1000 ? "over 1,000×" : `${ratio.toFixed(1)}×`,
        label,
      ].forEach((text, column) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (column === 5)
          cell.className =
            label === "About right"
              ? "event-positive"
              : label === "Memorising"
                ? "event-negative"
                : "event-neutral";
        tr.append(cell);
      });
      return tr;
    }),
  );
}

function render(): void {
  const train = makeSamples(seed, params.count, params.noise);
  const heldOut = heldOutSamples(seed, params.noise);
  sweep = sweepDegrees(train, heldOut, penaltyStrength());
  const best = sweep[bestDegree(sweep) - 1];
  const row = sweep[params.degree - 1];

  drawFit(train, heldOut);
  drawSweep(best);
  drawLedger(best);

  const label = reading(row);
  byId("overfit-name").textContent = label;
  byId("overfit-description").textContent =
    label === "Too stiff"
      ? "Underfitting: the machine cannot express the pattern, so more training would not help. Both scores are poor and close together."
      : label === "About right"
        ? "The curve has enough freedom to follow the pattern and not enough to chase the noise. Both scores are good and close together."
        : "Overfitting: the training score is superb and the held-out score is not. The extra freedom went into reproducing noise.";
  renderStats(byId("overfit-stats"), [
    { label: "Training miss", value: miss(row.trainError) },
    {
      label: "Held-out miss",
      value: miss(row.heldOutError),
      tone: label === "Memorising" ? "bad" : label === "About right" ? "good" : undefined,
    },
    { label: "Best flexibility", value: String(best.degree) },
    { label: "Noise floor", value: (params.noise ** 2).toFixed(3) },
  ]);
  byId("overfit-simulation-status").textContent =
    `Current · ${params.count} training examples · 200 held-out · noise ${params.noise.toFixed(2)} · penalty ${penaltyStrength() > 0 ? penaltyStrength().toPrecision(1) : "off"} · exact least-squares fit at every flexibility`;
  byId("overfit-outcome").textContent = outcome(row, best);
}

const panel = renderControls(byId("overfit-controls"), "overfit", controls, params, () => render());

byId("overfit-resample").addEventListener("click", () => {
  seed = nextSeed(seed);
  render();
});
byId("overfit-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  seed = DEFAULT_SEED;
  panel.sync();
  render();
});

mountCodePeek(byId("code-peek"), {
  summary: "fit a curve, then score it on points it never saw",
  source,
  marker: "fit",
  python: `import numpy as np
from numpy.polynomial import chebyshev as C

t = 2 * (x_train - 0) / (4 - 0) - 1            # rescale x to [-1, 1]
weights = C.chebfit(t, y_train, deg=12)        # 13 knobs, 14 points

def miss(x, y):
    guess = C.chebval(2 * x / 4 - 1, weights)
    return np.mean((guess - y) ** 2)

miss(x_train, y_train)   # ~0.0004: looks wonderful
miss(x_held, y_held)     # ~22:     it is not`,
});

render();
redrawOnResize([fitChart, sweepChart], render);
initLabPage();
