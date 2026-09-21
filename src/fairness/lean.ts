/**
 * Bias in text nobody labelled. The word vectors of the Open-Book Lab were trained only to
 * predict which words appear near which, across six billion words of Wikipedia and news.
 * Average the differences she − he, woman − man and so on, and you have a direction. A job
 * word has no business pointing along it, and many do. No browser globals.
 */

import { cosine, vectorOf, type WordVectors } from "../retrieval/dense";
import { OCCUPATIONS, PAIRS } from "./occupations";

// peek:start lean
/** The average of (she − he), (woman − man), … : the direction in which those pairs differ. */
export function pairDirection(vectors: WordVectors): Float32Array {
  const direction = new Float32Array(vectors.size);
  for (const [first, second] of PAIRS) {
    const from = vectorOf(vectors, first);
    const to = vectorOf(vectors, second);
    if (!from || !to) continue;
    for (let d = 0; d < direction.length; d += 1) direction[d] += (to[d] - from[d]) / PAIRS.length;
  }
  return direction;
}

export interface Lean {
  word: string;
  /** Cosine with the direction: below zero leans towards "he", above towards "she". */
  lean: number;
}

/** Every job word's lean, from the most "he" to the most "she". */
export function occupationLeans(vectors: WordVectors): Lean[] {
  const direction = pairDirection(vectors);
  const leans: Lean[] = [];
  for (const word of OCCUPATIONS) {
    const vector = vectorOf(vectors, word);
    if (vector) leans.push({ word, lean: cosine(vector, direction) });
  }
  return leans.sort((a, b) => a.lean - b.lean);
}
// peek:end
