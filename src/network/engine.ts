/**
 * Classification with neurons. A single neuron is a line through the plane followed by a
 * squish into a probability; a network is layers of them. Both are trained by the same
 * gradient descent as the straight line in `src/fit`, with the slopes found by
 * backpropagation. No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export interface LabelledPoint {
  x: number;
  y: number;
  /** 0 or 1. */
  label: number;
}

export type DatasetKind = "blobs" | "xor" | "circle" | "spiral";
export type Activation = "tanh" | "relu";

export const PLANE = [-1.2, 1.2] as const;

/** Four small two-class puzzles, from "one line will do" to "needs real bending". */
export function makeDataset(
  kind: DatasetKind,
  seed: number,
  count = 200,
  noise = 0.08,
): LabelledPoint[] {
  const random = seededRandom(seed);
  const jitter = () => noise * normalRandom(random);
  const clamp = (value: number) => Math.max(PLANE[0], Math.min(PLANE[1], value));
  const points: LabelledPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = index % 2;
    let x = 0;
    let y = 0;
    if (kind === "blobs") {
      const centre = label ? 0.4 : -0.4;
      x = centre + 0.3 * normalRandom(random) + jitter();
      y = centre + 0.3 * normalRandom(random) + jitter();
    } else if (kind === "xor") {
      const sx = random() < 0.5 ? -1 : 1;
      const sy = label ? -sx : sx;
      x = sx * (0.18 + 0.7 * random()) + jitter();
      y = sy * (0.18 + 0.7 * random()) + jitter();
    } else if (kind === "circle") {
      const radius = label ? 0.7 + 0.25 * random() : 0.4 * Math.sqrt(random());
      const angle = 2 * Math.PI * random();
      x = radius * Math.cos(angle) + jitter();
      y = radius * Math.sin(angle) + jitter();
    } else {
      const t = 0.15 + 0.85 * random();
      const angle = t * 1.9 * Math.PI + (label ? Math.PI : 0);
      x = t * Math.cos(angle) + jitter() * 0.6;
      y = t * Math.sin(angle) + jitter() * 0.6;
    }
    points.push({ x: clamp(x), y: clamp(y), label });
  }
  return points;
}

/** Every fifth point is held back, so both sets cover the same ground. */
export function splitDataset(points: readonly LabelledPoint[]): {
  train: LabelledPoint[];
  heldOut: LabelledPoint[];
} {
  return {
    train: points.filter((_, index) => index % 5 !== 0),
    heldOut: points.filter((_, index) => index % 5 === 0),
  };
}

export function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

export interface Network {
  /** Layer widths, input first: [2, 8, 8, 1]. */
  sizes: number[];
  activation: Activation;
  /** weights[l][j * fanIn + i] joins unit i of layer l to unit j of layer l + 1. */
  weights: Float64Array[];
  biases: Float64Array[];
}

export function createNetwork(hidden: readonly number[], activation: Activation, seed: number) {
  const random = seededRandom(seed);
  const sizes = [2, ...hidden, 1];
  const weights: Float64Array[] = [];
  const biases: Float64Array[] = [];
  for (let layer = 0; layer < sizes.length - 1; layer += 1) {
    const fanIn = sizes[layer];
    const fanOut = sizes[layer + 1];
    const last = layer === sizes.length - 2;
    // Spread chosen so signals neither die nor explode on the way through.
    const spread = Math.sqrt((activation === "relu" && !last ? 2 : 1) / fanIn);
    weights.push(
      Float64Array.from({ length: fanIn * fanOut }, () => spread * normalRandom(random)),
    );
    biases.push(new Float64Array(fanOut).fill(activation === "relu" && !last ? 0.1 : 0));
  }
  return { sizes, activation, weights, biases } satisfies Network;
}

export function parameterCount(network: Network): number {
  return network.weights.reduce(
    (sum, layer, index) => sum + layer.length + network.biases[index].length,
    0,
  );
}

function activate(kind: Activation, z: number): number {
  return kind === "tanh" ? Math.tanh(z) : Math.max(0, z);
}

function activationSlope(kind: Activation, output: number): number {
  return kind === "tanh" ? 1 - output * output : output > 0 ? 1 : 0;
}

/** Outputs of every layer for one input; the last entry is the probability of class 1. */
export function forward(network: Network, x: number, y: number): Float64Array[] {
  const outputs: Float64Array[] = [Float64Array.of(x, y)];
  for (let layer = 0; layer < network.weights.length; layer += 1) {
    const input = outputs[layer];
    const fanIn = input.length;
    const width = network.sizes[layer + 1];
    const last = layer === network.weights.length - 1;
    const result = new Float64Array(width);
    for (let j = 0; j < width; j += 1) {
      let z = network.biases[layer][j];
      for (let i = 0; i < fanIn; i += 1) z += network.weights[layer][j * fanIn + i] * input[i];
      result[j] = last ? sigmoid(z) : activate(network.activation, z);
    }
    outputs.push(result);
  }
  return outputs;
}

export function probability(network: Network, x: number, y: number): number {
  return forward(network, x, y).at(-1)?.[0] ?? 0.5;
}

/** Cross-entropy: how surprised the model is by the right answers. Lower is better. */
export function crossEntropy(network: Network, points: readonly LabelledPoint[]): number {
  let total = 0;
  for (const point of points) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, probability(network, point.x, point.y)));
    total -= point.label ? Math.log(p) : Math.log(1 - p);
  }
  return total / points.length;
}

export function accuracy(network: Network, points: readonly LabelledPoint[]): number {
  let right = 0;
  for (const point of points)
    if (probability(network, point.x, point.y) >= 0.5 === (point.label === 1)) right += 1;
  return right / points.length;
}

export interface Gradients {
  weights: Float64Array[];
  biases: Float64Array[];
}

// peek:start backprop
/**
 * Backpropagation: the slope of the loss for every knob, in one backwards sweep. The output's
 * error (guess − answer) is the blame. Each layer hands its blame back to the layer before,
 * split in proportion to the weights it arrived through.
 */
export function backpropagate(network: Network, batch: readonly LabelledPoint[]): Gradients {
  const weights = network.weights.map((layer) => new Float64Array(layer.length));
  const biases = network.biases.map((layer) => new Float64Array(layer.length));
  for (const point of batch) {
    const outputs = forward(network, point.x, point.y);
    let blame = Float64Array.of(outputs[outputs.length - 1][0] - point.label);
    for (let layer = network.weights.length - 1; layer >= 0; layer -= 1) {
      const input = outputs[layer];
      const fanIn = input.length;
      const earlier = new Float64Array(fanIn);
      for (let j = 0; j < blame.length; j += 1) {
        biases[layer][j] += blame[j];
        for (let i = 0; i < fanIn; i += 1) {
          weights[layer][j * fanIn + i] += blame[j] * input[i];
          earlier[i] += blame[j] * network.weights[layer][j * fanIn + i];
        }
      }
      if (layer > 0)
        for (let i = 0; i < fanIn; i += 1)
          earlier[i] *= activationSlope(network.activation, input[i]);
      blame = earlier;
    }
  }
  const scale = 1 / batch.length;
  weights.forEach((layer) => layer.forEach((_, k) => (layer[k] *= scale)));
  biases.forEach((layer) => layer.forEach((_, k) => (layer[k] *= scale)));
  return { weights, biases };
}

/** The same update as the straight line: every knob moves a little way downhill. */
export function trainStep(network: Network, batch: readonly LabelledPoint[], rate: number): void {
  const slopes = backpropagate(network, batch);
  network.weights.forEach((layer, l) =>
    layer.forEach((_, k) => (layer[k] -= rate * slopes.weights[l][k])),
  );
  network.biases.forEach((layer, l) =>
    layer.forEach((_, k) => (layer[k] -= rate * slopes.biases[l][k])),
  );
}
// peek:end

export function sampleBatch(
  points: readonly LabelledPoint[],
  size: number,
  random: Random,
): LabelledPoint[] {
  return Array.from({ length: size }, () => points[Math.floor(random() * points.length)]);
}

/** Train for a fixed number of steps; returns the step at which accuracy first reached `goal`. */
export function train(
  network: Network,
  points: readonly LabelledPoint[],
  steps: number,
  rate: number,
  batchSize: number,
  seed: number,
  goal = 0.95,
): number | undefined {
  const random = seededRandom(seed);
  let reached: number | undefined;
  for (let step = 1; step <= steps; step += 1) {
    trainStep(network, sampleBatch(points, batchSize, random), rate);
    if (reached === undefined && step % 25 === 0 && accuracy(network, points) >= goal)
      reached = step;
  }
  return reached;
}

/** Class-1 probability over a grid of the plane: row 0 is the bottom. */
export function probabilityGrid(network: Network, columns: number, rows: number): Float64Array {
  const grid = new Float64Array(columns * rows);
  const span = PLANE[1] - PLANE[0];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1)
      grid[row * columns + column] = probability(
        network,
        PLANE[0] + ((column + 0.5) / columns) * span,
        PLANE[0] + ((row + 0.5) / rows) * span,
      );
  return grid;
}

/** Hidden units whose output is zero for every point: a ReLU that has died. */
export function deadUnits(network: Network, points: readonly LabelledPoint[]): number {
  if (network.activation !== "relu") return 0;
  let dead = 0;
  for (let layer = 1; layer < network.sizes.length - 1; layer += 1)
    for (let unit = 0; unit < network.sizes[layer]; unit += 1)
      if (points.every((point) => forward(network, point.x, point.y)[layer][unit] === 0)) dead += 1;
  return dead;
}

/** A single neuron: weights for x and y, and a bias. */
export interface Neuron {
  wx: number;
  wy: number;
  bias: number;
}

export function neuronProbability(neuron: Neuron, x: number, y: number): number {
  return sigmoid(neuron.wx * x + neuron.wy * y + neuron.bias);
}

export function asNetwork(neuron: Neuron): Network {
  return {
    sizes: [2, 1],
    activation: "tanh",
    weights: [Float64Array.of(neuron.wx, neuron.wy)],
    biases: [Float64Array.of(neuron.bias)],
  };
}

export function fromNetwork(network: Network): Neuron {
  return { wx: network.weights[0][0], wy: network.weights[0][1], bias: network.biases[0][0] };
}
