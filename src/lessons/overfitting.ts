import {
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
} from "../overfit/engine";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { createPlot, redrawOnResize, type Point } from "../shared/plot";

const SEED = 20260920;
const NOISE = 0.25;
const train = makeSamples(SEED, 14, NOISE);
const heldOut = heldOutSamples(SEED, NOISE);
const sweep = sweepDegrees(train, heldOut, 0);
const sweetSpot = bestDegree(sweep);
const sweetError = sweep.find((row) => row.degree === sweetSpot)?.heldOutError ?? 0;

const chart = byId<SVGSVGElement>("lesson-chart");
const degree = byId<HTMLInputElement>("fit-degree");
const showHeld = byId<HTMLInputElement>("fit-held");
const showTruth = byId<HTMLInputElement>("fit-truth");

function curve(f: (x: number) => number): Point[] {
  return Array.from({ length: 241 }, (_, index) => {
    const x = X_RANGE[0] + (index / 240) * (X_RANGE[1] - X_RANGE[0]);
    return [x, f(x)] as const;
  });
}

function miss(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(3);
}

function prose(chosen: number, trainError: number, heldError: number): string {
  const reading = verdict(sweep, chosen);
  if (reading === "too simple")
    return `With ${chosen + 1} knobs the curve is too stiff to follow the wave. Both scores are poor, and close together: ${miss(trainError)} on the points it trained on, ${miss(heldError)} on the ones it never saw. When the two agree and both are bad, the machine needs more freedom.`;
  if (reading === "about right")
    return `With ${chosen + 1} knobs the curve follows the wave and ignores the scatter. It misses by ${miss(trainError)} on its own points and ${miss(heldError)} on the 200 it never saw. The held-out miss bottoms out at ${miss(sweetError)}, at flexibility ${sweetSpot}.`;
  return `With ${chosen + 1} knobs the curve passes almost exactly through its 14 training points: a miss of just ${miss(trainError)}. On the 200 points it never saw, the miss is ${miss(heldError)}, ${(heldError / sweetError).toFixed(0)} times worse than at flexibility ${sweetSpot}. It has learned the noise, not the shape.`;
}

function render(): void {
  const chosen = Number(degree.value);
  const fit = fitPolynomial(train, chosen, 0);
  const row = sweep[chosen - 1];
  const plot = createPlot(chart, {
    base: { width: 760, height: 360 },
    xRange: X_RANGE,
    yRange: Y_RANGE,
    xLabel: "Input",
    yLabel: "Answer",
  });
  if (showHeld.checked) for (const sample of heldOut) plot.circle(sample.x, sample.y, 2.4, "held");
  if (showTruth.checked) plot.line(curve(truth), "truth");
  plot.line(curve((x) => evaluate(fit, x)));
  for (const sample of train) plot.circle(sample.x, sample.y, 5);

  byId("fit-degree-value").textContent = String(chosen);
  byId("stat-1").textContent = String(chosen + 1);
  byId("stat-2").textContent = miss(row.trainError);
  byId("stat-3").textContent = miss(row.heldOutError);
  const reading = verdict(sweep, chosen);
  byId("stat-4").textContent =
    reading === "too simple" ? "Too stiff" : reading === "about right" ? "About right" : "Memorising";
  byId("fit-prose").textContent = prose(chosen, row.trainError, row.heldOutError);
}

[degree, showHeld, showTruth].forEach((input) => input.addEventListener("input", render));
render();
redrawOnResize([chart], render);
initLessonPage();
