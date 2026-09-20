import { describe, expect, it } from "vitest";

import { createEmbeddings, makeCorpus } from "../language/embeddings";
import { createNetwork, parameterCount } from "../network/engine";
import {
  LADDER,
  acceleratorDays,
  bytesInWords,
  durationInWords,
  inWords,
  readingYears,
  sensibleTokens,
  trainingOperations,
  weightBytes,
} from "./engine";

describe("the ladder", () => {
  it("climbs steadily within the course models and within the real ones", () => {
    const course = LADDER.filter((rung) => rung.course).map((rung) => rung.parameters);
    expect(course).toEqual([...course].sort((a, b) => a - b));
    expect(LADDER.at(-1)?.parameters).toBe(Math.max(...LADDER.map((rung) => rung.parameters)));
  });

  it("states the course's own model sizes correctly", () => {
    const size = (name: string) => LADDER.find((rung) => rung.name === name)?.parameters;
    expect(size("Playground network")).toBe(parameterCount(createNetwork([8, 8], "tanh", 1)));
    expect(size("One neuron")).toBe(parameterCount(createNetwork([], "tanh", 1)));
    const vectors = createEmbeddings(makeCorpus(20260920), 8, 1);
    expect(size("Word vectors")).toBe(vectors.vectors.length + vectors.neighbours.length);
  });
});

describe("scale arithmetic", () => {
  it("reproduces GPT-3's published training compute", () => {
    // Brown et al. (2020) report 3.14e23 floating-point operations.
    expect(trainingOperations(175e9, 300e9)).toBeCloseTo(3.15e23, -21);
  });

  it("reproduces Chinchilla's twenty tokens per parameter", () => {
    expect(sensibleTokens(70e9)).toBe(1.4e12);
  });

  it("grows compute with the square of size when data keeps pace", () => {
    const small = trainingOperations(1e9, sensibleTokens(1e9));
    const large = trainingOperations(1e10, sensibleTokens(1e10));
    expect(large / small).toBeCloseTo(100, 6);
  });

  it("sizes memory, time and reading plainly", () => {
    expect(bytesInWords(weightBytes(405e9, 2))).toBe("810 GB");
    expect(bytesInWords(weightBytes(105, 4))).toBe("420 bytes");
    expect(readingYears(15e12)).toBeGreaterThan(200_000);
    expect(acceleratorDays(trainingOperations(405e9, 15e12))).toBeGreaterThan(1e6);
    expect(inWords(405e9)).toBe("405 billion");
    expect(inWords(1.5e9)).toBe("1.5 billion");
    expect(inWords(33)).toBe("33");
    expect(durationInWords(0.5)).toBe("12 hours");
    expect(durationInWords(1e6)).toContain("thousand years");
  });
});
