import { describe, expect, it } from "vitest";

import {
  QUERY_FOR,
  attend,
  blend,
  effectiveCount,
  focusIndex,
  sentence,
  softmax,
  strongest,
} from "./attention";

describe("softmax", () => {
  it("adds up to one and keeps the order of the scores", () => {
    const shares = softmax([2, 1, 0.1]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 12);
    expect(shares[0]).toBeGreaterThan(shares[1]);
    expect(shares[1]).toBeGreaterThan(shares[2]);
  });

  it("survives enormous scores and gives hidden words nothing", () => {
    const shares = softmax([1000, -1000, -Infinity, 999]);
    expect(shares.every(Number.isFinite)).toBe(true);
    expect(shares[2]).toBe(0);
    expect(shares[0]).toBeGreaterThan(0.7);
    expect(softmax([-Infinity, -Infinity])).toEqual([0, 0]);
  });
});

describe("attention", () => {
  it("resolves “it” to the animal when the sentence ends in tired", () => {
    const words = sentence("tired");
    const { weights } = attend(QUERY_FOR.tired, words, focusIndex(words));
    expect(words[strongest(weights)].text).toBe("animal");
    expect(weights[strongest(weights)]).toBeGreaterThan(0.5);
    expect(weights[focusIndex(words)]).toBe(0);
    expect(blend(words, weights).living).toBeGreaterThan(blend(words, weights).place);
  });

  it("resolves “it” to the street when the sentence ends in wide", () => {
    const words = sentence("wide");
    const { weights } = attend(QUERY_FOR.wide, words, focusIndex(words));
    expect(words[strongest(weights)].text).toBe("street");
    expect(blend(words, weights).place).toBeGreaterThan(blend(words, weights).living);
  });

  it("concentrates as sharpness rises and spreads evenly as it falls", () => {
    const words = sentence("tired");
    const from = focusIndex(words);
    const at = (sharpness: number) =>
      effectiveCount(attend(QUERY_FOR.tired, words, from, sharpness).weights);
    expect(at(4)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(0.1));
    expect(at(0)).toBeCloseTo(words.length - 1, 6);
    expect(at(12)).toBeLessThan(1.1);
  });

  it("cannot see later words when looking backwards only", () => {
    const words = sentence("tired");
    const from = focusIndex(words);
    const { weights } = attend(QUERY_FOR.tired, words, from, 1, true);
    weights.slice(from).forEach((weight) => expect(weight).toBe(0));
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });
});
