import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENCODER_SIZE, decodeRows, passageFile, retrieveByEncoder } from "./encoder";
import { buildIndex, chunkWords, found, retrieve, sitExam, wordsOf } from "./engine";
import { QUESTIONS } from "./questions";

const text = readFileSync("src/data/alice.txt", "utf8").trim();
const words = wordsOf(text);
const load = (name: string): Float32Array[] => {
  const bytes = readFileSync(`src/data/passages/${name}`);
  return decodeRows(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));
};
const asked = load("questions.bin");
const own = (at: number) => QUESTIONS[at].wording === "own";
const book = (at: number) => QUESTIONS[at].wording === "book";
const SIZES = [15, 25, 40, 60, 100, 150, 250, 400];

function exams(size: number, overlap: number) {
  const index = buildIndex(words, chunkWords(words, size, overlap));
  const passages = load(passageFile(size, overlap));
  const vectorOf = new Map(QUESTIONS.map((question, at) => [question.ask, asked[at]]));
  return {
    plain: sitExam(index, text, QUESTIONS, 10),
    encoder: sitExam(index, text, QUESTIONS, 10, (ask, keep) => {
      const vector = vectorOf.get(ask);
      return vector ? retrieveByEncoder(passages, vector, keep) : retrieve(index, ask, keep);
    }),
  };
}

describe("the precomputed encoder vectors", () => {
  it("have one row per question and one per passage, at every setting the lab offers", () => {
    expect(asked).toHaveLength(QUESTIONS.length);
    expect(asked[0]).toHaveLength(ENCODER_SIZE);
    for (const size of SIZES)
      for (const overlap of [0, 0.25, 0.5])
        expect(load(passageFile(size, overlap)), `${size}/${overlap}`).toHaveLength(
          chunkWords(words, size, overlap).length,
        );
  });

  it("are scaled to length one, so a dot product is a cosine", () => {
    for (const row of asked.slice(0, 5)) {
      let squares = 0;
      for (const value of row) squares += value * value;
      expect(squares).toBeCloseTo(1, 5);
    }
  });
});

describe("what the lab claims about the encoder", () => {
  it("finds the bunny's watch, which no word-based search here could", () => {
    const { plain, encoder } = exams(60, 0);
    const at = QUESTIONS.findIndex((question) => question.id === "watch-own");
    expect(plain.ranks[at]).toBe(0);
    expect(encoder.ranks[at]).toBeGreaterThan(0);
    expect(encoder.ranks[at]).toBeLessThanOrEqual(5);
  });

  it("clearly beats word matching on questions asked in a reader's own words", () => {
    for (const [size, overlap] of [
      [60, 0],
      [100, 0],
      [150, 0.25],
    ] as const) {
      const { plain, encoder } = exams(size, overlap);
      expect(found(encoder, 3, own), `${size}/${overlap}`).toBeGreaterThan(
        found(plain, 3, own) + 1,
      );
    }
  });

  it("does not beat it on questions that quote the book, and fades on very long passages", () => {
    const { plain, encoder } = exams(60, 0);
    expect(found(encoder, 3, book)).toBeLessThanOrEqual(found(plain, 3, book));
    const long = exams(400, 0);
    expect(found(long.encoder, 3)).toBeLessThan(found(long.plain, 3) - 2);
  });
});
