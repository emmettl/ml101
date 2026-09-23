import { describe, expect, it } from "vitest";
import { seededRandom } from "../shared/random";
import {
  KERNEL,
  MAP,
  NAMED_FILTERS,
  SHAPES,
  SIZE,
  accuracy,
  convolve,
  createModel,
  knobCount,
  makePictures,
  predict,
  train,
  trainStep,
  type Design,
} from "./engine";

const fit = (design: Design, units: number, shift: number, rate = 0.2, steps = 1200) => {
  const model = createModel(design, units, 5);
  train(model, makePictures(400, shift, 0.2, 1), steps, rate, 16, seededRandom(9));
  return model;
};
const tests = {
  same: (shift: number) => makePictures(200, shift, 0.2, 2),
  shifted: makePictures(200, 3, 0.2, 3),
  centred: makePictures(200, 0, 0.2, 4),
};

describe("convolution", () => {
  it("copies the picture under the identity filter and sums nine cells under the blur", () => {
    const picture = makePictures(4, 0, 0, 1)[1];
    const out = new Float32Array(MAP * MAP);
    convolve(picture.pixels, NAMED_FILTERS.identity, out);
    for (let y = 0; y < MAP; y += 1)
      for (let x = 0; x < MAP; x += 1)
        expect(out[y * MAP + x]).toBeCloseTo(picture.pixels[(y + 1) * SIZE + (x + 1)], 6);
    convolve(picture.pixels, NAMED_FILTERS.blur, out);
    let total = 0;
    for (const value of out) total += value;
    expect(total).toBeGreaterThan(0);
    expect(KERNEL * KERNEL).toBe(9);
  });

  it("gives four odds that add to one, and a gradient step that lowers the batch loss", () => {
    const pictures = makePictures(16, 3, 0.2, 7);
    const model = createModel("conv", 8, 5);
    const odds = predict(model, pictures[0].pixels);
    expect(odds).toHaveLength(SHAPES.length);
    expect(Array.from(odds).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const before = trainStep(model, pictures, 0.2);
    let after = Infinity;
    for (let step = 0; step < 5; step += 1) after = trainStep(model, pictures, 0.2);
    expect(after).toBeLessThan(before);
    expect(knobCount(createModel("conv", 8, 1))).toBe(116);
    expect(knobCount(createModel("dense", 32, 1))).toBe(4772);
  });
});

describe("what the lesson and lab claim", () => {
  it("trained on centred shapes, the filters know moved ones and the dense net does not", () => {
    const conv = fit("conv", 8, 0);
    const dense = fit("dense", 32, 0);
    expect(accuracy(conv, tests.centred)).toBeGreaterThan(0.95);
    expect(accuracy(dense, tests.centred)).toBeGreaterThan(0.95);
    expect(accuracy(conv, tests.shifted)).toBeGreaterThan(0.95);
    expect(accuracy(dense, tests.shifted)).toBeLessThan(0.45);
  });

  it("trained on wandering shapes, 116 knobs beat 4,772", () => {
    const conv = fit("conv", 8, 3);
    const dense = fit("dense", 32, 3);
    expect(accuracy(conv, tests.same(3))).toBeGreaterThan(0.95);
    expect(accuracy(dense, tests.same(3))).toBeLessThan(accuracy(conv, tests.same(3)) - 0.05);
  });

  it("a learning rate of two is too big a step for the filters", () => {
    const wild = fit("conv", 8, 0, 2);
    expect(accuracy(wild, tests.same(0))).toBeLessThan(0.4);
  });
});
