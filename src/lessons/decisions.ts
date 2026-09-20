import {
  accuracy,
  asNetwork,
  createNetwork,
  crossEntropy,
  fromNetwork,
  makeDataset,
  splitDataset,
  train,
  type DatasetKind,
  type Neuron,
} from "../network/engine";
import { drawDecision } from "../network/view";
import { byId } from "../shared/controls";
import { createHeatLayer } from "../shared/heat";
import { initLessonPage } from "../shared/lesson";
import { redrawOnResize } from "../shared/plot";
import { THEME_EVENT } from "../shared/theme";

const SEED = 20260920;
const chart = byId<SVGSVGElement>("lesson-chart");
const heat = createHeatLayer(byId("lesson-host"));
const pattern = byId<HTMLSelectElement>("neuron-pattern");
const inputs = {
  wx: byId<HTMLInputElement>("neuron-wx"),
  wy: byId<HTMLInputElement>("neuron-wy"),
  bias: byId<HTMLInputElement>("neuron-bias"),
};

const data = (): ReturnType<typeof splitDataset>["train"] =>
  splitDataset(makeDataset(pattern.value as DatasetKind, SEED)).train;

function neuron(): Neuron {
  return {
    wx: Number(inputs.wx.value),
    wy: Number(inputs.wy.value),
    bias: Number(inputs.bias.value),
  };
}

function prose(share: number, surprise: number): string {
  const xor = pattern.value === "xor";
  if (share >= 0.97)
    return `The line separates the two clusters: ${(share * 100).toFixed(0)}% right, average surprise ${surprise.toFixed(2)}. Make the weights larger and the shading sharpens: same line, more confidence.`;
  if (xor && share <= 0.75)
    return `${(share * 100).toFixed(0)}% right, and it will not get much better. Whichever way the line is turned, it puts one pair of opposite corners on the same side. A coin flip would score 50% with a surprise of 0.69; this neuron is at ${surprise.toFixed(2)}.`;
  if (surprise > 1.2)
    return `${(share * 100).toFixed(0)}% right, but the average surprise is ${surprise.toFixed(2)}: the neuron is confidently wrong about some examples, and confident mistakes are what this score punishes. Look for strongly shaded regions holding the wrong shape.`;
  return `${(share * 100).toFixed(0)}% right, average surprise ${surprise.toFixed(2)}. The line is in roughly the right place. Tilt it with the two weights and slide it with the bias.`;
}

function render(): void {
  const points = data();
  const network = asNetwork(neuron());
  drawDecision(chart, heat, network, points, {
    base: { width: 760, height: 460 },
    markWrong: true,
  });
  const share = accuracy(network, points);
  const surprise = crossEntropy(network, points);
  byId("neuron-wx-value").textContent = neuron().wx.toFixed(1);
  byId("neuron-wy-value").textContent = neuron().wy.toFixed(1);
  byId("neuron-bias-value").textContent = neuron().bias.toFixed(1);
  byId("stat-1").textContent = `${Math.round(share * points.length)} of ${points.length}`;
  byId("stat-2").textContent = surprise.toFixed(2);
  byId("stat-4").textContent =
    share >= 0.97 ? "Separated" : pattern.value === "xor" ? "One line cannot" : "Not yet";
  byId("neuron-prose").textContent = prose(share, surprise);
}

byId("neuron-train").addEventListener("click", () => {
  const network = createNetwork([], "tanh", 5);
  train(network, data(), 1500, 0.5, 16, 9);
  let learned = fromNetwork(network);
  // Near chance the sign of the line is luck; keep whichever orientation scores better.
  const flipped = { wx: -learned.wx, wy: -learned.wy, bias: -learned.bias };
  if (accuracy(asNetwork(flipped), data()) > accuracy(network, data())) learned = flipped;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  inputs.wx.value = clamp(learned.wx, 10).toFixed(1);
  inputs.wy.value = clamp(learned.wy, 10).toFixed(1);
  inputs.bias.value = clamp(learned.bias, 6).toFixed(1);
  render();
});
Object.values(inputs).forEach((input) => input.addEventListener("input", render));
pattern.addEventListener("change", render);

render();
redrawOnResize([chart], render);
window.addEventListener(THEME_EVENT, render);
initLessonPage();
