import { describe, expect, it } from "vitest";

import {
  accuracy,
  asNetwork,
  backpropagate,
  createNetwork,
  crossEntropy,
  makeDataset,
  parameterCount,
  probability,
  probabilityGrid,
  sigmoid,
  splitDataset,
  train,
  type Activation,
  type DatasetKind,
  type Network,
} from "./engine";

const SEED = 20260920;

function numericSlope(network: Network, layer: number, index: number, bias: boolean): number {
  const data = makeDataset("circle", 3, 24);
  const target = bias ? network.biases[layer] : network.weights[layer];
  const h = 1e-6;
  const original = target[index];
  target[index] = original + h;
  const up = crossEntropy(network, data);
  target[index] = original - h;
  const down = crossEntropy(network, data);
  target[index] = original;
  return (up - down) / (2 * h);
}

describe("neurons", () => {
  it("squishes any number into a probability without overflowing", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBe(0);
    expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1, 12);
  });

  it("makes balanced, repeatable datasets and an even split", () => {
    for (const kind of ["blobs", "xor", "circle", "spiral"] as DatasetKind[]) {
      const points = makeDataset(kind, SEED);
      expect(points).toEqual(makeDataset(kind, SEED));
      expect(points.filter((point) => point.label === 1)).toHaveLength(100);
      const { train: training, heldOut } = splitDataset(points);
      expect(training).toHaveLength(160);
      expect(heldOut).toHaveLength(40);
    }
  });

  it("counts knobs", () => {
    expect(parameterCount(createNetwork([], "tanh", 1))).toBe(3);
    expect(parameterCount(createNetwork([8, 8], "tanh", 1))).toBe(2 * 8 + 8 + 8 * 8 + 8 + 8 + 1);
  });
});

describe("backpropagation", () => {
  for (const activation of ["tanh", "relu"] as Activation[]) {
    it(`matches finite differences for ${activation}`, () => {
      const network = createNetwork([5, 4], activation, 11);
      const data = makeDataset("circle", 3, 24);
      const slopes = backpropagate(network, data);
      for (let layer = 0; layer < network.weights.length; layer += 1) {
        for (const index of [0, network.weights[layer].length - 1]) {
          const numeric = numericSlope(network, layer, index, false);
          expect(Math.abs(slopes.weights[layer][index] - numeric)).toBeLessThan(
            1e-5 * Math.max(1, Math.abs(numeric)),
          );
        }
        const numeric = numericSlope(network, layer, 0, true);
        expect(Math.abs(slopes.biases[layer][0] - numeric)).toBeLessThan(
          1e-5 * Math.max(1, Math.abs(numeric)),
        );
      }
    });
  }
});

describe("training", () => {
  it("lets one neuron separate the blobs but never XOR", () => {
    const blobs = makeDataset("blobs", SEED);
    const single = createNetwork([], "tanh", 5);
    train(single, blobs, 600, 0.5, 16, 9);
    expect(accuracy(single, blobs)).toBeGreaterThan(0.93);

    const xor = makeDataset("xor", SEED);
    const stuck = createNetwork([], "tanh", 5);
    train(stuck, xor, 3000, 0.5, 16, 9);
    expect(accuracy(stuck, xor)).toBeLessThan(0.7);
  });

  it("solves XOR, the circle and the spiral once neurons are stacked", () => {
    const budget: Record<string, number> = { xor: 1500, circle: 1500, spiral: 4000 };
    for (const kind of ["xor", "circle", "spiral"] as DatasetKind[]) {
      const data = makeDataset(kind, SEED);
      const network = createNetwork([8, 8], "tanh", 5);
      const reached = train(network, data, budget[kind], 0.3, 16, 9);
      expect(reached, `${kind} should reach 95%`).toBeDefined();
      expect(accuracy(network, data)).toBeGreaterThanOrEqual(0.93);
    }
  });

  it("repeats exactly for the same seeds", () => {
    const data = makeDataset("circle", SEED);
    const run = () => {
      const network = createNetwork([6], "tanh", 5);
      train(network, data, 200, 0.3, 16, 9);
      return Array.from(network.weights[0]);
    };
    expect(run()).toEqual(run());
  });

  it("maps the plane to probabilities, and a neuron wraps as a one-layer network", () => {
    const network = createNetwork([4], "tanh", 2);
    const grid = probabilityGrid(network, 16, 16);
    expect(grid.every((value) => value >= 0 && value <= 1)).toBe(true);
    const neuron = asNetwork({ wx: 2, wy: -1, bias: 0.5 });
    expect(probability(neuron, 0.3, 0.2)).toBeCloseTo(sigmoid(2 * 0.3 - 0.2 + 0.5), 12);
  });
});
