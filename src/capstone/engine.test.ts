import { describe, expect, it } from "vitest";

import { NAIVE, SENSIBLE, modelCard, runCapstone, type Decisions } from "./engine";

const failed = (decisions: Decisions): string[] =>
  runCapstone(decisions)
    .checks.filter((check) => !check.passed)
    .map((check) => check.id);

describe("the capstone", () => {
  it("passes every check for the careful set of decisions", () => {
    const outcome = runCapstone(SENSIBLE);
    expect(outcome.ready).toBe(true);
    expect(outcome.deployment.recall).toBeGreaterThan(0.5);
    expect(outcome.deployment.precision).toBeGreaterThan(outcome.baseRate * 2);
  });

  it("lets the rushed version report a triumph and deliver almost nothing", () => {
    const outcome = runCapstone(NAIVE);
    expect(outcome.reported.accuracy).toBeGreaterThan(0.97);
    expect(outcome.deployment.recall).toBeLessThan(0.1);
    expect(outcome.ready).toBe(false);
    expect(outcome.checks.every((check) => !check.passed)).toBe(true);
  });

  it("attributes each mistake to the checks it should fail", () => {
    expect(failed({ ...SENSIBLE, includeLeak: true })).toEqual(
      expect.arrayContaining(["leak", "deployment"]),
    );
    expect(failed({ ...SENSIBLE, capacity: "bloated" })).toContain("agreement");
    expect(failed({ ...SENSIBLE, split: "two-way" })).toEqual(["untouched"]);
    expect(failed({ ...SENSIBLE, split: "none" })).toEqual(
      expect.arrayContaining(["unseen", "untouched", "agreement"]),
    );
    expect(failed({ ...SENSIBLE, metric: "accuracy" })).toEqual(["headline"]);
    expect(failed({ ...SENSIBLE, threshold: 0.6 })).toContain("baseline");
  });

  it("is imbalanced enough that doing nothing looks accurate", () => {
    const { baseRate } = runCapstone(SENSIBLE);
    expect(baseRate).toBeGreaterThan(0.1);
    expect(baseRate).toBeLessThan(0.22);
  });

  it("repeats exactly, and writes a model card that records the checks", () => {
    expect(runCapstone(SENSIBLE)).toEqual(runCapstone(SENSIBLE));
    const card = modelCard(NAIVE, runCapstone(NAIVE));
    expect(card).toContain("Checks passed: 0 of 7");
    expect(card).toContain("win-back offer sent");
    expect(modelCard(SENSIBLE, runCapstone(SENSIBLE))).toContain("Checks passed: 7 of 7");
  });
});
