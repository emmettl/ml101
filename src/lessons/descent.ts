import {
  bestSquaredFit,
  criticalLearningRate,
  loss,
  makeData,
  runDescent,
  type DescentRun,
} from "../fit/engine";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { createPlot, redrawOnResize } from "../shared/plot";

const STEPS = 60;
const data = makeData(20260920);
const floor = loss(bestSquaredFit(data), data);
const critical = criticalLearningRate(data);

const chart = byId<SVGSVGElement>("lesson-chart");
const rate = byId<HTMLInputElement>("descent-rate");
const batch = byId<HTMLSelectElement>("descent-batch");

type DescentVerdict = "Runs away" | "Overshoots, recovers" | "Arrives" | "Still crawling";

function describeRun(run: DescentRun, learningRate: number): DescentVerdict {
  if (run.diverged) return "Runs away";
  const bounced = run.losses.some((value, index) => index > 0 && value > run.losses[index - 1]);
  if (run.settledAt === undefined) return "Still crawling";
  return bounced && learningRate > critical * 0.7 ? "Overshoots, recovers" : "Arrives";
}

function prose(run: DescentRun, learningRate: number, miniBatch: boolean): string {
  const last = run.losses.at(-1) ?? 0;
  if (run.diverged)
    return `Learning rate ${learningRate.toFixed(3)}. Every step pointed downhill, but the stride is so long that each one lands higher up the far side of the valley. The miss passed a million after ${run.losses.length - 1} steps. For these examples anything above ${critical.toFixed(2)} does this.`;
  if (run.settledAt === undefined)
    return `Learning rate ${learningRate.toFixed(3)}. Sixty steps in, the miss is ${last.toFixed(2)} and still falling; the bottom is ${floor.toFixed(2)}. Nothing is wrong except the stride: at this pace it needs many more steps than it was given.`;
  const jitter = miniBatch
    ? " With only 4 examples per step the path wobbles, because each small sample gives a slightly different slope."
    : "";
  return `Learning rate ${learningRate.toFixed(3)}. It reached the bottom of the valley in ${run.settledAt} steps and stayed there at ${last.toFixed(2)}, which is as low as a straight line can go.${jitter}`;
}

function render(): void {
  const learningRate = 10 ** Number(rate.value);
  const batchSize = Number(batch.value);
  const run = runDescent(data, learningRate, STEPS, batchSize, 7);
  const plot = createPlot(chart, {
    base: { width: 760, height: 340 },
    xRange: [0, STEPS],
    yRange: [0.5, 1e6],
    yLog: true,
    xLabel: "Step",
    yLabel: "Miss (each gridline is ×10)",
    yTicks: [1, 10, 100, 1000, 1e4, 1e5, 1e6],
    yFormat: (value) => (value >= 1000 ? `${value / 1000}k` : String(value)),
  });
  plot.guide("y", floor, `best possible ${floor.toFixed(2)}`, "calm");
  plot.line(
    run.losses.map((value, step) => [step, value] as const),
    run.diverged ? "warn" : "",
  );

  const verdict = describeRun(run, learningRate);
  byId("descent-rate-value").textContent = learningRate.toFixed(3);
  byId("stat-1").textContent = learningRate.toFixed(3);
  byId("stat-2").textContent = run.diverged
    ? "over 1,000,000"
    : (run.losses.at(-1) ?? 0).toFixed(2);
  byId("stat-3").textContent = run.settledAt === undefined ? "not reached" : String(run.settledAt);
  byId("stat-4").textContent = verdict;
  byId("descent-prose").textContent = prose(run, learningRate, batchSize < data.length);
}

rate.addEventListener("input", render);
batch.addEventListener("change", render);
render();
redrawOnResize([chart], render);
initLessonPage();
