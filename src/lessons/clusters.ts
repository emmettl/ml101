import { PLANE, kMeans, makePoints, purity, type Shape } from "../cluster/engine";
import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { createPlot, redrawOnResize } from "../shared/plot";

const SEED = 20260920;
const chart = byId<SVGSVGElement>("lesson-chart");
const shape = byId<HTMLSelectElement>("clu-shape");
const kInput = byId<HTMLInputElement>("clu-k");
let frame = 0;

function prose(k: number, loss: number, agreement: number, roundsPlayed: number): string {
  if (k === 1)
    return `One centre lands in the middle of everything, and the loss is ${loss.toFixed(0)}. That is the number every larger k will be compared against, and every larger k will beat it. Nothing here says there is more than one group.`;
  if (shape.value === "three" && k === 3)
    return `Three centres, settled after ${roundsPlayed} rounds, and ${(agreement * 100).toFixed(0)}% of points are with the group they were made in. Nobody told the algorithm there were three; you did, through k.`;
  if (shape.value === "rings")
    return `${(agreement * 100).toFixed(0)}% of points are with their own ring, close to a coin toss. Each point goes to its nearest centre, so every boundary is a straight line, and no straight line separates a ring from its middle. The loss is ${loss.toFixed(0)}, and perfectly happy.`;
  if (shape.value === "stripes")
    return `The centres have cut across the stripes instead of between them: ${(agreement * 100).toFixed(0)}% agreement. A long thin group's middle is far from its ends, and the ends go to whichever centre is nearest, which is often the wrong one.`;
  if (shape.value === "uneven" && k === 2)
    return `${(agreement * 100).toFixed(0)}% agreement: the small group is found, but the fence between the two centres sits halfway between them, which is well inside the big group. K-means expects groups of similar spread.`;
  return `${k} centres, settled after ${roundsPlayed} rounds at a loss of ${loss.toFixed(0)}: ${(agreement * 100).toFixed(0)}% of points are with the group they were made in. With more centres than true groups the score rewards splitting, and the loss keeps falling regardless.`;
}

function render(): void {
  const k = Number(kInput.value);
  const points = makePoints(shape.value as Shape, SEED);
  const rounds = kMeans(points, k, "spread", 1);
  const last = rounds[rounds.length - 1];
  const plot = createPlot(chart, {
    base: { width: 760, height: 460 },
    xRange: PLANE,
    yRange: PLANE,
    xLabel: "Input 1",
    yLabel: "Input 2",
    minimumHeightShare: 0.85,
  });
  points.forEach((point, at) =>
    plot.circle(point.x, point.y, 4.2, `cluster-${last.assignment[at] % 8}`),
  );
  last.centres.forEach((centre, at) =>
    plot.circle(centre.x, centre.y, 9, `centre cluster-${at % 8}`),
  );
  const agreement = purity(points, last.assignment, k);
  byId("clu-k-value").textContent = String(k);
  byId("stat-1").textContent = String(rounds.length - 1);
  byId("stat-2").textContent = last.loss.toFixed(0);
  byId("stat-3").textContent = `${(agreement * 100).toFixed(0)}%`;
  byId("stat-4").textContent =
    agreement >= 0.95 ? "Found" : agreement >= 0.8 ? "Roughly" : "Missed";
  byId("clu-prose").textContent = prose(k, last.loss, agreement, rounds.length - 1);
}

function schedule(): void {
  byId("clu-k-value").textContent = kInput.value;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

kInput.addEventListener("input", schedule);
shape.addEventListener("change", schedule);
render();
redrawOnResize([chart], render);
initLessonPage();
