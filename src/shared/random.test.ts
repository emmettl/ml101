import { describe, expect, it } from "vitest";

import { average, nextSeed, normalRandom, seededRandom } from "./random";

describe("seeded randomness", () => {
  it("repeats exactly for the same seed and differs across seeds", () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    const other = seededRandom(43);
    const a = Array.from({ length: 5 }, first);
    expect(Array.from({ length: 5 }, second)).toEqual(a);
    expect(Array.from({ length: 5 }, other)).not.toEqual(a);
    a.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });

  it("draws normals with roughly zero mean and unit variance", () => {
    const random = seededRandom(7);
    const draws = Array.from({ length: 20_000 }, () => normalRandom(random));
    const mean = average(draws);
    const variance = average(draws.map((value) => (value - mean) ** 2));
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
  });

  it("walks a fixed, non-zero seed sequence", () => {
    expect(nextSeed(1)).toBe(nextSeed(1));
    expect(nextSeed(1)).not.toBe(1);
    expect(nextSeed(0)).toBeGreaterThan(0);
  });
});
