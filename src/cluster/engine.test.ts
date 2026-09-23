import { describe, expect, it } from "vitest";
import { bestOfRuns, elbow, kMeans, makePoints, purity, startingCentres } from "./engine";
import { seededRandom } from "../shared/random";

const SEED = 20260920;
const settled = (rounds: ReturnType<typeof kMeans>) => rounds[rounds.length - 1];

describe("k-means", () => {
  it("is reproducible, and every round lowers the loss until nothing moves", () => {
    const points = makePoints("three", SEED);
    expect(kMeans(points, 3, "spread", 1)).toEqual(kMeans(points, 3, "spread", 1));
    for (const start of ["random", "spread"] as const)
      for (let seed = 1; seed <= 8; seed += 1) {
        const rounds = kMeans(points, 3, start, seed);
        rounds
          .slice(1)
          .forEach((round, at) => expect(round.loss).toBeLessThanOrEqual(rounds[at].loss + 1e-9));
        expect(rounds.length).toBeLessThan(30);
      }
  });

  it("starts from k distinct points of the data", () => {
    const points = makePoints("three", SEED);
    for (const start of ["random", "spread"] as const) {
      const centres = startingCentres(points, 4, start, seededRandom(3));
      expect(centres).toHaveLength(4);
      for (const centre of centres)
        expect(points.some((p) => p.x === centre.x && p.y === centre.y)).toBe(true);
    }
  });
});

describe("what the lesson and lab claim", () => {
  it("finds three round groups with k = 3, and a bad random start settles higher", () => {
    const points = makePoints("three", SEED);
    const good = settled(kMeans(points, 3, "spread", 1));
    expect(purity(points, good.assignment, 3)).toBeGreaterThan(0.95);
    expect(good.loss).toBeLessThan(25);
    const bad = settled(kMeans(points, 3, "random", 6));
    expect(purity(points, bad.assignment, 3)).toBeLessThan(0.75);
    expect(bad.loss).toBeGreaterThan(good.loss * 2);
    for (let seed = 1; seed <= 8; seed += 1)
      expect(
        purity(points, settled(kMeans(points, 3, "spread", seed)).assignment, 3),
        `spread ${seed}`,
      ).toBeGreaterThan(0.95);
  });

  it("the loss falls at every k, and the elbow on three groups is at three", () => {
    const curve = elbow(makePoints("three", SEED), "spread", 1);
    curve.slice(1).forEach((loss, at) => expect(loss).toBeLessThan(curve[at]));
    const drops = curve.slice(1).map((loss, at) => curve[at] - loss);
    expect(drops[1]).toBeGreaterThan(drops[2] * 5);
  });

  it("cannot separate rings or stripes with two centres, whatever the start", () => {
    for (const shape of ["rings", "stripes"] as const) {
      const points = makePoints(shape, SEED);
      for (const start of ["random", "spread"] as const)
        for (let seed = 1; seed <= 4; seed += 1)
          expect(
            purity(points, settled(kMeans(points, 2, start, seed)).assignment, 2),
            `${shape} ${start} ${seed}`,
          ).toBeLessThan(0.72);
    }
  });

  it("with two centres on uneven groups the fence cuts into the big group", () => {
    const points = makePoints("uneven", SEED);
    const agreement = purity(points, settled(bestOfRuns(points, 2, "spread", 1, 5)).assignment, 2);
    expect(agreement).toBeGreaterThan(0.8);
    expect(agreement).toBeLessThan(0.95);
  });
});
