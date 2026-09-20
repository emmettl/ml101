import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { WORD_START, learnMerges, tokenise, vocabularySize } from "./bpe";
import { normalise } from "./ngram";

const text = normalise(readFileSync(new URL("../data/alice.txt", import.meta.url), "utf8"));
const merges = learnMerges(text, 400);

describe("byte-pair encoding", () => {
  it("learns the requested merges, most frequent first", () => {
    expect(merges).toHaveLength(400);
    expect(merges[0].count).toBeGreaterThanOrEqual(merges[50].count);
    expect(merges[50].count).toBeGreaterThanOrEqual(merges[399].count);
    expect(learnMerges(text, 40)).toEqual(merges.slice(0, 40));
  });

  it("starts from single characters and never loses any text", () => {
    const sentence = "alice was beginning to get very tired";
    const characters = tokenise(sentence, merges, 0);
    expect(characters.every((token) => token.length === 1)).toBe(true);
    for (const use of [0, 10, 100, 400]) {
      const rebuilt = tokenise(sentence, merges, use).join("").split(WORD_START).join(" ").trim();
      expect(rebuilt).toBe(sentence);
    }
  });

  it("uses fewer tokens as merges are added, and makes common words whole", () => {
    const sentence = "the rabbit said nothing and alice thought it very curious";
    const counts = [0, 50, 200, 400].map((use) => tokenise(sentence, merges, use).length);
    expect(counts[1]).toBeLessThan(counts[0]);
    expect(counts[2]).toBeLessThan(counts[1]);
    expect(counts[3]).toBeLessThanOrEqual(counts[2]);
    expect(tokenise("the alice", merges)).toEqual([`${WORD_START}the`, `${WORD_START}alice`]);
  });

  it("leaves a word it never saw in fragments", () => {
    const pieces = tokenise("jabberwocky", merges);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.join("")).toBe(`${WORD_START}jabberwocky`);
  });

  it("grows the vocabulary by one token per merge", () => {
    expect(vocabularySize(text, 400) - vocabularySize(text, 0)).toBe(400);
  });
});
