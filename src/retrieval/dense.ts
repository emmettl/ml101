/**
 * Retrieval by meaning. The word-weight search in engine.ts can only match a word to itself.
 * Here every word is replaced by its learned embedding (lesson 05): 50 numbers, set by training
 * on six billion words of Wikipedia and news so that words used alike sit close together. A
 * passage's vector is the weighted average of its words' vectors; so is the question's. "Bunny"
 * never occurs in the book, but its vector sits beside "rabbit", so the passage can still be
 * found.
 *
 * The vectors are GloVe (Pennington, Socher and Manning, 2014; public domain), cut down to the
 * words this page can need and stored as one byte per number. No browser globals.
 */

import {
  rank,
  stemOf,
  unit,
  wordsOf,
  type Chunk,
  type Index,
  type Match,
  type Word,
} from "./engine";

export interface WordVectors {
  size: number;
  rows: Map<string, number>;
  /** One row per word, each scaled to length one. */
  values: Float32Array;
}

/** `bytes` holds, for each word in order, `size` signed bytes; rows are rescaled on the way in. */
export function decodeVectors(
  list: readonly string[],
  bytes: Int8Array,
  size: number,
): WordVectors {
  const values = new Float32Array(list.length * size);
  for (let row = 0; row < list.length; row += 1) {
    let squares = 0;
    for (let d = 0; d < size; d += 1) squares += bytes[row * size + d] ** 2;
    const length = Math.sqrt(squares) || 1;
    for (let d = 0; d < size; d += 1) values[row * size + d] = bytes[row * size + d] / length;
  }
  return { size, rows: new Map(list.map((word, row) => [word, row])), values };
}

/** The spelling GloVe files a word under: lower case, and "Rabbit's" as "rabbit". */
export const spellingOf = (raw: string): string => raw.toLowerCase().replace(/'.*$/, "");

export function vectorOf(vectors: WordVectors, word: string): Float32Array | undefined {
  const row = vectors.rows.get(word);
  return row === undefined
    ? undefined
    : vectors.values.subarray(row * vectors.size, (row + 1) * vectors.size);
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

interface Token {
  spelling: string;
  weight: number;
}

export interface DenseIndex {
  vectors: WordVectors;
  /** How rare each spelling is across passages, as in the word-weight index. */
  rarity: Map<string, number>;
  rarest: number;
  /** What every passage has in common: removed, so that what is left is what sets one apart. */
  centre: Float32Array;
  passages: Float32Array[];
  /** The distinct content words of each passage, for explaining a match afterwards. */
  contents: string[][];
}

// peek:start meaning
/** The average of a text's learned word vectors, rare words counting for more. */
function average(vectors: WordVectors, tokens: readonly Token[]): Float32Array {
  const mean = new Float32Array(vectors.size);
  let total = 0;
  for (const { spelling, weight } of tokens) {
    const vector = vectorOf(vectors, spelling);
    if (!vector) continue;
    for (let d = 0; d < mean.length; d += 1) mean[d] += weight * vector[d];
    total += weight;
  }
  if (total > 0) for (let d = 0; d < mean.length; d += 1) mean[d] /= total;
  return mean;
}

/** A text's vector: its average, less what every passage has in common, scaled to length one. */
function embed(vectors: WordVectors, centre: Float32Array, tokens: readonly Token[]): Float32Array {
  const vector = average(vectors, tokens);
  let squares = 0;
  for (let d = 0; d < vector.length; d += 1) {
    vector[d] -= centre[d];
    squares += vector[d] * vector[d];
  }
  const length = Math.sqrt(squares) || 1;
  for (let d = 0; d < vector.length; d += 1) vector[d] /= length;
  return vector;
}

/** Rank passages by the angle between their vector and the question's. No word need be shared. */
export function retrieveByMeaning(dense: DenseIndex, question: string, keep: number): Match[] {
  const tokens = questionTokens(dense, question);
  if (!tokens.some((token) => dense.vectors.rows.has(token.spelling))) return [];
  const asked = embed(dense.vectors, dense.centre, tokens);
  const scored = dense.passages.map((passage, chunk) => {
    let score = 0;
    for (let d = 0; d < asked.length; d += 1) score += asked[d] * passage[d];
    return { chunk, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk - b.chunk)
    .slice(0, keep)
    .map((entry) => ({ ...entry, shared: explain(dense, question, entry.chunk) }));
}
// peek:end

function questionTokens(dense: DenseIndex, question: string): Token[] {
  const tokens: Token[] = [];
  for (const match of question.matchAll(/[A-Za-z][A-Za-z']*/g)) {
    if (!stemOf(match[0])) continue;
    const spelling = spellingOf(match[0]);
    // A word the book never uses is, as far as this book goes, as rare as a word can be.
    tokens.push({ spelling, weight: dense.rarity.get(spelling) ?? dense.rarest });
  }
  return tokens;
}

export function buildDenseIndex(
  text: string,
  words: readonly Word[],
  chunks: readonly Chunk[],
  vectors: WordVectors,
): DenseIndex {
  const spellings = words.map((word) =>
    word.stem ? spellingOf(text.slice(word.start, word.end)) : "",
  );
  const contents = chunks.map((chunk) => {
    const seen = new Set<string>();
    for (let at = chunk.from; at < chunk.to; at += 1) if (spellings[at]) seen.add(spellings[at]);
    return [...seen];
  });
  const found = new Map<string, number>();
  for (const content of contents)
    for (const spelling of content) found.set(spelling, (found.get(spelling) ?? 0) + 1);
  const rarity = new Map<string, number>();
  for (const [spelling, passages] of found)
    rarity.set(spelling, Math.log(1 + chunks.length / passages));
  const rarest = Math.log(1 + chunks.length);

  const tokensOf = (chunk: Chunk): Token[] => {
    const tokens: Token[] = [];
    for (let at = chunk.from; at < chunk.to; at += 1)
      if (spellings[at])
        tokens.push({ spelling: spellings[at], weight: rarity.get(spellings[at]) ?? 0 });
    return tokens;
  };
  // Every passage of one book leans the same way ("said", "little", "Alice"). Find that lean,
  // and remove it, so that what is compared is what sets a passage apart.
  const centre = new Float32Array(vectors.size);
  for (const chunk of chunks) {
    const mean = average(vectors, tokensOf(chunk));
    for (let d = 0; d < centre.length; d += 1) centre[d] += mean[d] / chunks.length;
  }
  const passages = chunks.map((chunk) => embed(vectors, centre, tokensOf(chunk)));
  return { vectors, rarity, rarest, centre, passages, contents };
}

/**
 * Why a passage matched: for each word of the question, the passage word nearest to it in
 * meaning. `via` names the question's word when the two are different words.
 */
function explain(dense: DenseIndex, question: string, chunk: number): Match["shared"] {
  const pairs: Match["shared"] = [];
  for (const token of questionTokens(dense, question)) {
    const asked = vectorOf(dense.vectors, token.spelling);
    if (!asked) continue;
    let best = "";
    let nearest = NEAR_ENOUGH;
    for (const spelling of dense.contents[chunk]) {
      const vector = vectorOf(dense.vectors, spelling);
      if (!vector) continue;
      const similarity = spelling === token.spelling ? 1 : cosine(asked, vector);
      if (similarity > nearest) {
        nearest = similarity;
        best = spelling;
      }
    }
    if (best)
      pairs.push({
        stem: stemOf(best),
        weight: nearest * token.weight,
        ...(best === token.spelling ? {} : { via: token.spelling }),
      });
  }
  return pairs.sort((a, b) => b.weight - a.weight);
}

/** Words of the question the embedding has no vector for. */
export function unknownToVectors(vectors: WordVectors, question: string): string[] {
  return wordsOf(question)
    .map((word) => question.slice(word.start, word.end))
    .filter((raw) => stemOf(raw) && !vectors.rows.has(spellingOf(raw)))
    .map((raw) => raw.toLowerCase());
}

export interface Neighbour {
  spelling: string;
  stem: string;
  similarity: number;
}

/** The book's vocabulary as the embedding sees it. Built once; it does not depend on passages. */
export interface Lexicon {
  vectors: WordVectors;
  /** Every content word of the book, by GloVe spelling, with the stem the word index files it under. */
  stems: Map<string, string>;
  cache: Map<string, Neighbour[]>;
}

export function buildLexicon(text: string, words: readonly Word[], vectors: WordVectors): Lexicon {
  const stems = new Map<string, string>();
  for (const word of words)
    if (word.stem) stems.set(spellingOf(text.slice(word.start, word.end)), word.stem);
  return { vectors, stems, cache: new Map() };
}

export const NEIGHBOURS = 3;
export const NEAR_ENOUGH = 0.6;

/** The words of the book whose learned vectors sit nearest to `raw`, nearest first. */
export function neighboursOf(lexicon: Lexicon, raw: string): Neighbour[] {
  const spelling = spellingOf(raw);
  const known = lexicon.cache.get(spelling);
  if (known) return known;
  const asked = vectorOf(lexicon.vectors, spelling);
  const near: Neighbour[] = [];
  if (asked)
    for (const [other, stem] of lexicon.stems) {
      const vector = vectorOf(lexicon.vectors, other);
      if (!vector || other === spelling) continue;
      const similarity = cosine(asked, vector);
      if (similarity >= NEAR_ENOUGH) near.push({ spelling: other, stem, similarity });
    }
  near.sort((a, b) => b.similarity - a.similarity);
  const distinct = near.filter(
    (entry, at) => near.findIndex((other) => other.stem === entry.stem) === at,
  );
  const kept = distinct.slice(0, NEIGHBOURS);
  lexicon.cache.set(spelling, kept);
  return kept;
}

// peek:start neighbours
/**
 * Word matching, with help. A word the book never uses cannot match anything, so ask the
 * embedding which of the book's words sit nearest to it, and search for those as well, each
 * discounted by how near it is. Words the book does use are left alone: widening those was
 * measured, and it added more noise than answers.
 */
export function retrieveWithNeighbours(
  index: Index,
  lexicon: Lexicon,
  question: string,
  keep: number,
): Match[] {
  const asked = new Map<string, number>();
  const via = new Map<string, string>();
  for (const match of question.matchAll(/[A-Za-z][A-Za-z']*/g)) {
    const stem = stemOf(match[0]);
    if (!stem) continue;
    const rarity = index.rarity.get(stem);
    if (rarity !== undefined) {
      asked.set(stem, Math.max(asked.get(stem) ?? 0, rarity));
      continue;
    }
    for (const near of neighboursOf(lexicon, match[0])) {
      const weight = (index.rarity.get(near.stem) ?? 0) * near.similarity;
      if (weight <= (asked.get(near.stem) ?? 0)) continue;
      asked.set(near.stem, weight);
      via.set(near.stem, match[0].toLowerCase());
    }
  }
  return rank(index, unit(asked), keep).map((match) => ({
    ...match,
    shared: match.shared.map((entry) =>
      via.has(entry.stem) ? { ...entry, via: via.get(entry.stem) } : entry,
    ),
  }));
}
// peek:end
