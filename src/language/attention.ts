/**
 * Attention, by hand. One word asks a question (its query); every word advertises what it is
 * (its key). How well a query matches a key is their dot product. Softmax turns the matches
 * into shares that add up to one, and the asking word's new meaning is that blend of the
 * others. In a trained transformer the queries and keys are computed by learned weights; here
 * they are set by hand in two dimensions so the mechanism can be seen. No browser globals.
 */

export interface SentenceWord {
  text: string;
  /** What this word advertises: [how much it is a living thing, how much it is a place]. */
  key: readonly [number, number];
}

export type Ending = "tired" | "wide";

export const FOCUS = "it";

const LEAD: readonly SentenceWord[] = [
  { text: "the", key: [-0.35, -0.3] },
  { text: "animal", key: [1.15, 0.05] },
  { text: "did", key: [-0.3, -0.1] },
  { text: "not", key: [-0.35, -0.15] },
  { text: "cross", key: [0.15, 0.3] },
  { text: "the", key: [-0.35, -0.3] },
  { text: "street", key: [0.05, 1.15] },
  { text: "because", key: [-0.45, -0.35] },
  { text: FOCUS, key: [0.1, 0.1] },
  { text: "was", key: [-0.3, -0.2] },
  { text: "too", key: [-0.3, -0.25] },
];

const LAST: Record<Ending, SentenceWord> = {
  tired: { text: "tired", key: [0.55, -0.25] },
  wide: { text: "wide", key: [-0.2, 0.55] },
};

/** The question "it" asks, once earlier layers have told it how the sentence ends. */
export const QUERY_FOR: Record<Ending, readonly [number, number]> = {
  tired: [3.4, -0.4],
  wide: [-0.4, 3.4],
};

export function sentence(ending: Ending): SentenceWord[] {
  return [...LEAD, LAST[ending]];
}

export const focusIndex = (words: readonly SentenceWord[]): number =>
  words.findIndex((word) => word.text === FOCUS);

// peek:start attention
/** Shares that add up to one. Subtracting the largest score first keeps exp() from overflowing. */
export function softmax(scores: readonly number[]): number[] {
  const finite = scores.filter((score) => score > -Infinity);
  if (!finite.length) return scores.map(() => 0);
  const top = Math.max(...finite);
  const weights = scores.map((score) => Math.exp(score - top));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/**
 * How much the asking word attends to each word. `sharpness` multiplies every score;
 * `backwardsOnly` hides the words that come after, as in a chatbot, which may not peek ahead.
 */
export function attend(
  query: readonly [number, number],
  words: readonly SentenceWord[],
  from: number,
  sharpness = 1,
  backwardsOnly = false,
): { scores: number[]; weights: number[] } {
  const scale = Math.sqrt(query.length); // keeps scores steady as vectors get longer
  const scores = words.map((word, index) => {
    if (index === from || (backwardsOnly && index > from)) return -Infinity;
    return (sharpness * (query[0] * word.key[0] + query[1] * word.key[1])) / scale;
  });
  return { scores, weights: softmax(scores) };
}
// peek:end

/** How many words effectively share the attention: 1 if one word takes it all, n if it is even. */
export function effectiveCount(weights: readonly number[]): number {
  let entropy = 0;
  for (const weight of weights) if (weight > 0) entropy -= weight * Math.log(weight);
  return Math.exp(entropy);
}

export function strongest(weights: readonly number[]): number {
  return weights.reduce((best, weight, index) => (weight > weights[best] ? index : best), 0);
}

/** The blend "it" becomes: how much living-thing and how much place it has absorbed. */
export function blend(words: readonly SentenceWord[], weights: readonly number[]) {
  let living = 0;
  let place = 0;
  words.forEach((word, index) => {
    living += weights[index] * word.key[0];
    place += weights[index] * word.key[1];
  });
  return { living, place };
}

/** A plain-language reading of the blend. */
export function readingOf(living: number, place: number): string {
  if (Math.abs(living - place) < 0.12) return "unclear";
  return living > place ? "a living thing" : "a place";
}
