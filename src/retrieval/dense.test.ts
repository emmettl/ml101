import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDenseIndex,
  buildLexicon,
  cosine,
  decodeVectors,
  neighboursOf,
  retrieveByMeaning,
  retrieveWithNeighbours,
  unknownToVectors,
  vectorOf,
} from "./dense";
import { buildIndex, chunkWords, found, sitExam, wordsOf } from "./engine";
import { QUESTIONS } from "./questions";

const text = readFileSync("src/data/alice.txt", "utf8").trim();
const words = wordsOf(text);
const list = readFileSync("src/data/glove-words.txt", "utf8").trim().split("\n");
const bytes = readFileSync("src/data/glove.bin");
const vectors = decodeVectors(
  list,
  new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length),
  50,
);
const lexicon = buildLexicon(text, words, vectors);
const own = (at: number) => QUESTIONS[at].wording === "own";
const book = (at: number) => QUESTIONS[at].wording === "book";

describe("the shipped word vectors", () => {
  it("hold one row of 50 bytes per listed word, scaled to length one", () => {
    expect(bytes.length).toBe(list.length * 50);
    expect(new Set(list).size).toBe(list.length);
    const rabbit = vectorOf(vectors, "rabbit");
    expect(rabbit && cosine(rabbit, rabbit)).toBeCloseTo(1, 6);
    expect(vectorOf(vectors, "zzzz")).toBeUndefined();
  });

  it("put words of like meaning side by side, which is all they were trained to do", () => {
    expect(neighboursOf(lexicon, "bunny")[0].spelling).toBe("rabbit");
    expect(neighboursOf(lexicon, "infant").map((near) => near.spelling)).toContain("baby");
    expect(neighboursOf(lexicon, "tall").map((near) => near.spelling)).toContain("height");
    expect(neighboursOf(lexicon, "timepiece")).toEqual([]);
    expect(unknownToVectors(vectors, "a frabjous bunny")).toEqual(["frabjous"]);
  });
});

describe("what the lab claims about them", () => {
  const chunks = chunkWords(words, 60, 0);
  const index = buildIndex(words, chunks);
  const plain = sitExam(index, text, QUESTIONS, 10);
  const helped = sitExam(index, text, QUESTIONS, 10, (ask, keep) =>
    retrieveWithNeighbours(index, lexicon, ask, keep),
  );
  const dense = buildDenseIndex(text, words, chunks, vectors);
  const averaged = sitExam(index, text, QUESTIONS, 10, (ask, keep) =>
    retrieveByMeaning(dense, ask, keep),
  );

  it("near-meanings leave questions in the book's words alone, and rescue “How tall…?”", () => {
    QUESTIONS.forEach((question, at) => {
      if (question.wording === "book") expect(helped.ranks[at], question.id).toBe(plain.ranks[at]);
    });
    const tall = QUESTIONS.findIndex((question) => question.id === "height-own");
    expect(plain.ranks[tall]).toBe(0);
    expect(helped.ranks[tall]).toBe(1);
    const [best] = retrieveWithNeighbours(index, lexicon, QUESTIONS[tall].ask, 1);
    expect(best.shared.some((entry) => entry.via === "tall")).toBe(true);
  });

  it("but over the whole exam they are worth about one question, in either direction", () => {
    expect(Math.abs(found(helped, 3) - found(plain, 3))).toBeLessThanOrEqual(2);
    expect(Math.abs(found(helped, 10, own) - found(plain, 10, own))).toBeLessThanOrEqual(2);
  });

  it("averaging the vectors of a passage does clearly worse than matching words", () => {
    expect(found(averaged, 3)).toBeLessThan(found(plain, 3) - 2);
    expect(found(averaged, 3, book)).toBeLessThan(found(plain, 3, book));
    for (const passage of dense.passages.slice(0, 20))
      expect(cosine(passage, passage)).toBeCloseTo(1, 5);
  });
});
