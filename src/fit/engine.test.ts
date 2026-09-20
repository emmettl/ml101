import { describe, expect, it } from "vitest";

import {
  bestAbsoluteFit,
  bestSquaredFit,
  criticalLearningRate,
  descentStep,
  gradient,
  loss,
  lossGrid,
  makeData,
  runDescent,
  withOutlier,
  type Line,
} from "./engine";

const data = makeData(20260920);

describe("line fitting", () => {
  it("generates the same data for the same seed", () => {
    expect(makeData(5)).toEqual(makeData(5));
    expect(makeData(5)).not.toEqual(makeData(6));
    expect(data).toHaveLength(24);
  });

  it("finds a squared-loss minimum: the gradient vanishes and nearby lines are worse", () => {
    const best = bestSquaredFit(data);
    const slope = gradient(best, data);
    expect(Math.abs(slope.slope)).toBeLessThan(1e-9);
    expect(Math.abs(slope.intercept)).toBeLessThan(1e-9);
    const here = loss(best, data);
    for (const nudge of [-0.05, 0.05]) {
      expect(loss({ ...best, slope: best.slope + nudge }, data)).toBeGreaterThan(here);
      expect(loss({ ...best, intercept: best.intercept + nudge }, data)).toBeGreaterThan(here);
    }
  });

  it("matches the analytic gradient to a finite difference", () => {
    const line: Line = { slope: 0.3, intercept: 2.1 };
    const h = 1e-6;
    const numeric =
      (loss({ ...line, slope: line.slope + h }, data) -
        loss({ ...line, slope: line.slope - h }, data)) /
      (2 * h);
    expect(gradient(line, data).slope).toBeCloseTo(numeric, 5);
  });

  it("lets one outlier drag the squared fit further than the absolute fit", () => {
    const clean = bestSquaredFit(data);
    const dirty = withOutlier(data, true);
    const squaredShift = Math.abs(bestSquaredFit(dirty).slope - clean.slope);
    const absoluteShift = Math.abs(bestAbsoluteFit(dirty).slope - bestAbsoluteFit(data).slope);
    expect(squaredShift).toBeGreaterThan(absoluteShift * 2);
    const absolute = bestAbsoluteFit(dirty);
    expect(loss(absolute, dirty, "absolute")).toBeLessThanOrEqual(
      loss(bestSquaredFit(dirty), dirty, "absolute") + 1e-9,
    );
  });

  it("fills the landscape grid with finite losses whose minimum sits near the best fit", () => {
    const grid = lossGrid(data, "squared", 32, 32);
    expect(grid.every(Number.isFinite)).toBe(true);
    expect(Math.min(...grid)).toBeLessThan(loss(bestSquaredFit(data), data) * 1.2);
  });
});

describe("gradient descent", () => {
  const critical = criticalLearningRate(data);

  it("moves downhill for a small step", () => {
    const start: Line = { slope: -0.6, intercept: 4.2 };
    expect(loss(descentStep(start, data, 0.02), data)).toBeLessThan(loss(start, data));
  });

  it("settles just below the critical learning rate and diverges just above it", () => {
    expect(critical).toBeGreaterThan(0.1);
    expect(critical).toBeLessThan(0.5);
    const below = runDescent(data, critical * 0.95, 400);
    const above = runDescent(data, critical * 1.05, 400);
    expect(below.diverged).toBe(false);
    expect(below.losses.at(-1)).toBeLessThan(below.losses[0]);
    expect(above.diverged).toBe(true);
  });

  it("crawls when the learning rate is tiny and settles when it is moderate", () => {
    const slow = runDescent(data, 0.002, 60);
    const good = runDescent(data, 0.08, 60);
    expect(slow.settledAt).toBeUndefined();
    expect(good.settledAt).toBeDefined();
    expect(good.losses.at(-1)).toBeLessThan(slow.losses.at(-1) ?? 0);
  });

  it("is noisier with mini-batches but repeats exactly for a given seed", () => {
    const first = runDescent(data, 0.05, 80, 4, 11);
    const second = runDescent(data, 0.05, 80, 4, 11);
    expect(first.losses).toEqual(second.losses);
    const full = runDescent(data, 0.05, 80);
    const rises = (run: typeof full) =>
      run.losses.filter((value, index) => index > 0 && value > run.losses[index - 1]).length;
    expect(rises(first)).toBeGreaterThan(rises(full));
  });
});
