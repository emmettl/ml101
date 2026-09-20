/**
 * Word embeddings from nothing but who sits next to whom. Each word starts as a random point.
 * Training pulls a word towards the words it appears beside and pushes it away from words
 * picked at random (skip-gram with negative sampling). No one tells the model that a queen is
 * royal or female; those directions appear because they help predict the neighbours.
 *
 * The corpus is a tiny invented language, so the structure it contains is known exactly and the
 * result can be checked. No browser globals.
 */

import { seededRandom, type Random } from "../shared/random";

export type Group = "royal" | "common" | "animal" | "food" | "context";

interface Person {
  word: string;
  group: "royal" | "common";
  gender: "f" | "m";
  age: "old" | "young";
}

export const PEOPLE: readonly Person[] = [
  { word: "king", group: "royal", gender: "m", age: "old" },
  { word: "queen", group: "royal", gender: "f", age: "old" },
  { word: "prince", group: "royal", gender: "m", age: "young" },
  { word: "princess", group: "royal", gender: "f", age: "young" },
  { word: "man", group: "common", gender: "m", age: "old" },
  { word: "woman", group: "common", gender: "f", age: "old" },
  { word: "boy", group: "common", gender: "m", age: "young" },
  { word: "girl", group: "common", gender: "f", age: "young" },
];

const CONTEXTS = {
  royal: ["crown", "throne", "palace", "rules"],
  common: ["village", "works", "field", "market"],
  f: ["she", "her", "hers"],
  m: ["he", "his", "him"],
  old: ["reigns", "elder", "wise"],
  young: ["plays", "small", "learns"],
};
const ANIMALS = ["cat", "dog", "horse", "bird"];
const ANIMAL_CONTEXTS = ["fur", "tail", "paws", "runs"];
const FOODS = ["bread", "cheese", "apple", "soup"];
const FOOD_CONTEXTS = ["eats", "tasty", "plate", "cooks"];

export const DISPLAY_WORDS: readonly { word: string; group: Group }[] = [
  ...PEOPLE.map((person) => ({ word: person.word, group: person.group })),
  ...ANIMALS.map((word) => ({ word, group: "animal" as const })),
  ...FOODS.map((word) => ({ word, group: "food" as const })),
];

const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.floor(random() * items.length)];

/**
 * Short "sentences": a person with words that reflect their rank, gender and age; an animal
 * with animal words; a food with food words. Word order carries no meaning here.
 */
export function makeCorpus(seed: number, sentences = 900): string[][] {
  const random = seededRandom(seed);
  return Array.from({ length: sentences }, (_, index) => {
    if (index % 5 === 3)
      return [pick(ANIMALS, random), pick(ANIMAL_CONTEXTS, random), pick(ANIMAL_CONTEXTS, random)];
    if (index % 5 === 4)
      return [pick(FOODS, random), pick(FOOD_CONTEXTS, random), pick(FOOD_CONTEXTS, random)];
    const person = pick(PEOPLE, random);
    return [
      person.word,
      pick(CONTEXTS[person.group], random),
      pick(CONTEXTS[person.gender], random),
      pick(CONTEXTS[person.age], random),
    ];
  });
}

export interface Embeddings {
  words: string[];
  index: Map<string, number>;
  dimensions: number;
  /** vectors[w * dimensions + d]: the position of word w. */
  vectors: Float64Array;
  /** A second set used for words in their role as neighbours. */
  neighbours: Float64Array;
  pairs: Int32Array;
  steps: number;
}

export function createEmbeddings(
  corpus: readonly string[][],
  dimensions: number,
  seed: number,
): Embeddings {
  const random = seededRandom(seed);
  const words = [...new Set(corpus.flat())].sort();
  const index = new Map(words.map((word, position) => [word, position]));
  const start = () => (random() - 0.5) * 0.5;
  const pairs: number[] = [];
  for (const sentence of corpus)
    for (const centre of sentence)
      for (const other of sentence)
        if (centre !== other) pairs.push(index.get(centre) ?? 0, index.get(other) ?? 0);
  return {
    words,
    index,
    dimensions,
    vectors: Float64Array.from({ length: words.length * dimensions }, start),
    neighbours: Float64Array.from({ length: words.length * dimensions }, start),
    pairs: Int32Array.from(pairs),
    steps: 0,
  };
}

const squash = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

// peek:start embed
/**
 * One step: take a word and a real neighbour, and nudge their vectors so the pair scores
 * higher. Then take a few random words and nudge so those pairs score lower. "Score" is the
 * dot product: large when two vectors point the same way.
 */
export function embeddingStep(model: Embeddings, random: Random, rate: number, negatives = 4) {
  const { dimensions: size, vectors, neighbours, pairs, words } = model;
  const at = 2 * Math.floor(random() * (pairs.length / 2));
  const word = pairs[at] * size;
  const change = new Float64Array(size);
  for (let sampleIndex = 0; sampleIndex <= negatives; sampleIndex += 1) {
    const real = sampleIndex === 0;
    const other = (real ? pairs[at + 1] : Math.floor(random() * words.length)) * size;
    let score = 0;
    for (let d = 0; d < size; d += 1) score += vectors[word + d] * neighbours[other + d];
    const blame = squash(score) - (real ? 1 : 0); // guess minus answer, as ever
    for (let d = 0; d < size; d += 1) {
      change[d] += blame * neighbours[other + d];
      neighbours[other + d] -= rate * blame * vectors[word + d];
    }
  }
  for (let d = 0; d < size; d += 1) vectors[word + d] -= rate * change[d];
  model.steps += 1;
}
// peek:end

export function trainEmbeddings(model: Embeddings, steps: number, seed: number, rate = 0.08) {
  const random = seededRandom(seed);
  for (let step = 0; step < steps; step += 1)
    embeddingStep(model, random, rate * (1 - (0.9 * step) / steps));
}

export function vectorOf(model: Embeddings, word: string): Float64Array {
  const position = (model.index.get(word) ?? 0) * model.dimensions;
  return model.vectors.slice(position, position + model.dimensions);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let d = 0; d < a.length; d += 1) {
    dot += a[d] * b[d];
    aa += a[d] * a[d];
    bb += b[d] * b[d];
  }
  return dot / (Math.sqrt(aa * bb) || 1);
}

/** Words ranked by how closely their direction matches `target`, skipping `exclude`. */
export function nearest(
  model: Embeddings,
  target: ArrayLike<number>,
  candidates: readonly string[],
  exclude: readonly string[] = [],
): { word: string; similarity: number }[] {
  return candidates
    .filter((word) => !exclude.includes(word))
    .map((word) => ({ word, similarity: cosine(target, vectorOf(model, word)) }))
    .sort((a, b) => b.similarity - a.similarity);
}

export interface Analogy {
  a: string;
  b: string;
  c: string;
  expected: string;
}

export const ANALOGIES: readonly Analogy[] = [
  { a: "king", b: "man", c: "woman", expected: "queen" },
  { a: "queen", b: "woman", c: "man", expected: "king" },
  { a: "prince", b: "boy", c: "girl", expected: "princess" },
  { a: "king", b: "queen", c: "woman", expected: "man" },
  { a: "prince", b: "king", c: "queen", expected: "princess" },
  { a: "girl", b: "woman", c: "queen", expected: "princess" },
];

const PEOPLE_WORDS = PEOPLE.map((person) => person.word);

/** a − b + c: start at a, remove what b has, add what c has. Which word is nearest? */
export function solveAnalogy(model: Embeddings, analogy: Analogy) {
  const a = vectorOf(model, analogy.a);
  const b = vectorOf(model, analogy.b);
  const c = vectorOf(model, analogy.c);
  const target = a.map((value, d) => value - b[d] + c[d]);
  const ranked = nearest(model, target, PEOPLE_WORDS, [analogy.a, analogy.b, analogy.c]);
  return { target, ranked, correct: ranked[0]?.word === analogy.expected };
}

export function analogiesSolved(model: Embeddings): number {
  return ANALOGIES.filter((analogy) => solveAnalogy(model, analogy).correct).length;
}

/** Share of display words whose nearest display neighbour belongs to the same family. */
export function clusterPurity(model: Embeddings): number {
  const family = (group: Group) => (group === "royal" || group === "common" ? "person" : group);
  const words = DISPLAY_WORDS.map((entry) => entry.word);
  let pure = 0;
  for (const entry of DISPLAY_WORDS) {
    const closest = nearest(model, vectorOf(model, entry.word), words, [entry.word])[0];
    const group = DISPLAY_WORDS.find((other) => other.word === closest.word)?.group ?? "context";
    if (family(group) === family(entry.group)) pure += 1;
  }
  return pure / DISPLAY_WORDS.length;
}

/** The average difference between two sets of words: a direction such as "female − male". */
export function direction(model: Embeddings, plus: readonly string[], minus: readonly string[]) {
  const result = new Float64Array(model.dimensions);
  for (const word of plus)
    vectorOf(model, word).forEach((value, d) => (result[d] += value / plus.length));
  for (const word of minus)
    vectorOf(model, word).forEach((value, d) => (result[d] -= value / minus.length));
  return result;
}

/** Unit-length axes for drawing: gender, and rank with its overlap with gender removed. */
export function meaningAxes(model: Embeddings): { gender: Float64Array; rank: Float64Array } {
  const of = (key: "gender" | "group", value: string) =>
    PEOPLE.filter((person) => person[key] === value).map((person) => person.word);
  const unit = (vector: Float64Array) => {
    const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / length);
  };
  const gender = unit(direction(model, of("gender", "f"), of("gender", "m")));
  const rawRank = direction(model, of("group", "royal"), of("group", "common"));
  const overlap = rawRank.reduce((sum, value, d) => sum + value * gender[d], 0);
  return { gender, rank: unit(rawRank.map((value, d) => value - overlap * gender[d])) };
}

export function project(vector: ArrayLike<number>, axis: ArrayLike<number>): number {
  let total = 0;
  for (let d = 0; d < axis.length; d += 1) total += vector[d] * axis[d];
  return total;
}
