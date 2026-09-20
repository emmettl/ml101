/**
 * Retrieval with a passage encoder: a transformer (lesson 06) that reads a whole passage, every
 * word in the light of the others, and returns one vector for it. It was trained on a great
 * many question-and-answer pairs with one aim: a question's vector should land beside the
 * vector of the passage that answers it. This is what production systems mean by "embedding".
 *
 * The encoder has 23 million knobs and cannot run on this page, so its vectors were computed
 * ahead of time (scripts/make-passage-vectors.mjs) for every passage setting the lab offers and
 * for the lab's own questions. The search itself still happens here. No browser globals.
 */

import type { Match } from "./engine";

export const ENCODER_SIZE = 384;

/** Rows of `ENCODER_SIZE` signed bytes, rescaled to length one. */
export function decodeRows(bytes: Int8Array): Float32Array[] {
  const rows: Float32Array[] = [];
  for (let from = 0; from + ENCODER_SIZE <= bytes.length; from += ENCODER_SIZE) {
    const row = Float32Array.from(bytes.subarray(from, from + ENCODER_SIZE));
    let squares = 0;
    for (const value of row) squares += value * value;
    const length = Math.sqrt(squares) || 1;
    for (let d = 0; d < row.length; d += 1) row[d] /= length;
    rows.push(row);
  }
  return rows;
}

/** The file that holds the passage vectors for one setting of the lab. */
export const passageFile = (size: number, overlap: number): string =>
  `${size}-${Math.round(overlap * 100)}.bin`;

// peek:start encoder
/** Rank passages by the angle between their vector and the question's. That is all there is. */
export function retrieveByEncoder(
  passages: readonly Float32Array[],
  asked: Float32Array,
  keep: number,
): Match[] {
  return passages
    .map((passage, chunk) => {
      let score = 0;
      for (let d = 0; d < asked.length; d += 1) score += asked[d] * passage[d];
      // The encoder read the passage whole, so there are no matched words to report.
      return { chunk, score, shared: [] };
    })
    .sort((a, b) => b.score - a.score || a.chunk - b.chunk)
    .slice(0, keep);
}
// peek:end
