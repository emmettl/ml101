import {
  accuracy,
  createNetwork,
  makeDataset,
  parameterCount,
  splitDataset,
  train,
  type DatasetKind,
} from "../network/engine";
import { drawDecision } from "../network/view";
import { byId } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLessonPage } from "../shared/lesson";
import { redrawOnResize } from "../shared/plot";
import { THEME_EVENT } from "../shared/theme";

const SEED = 20260920;
const STEPS = 2500;
const chart = byId<SVGSVGElement>("lesson-chart");
const heat = createHeatLayer(byId("lesson-host"));
const pattern = byId<HTMLSelectElement>("net-pattern");
const units = byId<HTMLInputElement>("net-units");

const NAMES: Record<string, string> = {
  xor: "opposite corners",
  circle: "the ring",
  spiral: "the spiral",
};

let frame = 0;

function prose(count: number, seen: number, unseen: number): string {
  const name = NAMES[pattern.value];
  const plural = count === 1 ? "neuron" : "neurons";
  if (unseen >= 0.95)
    return `${count} hidden ${plural} capture ${name}: ${(unseen * 100).toFixed(0)}% right on examples the network never saw. Count the straight edges in the boundary. Each one is a hidden neuron's line, and the output neuron has learned how to combine them.`;
  if (count === 1)
    return `One hidden neuron is still just one line, however it is dressed up: ${(unseen * 100).toFixed(0)}% on unseen examples of ${name}, which is about the best any single straight cut can do here. Add a second.`;
  return `${count} hidden ${plural} give the boundary ${count} straight edges to work with, which is not yet enough for ${name}: ${(seen * 100).toFixed(0)}% on the training examples, ${(unseen * 100).toFixed(0)}% on unseen ones. The two scores agree and both are short, so this is a machine that is too simple, not one that is memorising.`;
}

function render(): void {
  const count = Number(units.value);
  const { train: training, heldOut } = splitDataset(
    makeDataset(pattern.value as DatasetKind, SEED),
  );
  const network = createNetwork([count], "tanh", 5);
  train(network, training, STEPS, 0.3, 16, 9);
  drawDecision(chart, heat, network, training, {
    base: { width: 760, height: 460 },
    heldOut,
  });
  const seen = accuracy(network, training);
  const unseen = accuracy(network, heldOut);
  byId("net-units-value").textContent = String(count);
  byId("stat-1").textContent = String(count);
  byId("stat-2").textContent = String(parameterCount(network));
  byId("stat-3").textContent = `${(unseen * 100).toFixed(0)}%`;
  byId("stat-4").textContent = unseen >= 0.95 ? "Captured" : "Too simple";
  byId("net-prose").textContent = prose(count, seen, unseen);
}

function schedule(): void {
  byId("net-units-value").textContent = units.value;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

units.addEventListener("input", schedule);
pattern.addEventListener("change", schedule);
render();
redrawOnResize([chart], render);
window.addEventListener(THEME_EVENT, render);
initLessonPage();
