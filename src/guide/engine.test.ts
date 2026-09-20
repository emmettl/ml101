import { describe, expect, it } from "vitest";

import { ITEMS, TEST_USES, averageInflation, decode, selectionBias } from "./engine";

describe("decoding the names", () => {
  it("calls a number a parameter exactly when descent sets it", () => {
    for (const item of ITEMS)
      expect(decode(item).kind).toBe(item.setBy === "descent" ? "parameter" : "hyperparameter");
    expect(ITEMS.filter((item) => item.setBy === "descent").length).toBeGreaterThanOrEqual(2);
  });

  it("never lets the test pile choose anything", () => {
    for (const item of ITEMS) {
      expect(item.judgedOn).not.toBe("test");
      if (item.setBy === "person") expect(item.judgedOn).toBe("validation");
    }
  });
});

describe("peeking at the test set", () => {
  it("is unbiased when looked at once", () => {
    expect(Math.abs(averageInflation(1, 200))).toBeLessThan(0.01);
  });

  it("inflates the score the more candidates are compared on it", () => {
    const twenty = averageInflation(TEST_USES.pick.candidates, 200);
    const twoHundred = averageInflation(TEST_USES.tune.candidates, 200);
    expect(twenty).toBeGreaterThan(0.035);
    expect(twoHundred).toBeGreaterThan(twenty);
  });

  it("shrinks with a larger test set, and repeats for the same seed", () => {
    expect(averageInflation(20, 2000)).toBeLessThan(averageInflation(20, 200) / 2);
    expect(selectionBias(20, 200, 7)).toEqual(selectionBias(20, 200, 7));
    const result = selectionBias(20, 200, 7);
    expect(result.reported).toBeGreaterThan(result.truth);
  });
});
