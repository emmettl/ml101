import { makeDataset, splitDataset, type DatasetKind } from "../network/engine";
import { drawDecision } from "../network/view";
import { byId } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLessonPage } from "../shared/lesson";
import { redrawOnResize } from "../shared/plot";
import { seededRandom } from "../shared/random";
import { THEME_EVENT } from "../shared/theme";
import { ensembleAccuracy, ensembleProbability, fitTree, questionCount } from "../trees/engine";

const SEED = 20260920;
const FLIPPED = 0.1;
const chart = byId<SVGSVGElement>("lesson-chart");
const heat = createHeatLayer(byId("lesson-host"));
const pattern = byId<HTMLSelectElement>("tree-pattern");
const depth = byId<HTMLInputElement>("tree-depth");

const NAMES: Record<string, string> = {
  xor: "opposite corners",
  circle: "the ring",
  spiral: "the spiral",
};

let frame = 0;

function prose(questions: number, seen: number, unseen: number): string {
  const name = NAMES[pattern.value];
  const count = Number(depth.value);
  if (count === 1)
    return `One question is one straight cut, parallel to an axis: ${(unseen * 100).toFixed(0)}% right on unseen examples of ${name}. It is the tree's equivalent of lesson 03's single line, and it cannot do better than that line.`;
  if (seen - unseen > 0.07)
    return `${questions} questions: ${(seen * 100).toFixed(0)}% right on the training examples, ${(unseen * 100).toFixed(0)}% on unseen ones. One in ten training labels is wrong, and a tree this deep has drawn a private box around each wrong one. Lesson 02 again, in a new costume: the gap between the two scores is the memorising.`;
  return `${questions} questions draw ${name} out of boxes: ${(seen * 100).toFixed(0)}% on training examples, ${(unseen * 100).toFixed(0)}% on unseen ones, close together. Every edge of the boundary is parallel to an axis. A curve is beyond a tree; a staircase is not.`;
}

function render(): void {
  const count = Number(depth.value);
  const random = seededRandom(SEED + 1);
  const all = makeDataset(pattern.value as DatasetKind, SEED, 400, 0.15).map((point) =>
    random() < FLIPPED ? { ...point, label: 1 - point.label } : point,
  );
  const { train: training, heldOut } = splitDataset(all);
  const model = fitTree(training, count);
  drawDecision(chart, heat, (x, y) => ensembleProbability(model, x, y), training, {
    base: { width: 760, height: 460 },
    heldOut,
    grid: 96,
  });
  const seen = ensembleAccuracy(model, training);
  const unseen = ensembleAccuracy(model, heldOut);
  const questions = questionCount(model);
  byId("tree-depth-value").textContent = String(count);
  byId("stat-1").textContent = String(questions);
  byId("stat-2").textContent = `${(seen * 100).toFixed(0)}%`;
  byId("stat-3").textContent = `${(unseen * 100).toFixed(0)}%`;
  byId("stat-4").textContent =
    seen - unseen > 0.07 ? "Memorising" : unseen >= 0.88 ? "Captured" : "Too simple";
  byId("tree-prose").textContent = prose(questions, seen, unseen);
}

function schedule(): void {
  byId("tree-depth-value").textContent = depth.value;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

depth.addEventListener("input", schedule);
pattern.addEventListener("change", schedule);
render();
redrawOnResize([chart], render);
window.addEventListener(THEME_EVENT, render);
initLessonPage();
