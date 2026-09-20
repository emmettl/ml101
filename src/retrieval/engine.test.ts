import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  chunkWords,
  cutByBoundary,
  found,
  locate,
  retrieve,
  sitExam,
  stemOf,
  unknownWords,
  wordsOf,
} from "./engine";
import { QUESTIONS } from "./questions";

const text = readFileSync("src/data/alice.txt", "utf8").trim();
const words = wordsOf(text);
const indexAt = (size: number, overlap: number) =>
  buildIndex(words, chunkWords(words, size, overlap));
const own = (at: number) => QUESTIONS[at].wording === "own";
const book = (at: number) => QUESTIONS[at].wording === "book";

describe("the answer key", () => {
  it("quotes evidence that is really in the book, for a balanced set of questions", () => {
    for (const question of QUESTIONS) expect(locate(text, question), question.id).toBeDefined();
    expect(QUESTIONS.filter((question) => question.wording === "book")).toHaveLength(12);
    expect(new Set(QUESTIONS.map((question) => question.id)).size).toBe(QUESTIONS.length);
  });
});

describe("cutting and indexing", () => {
  it("stems lightly and drops words too common to match on", () => {
    expect(stemOf("grinned")).toBe(stemOf("grin"));
    expect(stemOf("sisters")).toBe(stemOf("sister"));
    expect(stemOf("Rabbit's")).toBe(stemOf("rabbit"));
    expect(stemOf("the")).toBe("");
  });

  it("covers every word, and overlapping passages start before the last one ends", () => {
    const plain = chunkWords(words, 60, 0);
    expect(plain[0].from).toBe(0);
    expect(plain.at(-1)?.to).toBe(words.length);
    plain.slice(1).forEach((chunk, at) => expect(chunk.from).toBe(plain[at].to));
    const lapped = chunkWords(words, 60, 0.5);
    expect(lapped[1].from).toBe(30);
    expect(lapped.length).toBeGreaterThan(plain.length * 1.9);
  });

  it("gives every passage a vector of length one", () => {
    for (const vector of indexAt(60, 0).vectors.slice(0, 40)) {
      let squares = 0;
      for (const weight of vector.values()) squares += weight * weight;
      expect(squares).toBeCloseTo(1, 9);
    }
  });
});

describe("searching", () => {
  it("ranks the passage that shares rare words first, and says why", () => {
    const index = indexAt(60, 0);
    const bottle = QUESTIONS.find((question) => question.id === "bottle");
    if (!bottle) throw new Error("missing question");
    const [best, second] = retrieve(index, bottle.ask, 2);
    expect(best.score).toBeGreaterThan(second.score);
    expect(best.score).toBeLessThanOrEqual(1);
    expect(best.shared.map((entry) => entry.stem)).toContain("label");
    const span = locate(text, bottle);
    expect(span && index.chunks[best.chunk].start <= span.start).toBe(true);
  });

  it("cannot see words the book never uses", () => {
    const index = indexAt(60, 0);
    expect(unknownWords(index, "What timepiece was the hurrying bunny carrying?")).toEqual([
      "timepiece",
      "bunny",
    ]);
    expect(retrieve(index, "xylophone zeppelin", 5)).toEqual([]);
  });

  it("is deterministic", () => {
    const a = sitExam(indexAt(100, 0.25), text, QUESTIONS, 10);
    const b = sitExam(indexAt(100, 0.25), text, QUESTIONS, 10);
    expect(a).toEqual(b);
  });
});

describe("what the lab and lesson claim", () => {
  it("finds the book's wording easily and a reader's wording with difficulty", () => {
    const exam = sitExam(indexAt(60, 0), text, QUESTIONS, 10);
    expect(found(exam, 3, book)).toBeGreaterThanOrEqual(8);
    expect(found(exam, 3, own)).toBeLessThanOrEqual(5);
  });

  it("loses answers to boundaries when passages are tiny, and overlap repairs that", () => {
    const tiny = sitExam(indexAt(15, 0), text, QUESTIONS, 10);
    const lapped = sitExam(indexAt(15, 0.5), text, QUESTIONS, 10);
    expect(tiny.cut.filter(Boolean).length).toBeGreaterThanOrEqual(8);
    expect(lapped.cut.filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(found(tiny, 3)).toBeLessThan(found(sitExam(indexAt(60, 0), text, QUESTIONS, 10), 3) - 3);
    const span = locate(text, QUESTIONS[0]);
    expect(span && cutByBoundary(indexAt(400, 0.5), span)).toBe(false);
  });

  it("finds more loosely worded questions with longer passages and with overlap", () => {
    const base = sitExam(indexAt(60, 0), text, QUESTIONS, 10);
    const long = sitExam(indexAt(250, 0), text, QUESTIONS, 10);
    const lapped = sitExam(indexAt(60, 0.5), text, QUESTIONS, 10);
    expect(found(long, 3, own)).toBeGreaterThan(found(base, 3, own) + 1);
    expect(found(lapped, 3)).toBeGreaterThan(found(base, 3) + 1);
  });

  it("ranks the lesson's four questions as the lesson says", () => {
    const index = indexAt(60, 0.25);
    const exam = sitExam(index, text, QUESTIONS, 8);
    const rank = (id: string) => exam.ranks[QUESTIONS.findIndex((question) => question.id === id)];
    expect(rank("bottle")).toBe(1);
    expect(rank("key")).toBe(2);
    expect(rank("butter-own")).toBe(6);
    expect(rank("watch-own")).toBe(0);
    expect(index.chunks).toHaveLength(350);
  });
});
