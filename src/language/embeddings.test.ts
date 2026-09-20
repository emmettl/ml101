import { describe, expect, it } from "vitest";

import {
  ANALOGIES,
  analogiesSolved,
  clusterPurity,
  createEmbeddings,
  makeCorpus,
  meaningAxes,
  project,
  solveAnalogy,
  trainEmbeddings,
  vectorOf,
} from "./embeddings";

const corpus = makeCorpus(20260920);

function trained(dimensions: number, seed: number) {
  const model = createEmbeddings(corpus, dimensions, seed);
  trainEmbeddings(model, 20_000, seed + 100);
  return model;
}

describe("word embeddings", () => {
  it("starts as noise: untrained vectors solve few analogies", () => {
    expect(analogiesSolved(createEmbeddings(corpus, 8, 1))).toBeLessThan(4);
  });

  it("solves every analogy in eight dimensions, whatever the random start", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const model = trained(8, seed);
      expect(analogiesSolved(model), `seed ${seed}`).toBeGreaterThanOrEqual(ANALOGIES.length - 1);
      expect(solveAnalogy(model, ANALOGIES[0]).ranked[0].word).toBe("queen");
      expect(clusterPurity(model)).toBe(1);
    }
  });

  it("runs out of room in two dimensions", () => {
    let two = 0;
    let eight = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      two += analogiesSolved(trained(2, seed));
      eight += analogiesSolved(trained(8, seed));
    }
    expect(two).toBeLessThan(eight * 0.75);
  });

  it("finds gender and rank as directions nobody labelled", () => {
    const model = trained(8, 3);
    const axes = meaningAxes(model);
    const at = (word: string) => ({
      gender: project(vectorOf(model, word), axes.gender),
      rank: project(vectorOf(model, word), axes.rank),
    });
    expect(at("queen").gender).toBeGreaterThan(at("king").gender);
    expect(at("girl").gender).toBeGreaterThan(at("boy").gender);
    expect(at("king").rank).toBeGreaterThan(at("man").rank);
    expect(at("princess").rank).toBeGreaterThan(at("girl").rank);
    expect(Math.abs(project(axes.gender, axes.rank))).toBeLessThan(1e-9);
  });

  it("repeats exactly for the same seeds", () => {
    expect(Array.from(trained(4, 2).vectors)).toEqual(Array.from(trained(4, 2).vectors));
  });
});
