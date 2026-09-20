import { describe, expect, it } from "vitest";

import {
  bestDegree,
  choleskySolve,
  evaluate,
  features,
  fitPolynomial,
  heldOutSamples,
  makeSamples,
  maxDegreeFor,
  meanSquaredError,
  sweepDegrees,
  verdict,
} from "./engine";

const SEED = 20260920;
const NOISE = 0.25;
const train = makeSamples(SEED, 14, NOISE);
const heldOut = heldOutSamples(SEED, NOISE);

describe("polynomial fitting", () => {
  it("solves a small positive-definite system and rejects an indefinite one", () => {
    const solution = choleskySolve(
      [
        [4, 2],
        [2, 3],
      ],
      [10, 8],
    );
    expect(solution?.[0]).toBeCloseTo(1.75, 10);
    expect(solution?.[1]).toBeCloseTo(1.5, 10);
    expect(
      choleskySolve(
        [
          [1, 2],
          [2, 1],
        ],
        [1, 1],
      ),
    ).toBeUndefined();
  });

  it("builds Chebyshev features that stay within [-1, 1] across the range", () => {
    for (const x of [0, 1.3, 2.7, 4]) {
      features(x, 12).forEach((value) => expect(Math.abs(value)).toBeLessThanOrEqual(1 + 1e-9));
    }
  });

  it("recovers an exact cubic", () => {
    const cubic = (x: number) => 0.5 * x ** 3 - 2 * x ** 2 + x + 1;
    const samples = Array.from({ length: 20 }, (_, index) => {
      const x = (index / 19) * 4;
      return { x, y: cubic(x) };
    });
    const fit = fitPolynomial(samples, 3, 0);
    expect(meanSquaredError(fit, samples)).toBeLessThan(1e-10);
    expect(evaluate(fit, 2.2)).toBeCloseTo(cubic(2.2), 5);
  });

  it("stays finite at the highest degree the data allows", () => {
    const fit = fitPolynomial(train, maxDegreeFor(train.length), 0);
    expect(fit.weights.every(Number.isFinite)).toBe(true);
    expect(fit.weights.some((weight) => weight !== 0)).toBe(true);
  });
});

describe("overfitting", () => {
  const rows = sweepDegrees(train, heldOut, 0);

  it("drives training error down as the degree rises", () => {
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].trainError).toBeLessThanOrEqual(rows[index - 1].trainError + 1e-9);
    }
  });

  it("makes held-out error U-shaped: best in the middle, far worse at the top", () => {
    const best = bestDegree(rows);
    expect(best).toBeGreaterThanOrEqual(3);
    expect(best).toBeLessThanOrEqual(8);
    const top = rows.at(-1);
    const floor = rows.find((row) => row.degree === best);
    expect(top?.heldOutError).toBeGreaterThan((floor?.heldOutError ?? 0) * 5);
    expect(rows[0].heldOutError).toBeGreaterThan((floor?.heldOutError ?? 0) * 2);
    expect(verdict(rows, 1)).toBe("too simple");
    expect(verdict(rows, best)).toBe("about right");
    expect(verdict(rows, top?.degree ?? 12)).toBe("memorising");
  });

  it("is cured by more data", () => {
    const many = makeSamples(SEED, 60, NOISE);
    const few = rows.at(-1)?.heldOutError ?? 0;
    const fit = fitPolynomial(many, 12, 0);
    expect(meanSquaredError(fit, heldOut)).toBeLessThan(few / 5);
  });

  it("is tamed by a moderate penalty, and flattened by an extreme one", () => {
    const at = (penalty: number) => meanSquaredError(fitPolynomial(train, 12, penalty), heldOut);
    expect(at(1e-3)).toBeLessThan(at(0) / 3);
    expect(at(10)).toBeGreaterThan(at(1e-3));
  });

  it("repeats exactly for the same seed", () => {
    expect(makeSamples(3, 10, 0.2)).toEqual(makeSamples(3, 10, 0.2));
  });
});
