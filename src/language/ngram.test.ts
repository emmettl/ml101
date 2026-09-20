import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { seededRandom } from "../shared/random";
import {
  copiedShare,
  copiedSpans,
  generate,
  normalise,
  predictNext,
  realWordShare,
  reshape,
  vocabularyOf,
} from "./ngram";

const text = normalise(readFileSync(new URL("../data/alice.txt", import.meta.url), "utf8"));
const vocabulary = vocabularyOf(text);

describe("the corpus", () => {
  it("is a lower-case public-domain text with no distribution boilerplate", () => {
    expect(text.length).toBeGreaterThan(70_000);
    expect(text.length).toBeLessThan(100_000);
    expect(text).toMatch(/^alice was beginning to get very tired/);
    expect(text).not.toMatch(/gutenberg|license|copyright/);
    expect(text).toMatch(/^[a-z .,'?!-]+$/);
  });
});

describe("next-character prediction", () => {
  it("returns a probability distribution, likeliest first", () => {
    const prediction = predictNext(text, "white rabb", 5);
    const total = prediction.choices.reduce((sum, choice) => sum + choice.probability, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(prediction.choices[0].token).toBe("i");
    expect(prediction.context).toBe(" rabb");
    expect(prediction.backedOff).toBe(0);
  });

  it("knows only letter frequencies with no context", () => {
    const prediction = predictNext(text, "anything", 0);
    expect(prediction.context).toBe("");
    expect(prediction.choices[0].token).toBe(" ");
    expect(prediction.occurrences).toBe(text.length);
  });

  it("backs off to a shorter context when the run was never seen", () => {
    const prediction = predictNext(text, "zzzqthe", 7);
    expect(prediction.backedOff).toBeGreaterThan(0);
    expect(prediction.choices.length).toBeGreaterThan(0);
    expect("zzzqthe".endsWith(prediction.context)).toBe(true);
  });

  it("sharpens with low temperature, flattens with high, and honours top-k", () => {
    const { choices } = predictNext(text, "th", 2);
    const cold = reshape(choices, 0.2, 40);
    const hot = reshape(choices, 2, 40);
    expect(cold[0].probability).toBeGreaterThan(choices[0].probability);
    expect(hot[0].probability).toBeLessThan(choices[0].probability);
    const narrowed = reshape(choices, 1, 3);
    expect(narrowed).toHaveLength(3);
    expect(narrowed.reduce((sum, choice) => sum + choice.probability, 0)).toBeCloseTo(1, 10);
  });
});

describe("generation", () => {
  const write = (context: number, temperature = 1, seed = 4) =>
    generate(text, "alice ", 400, context, temperature, 40, seededRandom(seed)).text.slice(6);

  it("repeats exactly for the same seed", () => {
    expect(write(3)).toBe(write(3));
    expect(write(3, 1, 4)).not.toBe(write(3, 1, 5));
  });

  it("spells better as the context grows", () => {
    const shares = [0, 1, 3, 5].map((context) => realWordShare(vocabulary, write(context)));
    expect(shares[0]).toBeLessThan(0.35);
    expect(shares[3]).toBeGreaterThan(0.85);
    expect(shares[1]).toBeLessThan(shares[2]);
    expect(shares[2]).toBeLessThan(shares[3]);
  });

  it("recites the book once the context is long, and composes when it is short", () => {
    expect(copiedShare(text, write(3))).toBeLessThan(0.15);
    expect(copiedShare(text, write(12))).toBeGreaterThan(0.6);
    const spans = copiedSpans(text, write(12));
    spans.forEach((span) => expect(span.end - span.start).toBeGreaterThanOrEqual(24));
  });

  it("loses its spelling when the temperature is high", () => {
    expect(realWordShare(vocabulary, write(4, 2.5))).toBeLessThan(
      realWordShare(vocabulary, write(4, 0.7)),
    );
  });
});
