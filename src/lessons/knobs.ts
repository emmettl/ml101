import {
  INTERCEPT_RANGE,
  SLOPE_RANGE,
  X_RANGE,
  Y_RANGE,
  bestSquaredFit,
  loss,
  makeData,
  predict,
  type Line,
} from "../fit/engine";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { createPlot, redrawOnResize } from "../shared/plot";

const data = makeData(20260920);
const best = bestSquaredFit(data);
const bestLoss = loss(best, data);
const START: Line = { slope: 0.2, intercept: 3 };

const chart = byId<SVGSVGElement>("lesson-chart");
const slope = byId<HTMLInputElement>("knob-slope");
const intercept = byId<HTMLInputElement>("knob-intercept");
const squares = byId<HTMLInputElement>("knob-squares");
let showBest = false;

function prose(current: number): string {
  const ratio = current / bestLoss;
  if (ratio < 1.01)
    return "That is as good as a straight line gets on these examples. What remains is noise: no setting of these two knobs removes it.";
  if (ratio < 1.15)
    return "Close. The squares that remain are mostly noise, but a small nudge to one knob still brings the number down.";
  if (ratio < 2.5)
    return "The line is in the right region. Look for the largest squares: they tell you which way to tilt.";
  return "A long way off. A few huge squares account for most of the miss, so fix those first. Lift the line to the cloud, then tilt it.";
}

function render(): void {
  const line: Line = { slope: Number(slope.value), intercept: Number(intercept.value) };
  const plot = createPlot(chart, {
    base: { width: 760, height: 360 },
    xRange: X_RANGE,
    yRange: Y_RANGE,
    xLabel: "Input (say, flat size)",
    yLabel: "Answer (rent)",
  });
  if (squares.checked) {
    // A square of side |miss| in data units, drawn with equal pixel sides.
    const pixelsPerUnitX = plot.x(1) - plot.x(0);
    const pixelsPerUnitY = plot.y(0) - plot.y(1);
    for (const point of data) {
      const guess = predict(line, point.x);
      const side = ((guess - point.y) * pixelsPerUnitY) / pixelsPerUnitX;
      plot.box(point.x, point.y, point.x + Math.abs(side), guess);
    }
  } else {
    for (const point of data) plot.segment(point.x, point.y, point.x, predict(line, point.x));
  }
  if (showBest)
    plot.line(
      X_RANGE.map((x) => [x, predict(best, x)] as const),
      "best",
    );
  plot.line(X_RANGE.map((x) => [x, predict(line, x)] as const));
  for (const point of data) plot.circle(point.x, point.y, 4.5);

  const current = loss(line, data);
  byId("knob-slope-value").textContent = line.slope.toFixed(2);
  byId("knob-intercept-value").textContent = line.intercept.toFixed(2);
  byId("stat-1").textContent = line.slope.toFixed(2);
  byId("stat-2").textContent = line.intercept.toFixed(2);
  byId("stat-3").textContent = current.toFixed(2);
  byId("stat-4").textContent = showBest ? bestLoss.toFixed(2) : "hidden";
  byId("knob-prose").textContent = prose(current);
}

function setKnobs(line: Line): void {
  const clamp = (value: number, [low, high]: readonly [number, number]) =>
    Math.max(low, Math.min(high, value));
  slope.value = clamp(line.slope, SLOPE_RANGE).toFixed(2);
  intercept.value = clamp(line.intercept, INTERCEPT_RANGE).toFixed(2);
}

[slope, intercept, squares].forEach((input) => input.addEventListener("input", render));
byId("knob-best").addEventListener("click", () => {
  showBest = true;
  render();
});
byId("knob-reset").addEventListener("click", () => {
  showBest = false;
  setKnobs(START);
  render();
});

render();
redrawOnResize([chart], render);
initLessonPage();
