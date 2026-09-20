import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { seededRandom } from "../shared/random";
import { buildCounts, contextSeen, countOdds, countSurprise, tableEntries } from "./counts";
import {
  alphabetOf,
  createNeuralModel,
  encode,
  knobCount,
  nearestCharacters,
  neuralOdds,
  neuralSurprise,
  trainNeural,
} from "./neural";
import { normalise } from "./ngram";

const text = normalise(readFileSync(new URL("../data/alice.txt", import.meta.url), "utf8"));
const alphabet = alphabetOf(text);
const ids = encode(text, alphabet);
const split = Math.floor(ids.length * 0.9);
const size = alphabet.symbols.length;

describe("the smoothed count table", () => {
  it("always gives odds that add up to one, even for text it never saw", () => {
    const table = buildCounts(ids, split, 5, size);
    for (const prompt of ["said the ", "the jabberw", "zzzzzz"]) {
      const odds = countOdds(table, Array.from(encode(prompt, alphabet)));
      expect(odds.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9);
      expect(Math.min(...odds)).toBeGreaterThan(0);
    }
    const unseen = Array.from(encode("the jabberw", alphabet));
    expect(contextSeen(table, unseen, unseen.length)).toBe(false);
  });

  it("memorises as its context grows: studied text gets easier, unseen text does not", () => {
    const at = (order: number) => {
      const table = buildCounts(ids, split, order, size);
      return {
        studied: countSurprise(table, ids, 1000, 5000).surprise,
        unseen: countSurprise(table, ids, split, ids.length).surprise,
        entries: tableEntries(table),
      };
    };
    const four = at(4);
    const eight = at(8);
    expect(eight.studied).toBeLessThan(four.studied / 2);
    expect(eight.unseen).toBeGreaterThan(four.unseen);
    expect(eight.unseen - eight.studied).toBeGreaterThan(1);
    expect(eight.entries).toBeGreaterThan(four.entries);
    expect(eight.entries).toBeLessThan(four.entries * 10);
  });
});

describe("the neural language model", () => {
  it("computes exact slopes: one tiny step changes each knob by rate × the numerical slope", () => {
    const fresh = () => createNeuralModel(size, 3, 4, 6, 3);
    const position = 5000;
    const lossOf = (model: ReturnType<typeof fresh>) =>
      neuralSurprise(model, ids, position, position + 1).surprise;
    const rate = 1e-3;
    const stepped = fresh();
    // A "random" source that always lands on `position`.
    trainNeural(stepped, ids, split, 1, rate, () => (position - 3) / (split - 3));
    const probes: ["embeddings" | "inputWeights" | "outputWeights" | "outputBias", number][] = [
      ["outputWeights", 7],
      ["outputBias", ids[position]],
      ["inputWeights", 11],
      ["embeddings", ids[position - 1] * 4 + 2],
    ];
    for (const [name, index] of probes) {
      const h = 1e-3;
      const up = fresh();
      up[name][index] += h;
      const down = fresh();
      down[name][index] -= h;
      const numeric = (lossOf(up) - lossOf(down)) / (2 * h);
      const applied = (fresh()[name][index] - stepped[name][index]) / rate;
      expect(applied, `${name}[${index}]`).toBeCloseTo(numeric, 2);
    }
  });

  it("learns the text without being able to memorise it", () => {
    const model = createNeuralModel(size, 6, 8, 64, 5);
    const random = seededRandom(9);
    const before = neuralSurprise(model, ids, split, split + 2000).surprise;
    const total = 300_000;
    for (let seen = 0; seen < total; seen += 50_000)
      trainNeural(model, ids, split, 50_000, 0.012 * (1 - (0.9 * seen) / total), random);
    const studied = neuralSurprise(model, ids, 1000, 5000).surprise;
    const unseen = neuralSurprise(model, ids, split, ids.length).surprise;
    expect(before).toBeGreaterThan(3);
    expect(unseen).toBeLessThan(2.1);
    expect(unseen - studied).toBeLessThan(0.35);

    const table = buildCounts(ids, split, 6, size);
    expect(knobCount(model)).toBeLessThan(tableEntries(table) / 5);
    const tableGap =
      countSurprise(table, ids, split, ids.length).surprise -
      countSurprise(table, ids, 1000, 5000).surprise;
    expect(unseen - studied).toBeLessThan(tableGap / 2);

    const odds = neuralOdds(model, Array.from(encode("the white rabb", alphabet)));
    expect(odds.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
    const nearStop = nearestCharacters(model, alphabet, ".")
      .slice(0, 3)
      .map((entry) => entry.symbol);
    expect(nearStop.filter((symbol) => "!?,".includes(symbol)).length).toBeGreaterThanOrEqual(2);
  });

  it("repeats exactly for the same seeds", () => {
    const run = () => {
      const model = createNeuralModel(size, 4, 8, 16, 2);
      trainNeural(model, ids, split, 5000, 0.01, seededRandom(1));
      return Array.from(model.outputBias);
    };
    expect(run()).toEqual(run());
  });
});
