/**
 * The smallest possible language model: to guess the next character, find every place the
 * last few characters occurred in a book and count what came next. There are no knobs here
 * and no training. It is pure memory, which makes it the clearest way to see what "predict
 * the next token" means, and what goes wrong when a model can only recite.
 *
 * Nothing is precomputed: counting is a scan with `indexOf`, fast enough for a ~90 KB text
 * and valid for any context length. No browser globals.
 */

import type { Random } from "../shared/random";

export interface NextChoice {
  token: string;
  count: number;
  probability: number;
}

export interface Prediction {
  /** The context actually used, after any backing off. */
  context: string;
  /** How many characters were dropped from the requested context to find a match. */
  backedOff: number;
  /** Times the used context occurs in the text (with something after it). */
  occurrences: number;
  choices: NextChoice[];
}

/** Lower-case, and keep only letters, spaces and light punctuation. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z .,'?!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short contexts occur thousands of times, so their counts are worth remembering. */
const CACHEABLE = 3;
let cachedFor = "";
const cache = new Map<string, Map<string, number>>();

function countNext(text: string, context: string): Map<string, number> {
  if (context.length > CACHEABLE) return scan(text, context);
  if (cachedFor !== text) {
    cachedFor = text;
    cache.clear();
  }
  let counts = cache.get(context);
  if (!counts) {
    counts = scan(text, context);
    cache.set(context, counts);
  }
  return counts;
}

function scan(text: string, context: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (context === "") {
    for (const character of text) counts.set(character, (counts.get(character) ?? 0) + 1);
    return counts;
  }
  for (
    let at = text.indexOf(context);
    at !== -1 && at + context.length < text.length;
    at = text.indexOf(context, at + 1)
  ) {
    const next = text[at + context.length];
    counts.set(next, (counts.get(next) ?? 0) + 1);
  }
  return counts;
}

// peek:start predict
/**
 * What tends to follow `history` in the text? Uses the last `contextLength` characters; if
 * that exact run never occurs, drops the oldest character and tries again.
 */
export function predictNext(text: string, history: string, contextLength: number): Prediction {
  const wanted = history.slice(Math.max(0, history.length - contextLength));
  for (let drop = 0; drop <= wanted.length; drop += 1) {
    const context = wanted.slice(drop);
    const counts = countNext(text, context);
    if (counts.size === 0) continue;
    const occurrences = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const choices = [...counts]
      .map(([token, count]) => ({ token, count, probability: count / occurrences }))
      .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
    return { context, backedOff: drop, occurrences, choices };
  }
  return { context: "", backedOff: wanted.length, occurrences: 0, choices: [] };
}

/**
 * Temperature reshapes the odds before one is drawn: below 1 the favourite gets even more
 * likely, above 1 the long shots get a real chance. `topK` discards all but the k likeliest.
 */
export function reshape(choices: readonly NextChoice[], temperature: number, topK: number) {
  const kept = choices.slice(0, Math.max(1, topK));
  const weights = kept.map((choice) => choice.probability ** (1 / Math.max(0.05, temperature)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return kept.map((choice, index) => ({ ...choice, probability: weights[index] / total }));
}

export function sample(choices: readonly NextChoice[], random: Random): string {
  let remaining = random();
  for (const choice of choices) {
    remaining -= choice.probability;
    if (remaining <= 0) return choice.token;
  }
  return choices.at(-1)?.token ?? " ";
}
// peek:end

export interface Generation {
  text: string;
  /** Total characters of context dropped across all steps. */
  backoffs: number;
}

export function generate(
  text: string,
  prompt: string,
  length: number,
  contextLength: number,
  temperature: number,
  topK: number,
  random: Random,
): Generation {
  let output = prompt;
  let backoffs = 0;
  for (let index = 0; index < length; index += 1) {
    const prediction = predictNext(text, output, contextLength);
    if (!prediction.choices.length) break;
    backoffs += prediction.backedOff;
    output += sample(reshape(prediction.choices, temperature, topK), random);
  }
  return { text: output, backoffs };
}

export interface CopiedSpan {
  start: number;
  end: number;
}

/**
 * Stretches of `generated` that appear word for word in the source and are at least
 * `minimum` characters long: recitation, not composition.
 */
export function copiedSpans(text: string, generated: string, minimum = 24): CopiedSpan[] {
  const spans: CopiedSpan[] = [];
  let start = 0;
  while (start < generated.length) {
    let end = start + minimum;
    if (end > generated.length || !text.includes(generated.slice(start, end))) {
      start += 1;
      continue;
    }
    while (end < generated.length && text.includes(generated.slice(start, end + 1))) end += 1;
    spans.push({ start, end });
    start = end;
  }
  return spans;
}

export function copiedShare(text: string, generated: string, minimum = 24): number {
  if (!generated.length) return 0;
  const copied = copiedSpans(text, generated, minimum).reduce(
    (sum, span) => sum + span.end - span.start,
    0,
  );
  return copied / generated.length;
}

/** Share of generated words that are real words of the source text. */
export function realWordShare(vocabulary: ReadonlySet<string>, generated: string): number {
  const words = generated.split(/[^a-z']+/).filter((word) => word.length > 0);
  if (!words.length) return 0;
  return words.filter((word) => vocabulary.has(word)).length / words.length;
}

export function vocabularyOf(text: string): Set<string> {
  return new Set(text.split(/[^a-z']+/).filter((word) => word.length > 0));
}
