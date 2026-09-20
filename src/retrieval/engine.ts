/**
 * Retrieval: answering from an open book. The text is cut into passages, every passage becomes
 * a list of numbers, the question becomes a list of numbers the same way, and the passages
 * whose numbers point most nearly the same way as the question's are handed to the model.
 *
 * The numbers here are word weights: one slot per word in the book, large when the word is
 * frequent in this passage and rare in the book. It is the oldest embedding there is, and
 * every step of it can be inspected. A production system swaps in a learned embedding (lesson
 * 05) that also knows "bunny" sits beside "rabbit"; nothing else in the pipeline changes.
 * No browser globals.
 */

export interface Word {
  /** The stem used for matching, or "" for a word too common to be worth matching. */
  stem: string;
  /** Character offsets of the word in the source text. */
  start: number;
  end: number;
}

const STOP_WORDS = new Set(
  (
    "a an the and or but if of to in on at by for with from into as is are was were be been am " +
    "it its this that these those he she they them his her their i you we me my your our him " +
    "what which who whom whose when where why how do does did done had has have not no so " +
    "there then than very said say says would could should will can may might must shall " +
    "up out about all any some one just more most such only own same too s t don again"
  ).split(" "),
);

/** A deliberately small stemmer: enough for "grinned" to meet "grin" and "sisters" "sister". */
export function stemOf(raw: string): string {
  let word = raw.toLowerCase().replace(/'s$/, "").replace(/'/g, "");
  if (STOP_WORDS.has(word)) return "";
  if (word.length > 4 && word.endsWith("ies")) word = `${word.slice(0, -3)}y`;
  else if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word))
    word = word.slice(0, -1);
  if (word.length > 5 && word.endsWith("ing")) word = word.slice(0, -3);
  else if (word.length > 4 && word.endsWith("ed")) word = word.slice(0, -2);
  // "grinned" → "grinn" → "grin"; "sitting" → "sitt" → "sit".
  if (word.length > 3 && word.at(-1) === word.at(-2) && !/[aeiouls]$/.test(word))
    word = word.slice(0, -1);
  if (word.length > 4 && word.endsWith("e")) word = word.slice(0, -1);
  return word;
}

export function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(/[A-Za-z][A-Za-z']*/g))
    words.push({ stem: stemOf(match[0]), start: match.index, end: match.index + match[0].length });
  return words;
}

export interface Chunk {
  /** Word positions [from, to). */
  from: number;
  to: number;
  /** Character offsets of the passage in the source text. */
  start: number;
  end: number;
}

/**
 * Cut the text into passages of `size` words. With an overlap, each passage starts before the
 * previous one has ended, so a sentence cut in two by one boundary is whole in the neighbour.
 */
export function chunkWords(words: readonly Word[], size: number, overlapShare: number): Chunk[] {
  const stride = Math.max(1, Math.round(size * (1 - overlapShare)));
  const chunks: Chunk[] = [];
  for (let from = 0; from < words.length; from += stride) {
    const to = Math.min(words.length, from + size);
    chunks.push({ from, to, start: words[from].start, end: words[to - 1].end });
    if (to === words.length) break;
  }
  return chunks;
}

export interface Index {
  chunks: Chunk[];
  /** How rare each word is across passages: the weight a match on it carries. */
  rarity: Map<string, number>;
  /** One sparse vector per passage, already scaled to length one. */
  vectors: Map<string, number>[];
}

function scaled(counts: Map<string, number>, rarity: Map<string, number>): Map<string, number> {
  const vector = new Map<string, number>();
  let squares = 0;
  for (const [stem, count] of counts) {
    const weight = (1 + Math.log(count)) * (rarity.get(stem) ?? 0);
    if (weight === 0) continue;
    vector.set(stem, weight);
    squares += weight * weight;
  }
  const length = Math.sqrt(squares) || 1;
  for (const [stem, weight] of vector) vector.set(stem, weight / length);
  return vector;
}

export function buildIndex(words: readonly Word[], chunks: Chunk[]): Index {
  const counts = chunks.map((chunk) => {
    const count = new Map<string, number>();
    for (let at = chunk.from; at < chunk.to; at += 1) {
      const { stem } = words[at];
      if (stem) count.set(stem, (count.get(stem) ?? 0) + 1);
    }
    return count;
  });
  const found = new Map<string, number>();
  for (const count of counts)
    for (const stem of count.keys()) found.set(stem, (found.get(stem) ?? 0) + 1);
  const rarity = new Map<string, number>();
  for (const [stem, passages] of found) rarity.set(stem, Math.log(1 + chunks.length / passages));
  return { chunks, rarity, vectors: counts.map((count) => scaled(count, rarity)) };
}

export interface Match {
  chunk: number;
  /** Cosine similarity with the question: 0 shares nothing, 1 is the same mix of words. */
  score: number;
  /** The words that produced the score, heaviest first. */
  shared: { stem: string; weight: number }[];
}

// peek:start retrieve
/** The question becomes a vector exactly as a passage does; words the book never uses vanish. */
export function embedQuestion(index: Index, question: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { stem } of wordsOf(question))
    if (stem && index.rarity.has(stem)) counts.set(stem, (counts.get(stem) ?? 0) + 1);
  return scaled(counts, index.rarity);
}

/** Score every passage against the question and keep the best `keep`. */
export function retrieve(index: Index, question: string, keep: number): Match[] {
  const asked = embedQuestion(index, question);
  const matches: Match[] = [];
  index.vectors.forEach((passage, chunk) => {
    // Both vectors have length one, so the dot product is the cosine of the angle between them.
    let score = 0;
    const shared: Match["shared"] = [];
    for (const [stem, weight] of asked) {
      const other = passage.get(stem);
      if (other === undefined) continue;
      score += weight * other;
      shared.push({ stem, weight: weight * other });
    }
    if (score > 0)
      matches.push({ chunk, score, shared: shared.sort((a, b) => b.weight - a.weight) });
  });
  return matches.sort((a, b) => b.score - a.score || a.chunk - b.chunk).slice(0, keep);
}
// peek:end

/** Words of the question that occur nowhere in the book, so cannot match anything. */
export function unknownWords(index: Index, question: string): string[] {
  const unknown: string[] = [];
  for (const match of question.matchAll(/[A-Za-z][A-Za-z']*/g)) {
    const stem = stemOf(match[0]);
    if (stem && !index.rarity.has(stem)) unknown.push(match[0].toLowerCase());
  }
  return unknown;
}

export interface Question {
  id: string;
  ask: string;
  answer: string;
  /** Words copied from the book that prove the answer. Retrieval succeeds if a passage holds them all. */
  evidence: string;
  /** Does the question use the book's own words, or a reader's paraphrase of them? */
  wording: "book" | "own";
}

/** Where the evidence sits in the text, or undefined if it is not there. */
export function locate(
  text: string,
  question: Question,
): { start: number; end: number } | undefined {
  const start = text.indexOf(question.evidence);
  return start < 0 ? undefined : { start, end: start + question.evidence.length };
}

/** Position (1 = first) of the best-ranked passage that contains the whole evidence, or 0. */
export function answerRank(
  index: Index,
  matches: readonly Match[],
  span: { start: number; end: number },
): number {
  const at = matches.findIndex(({ chunk }) => {
    const passage = index.chunks[chunk];
    return passage.start <= span.start && passage.end >= span.end;
  });
  return at + 1;
}

/** True if no passage at all holds the whole evidence: a boundary has cut through it. */
export function cutByBoundary(index: Index, span: { start: number; end: number }): boolean {
  return !index.chunks.some((passage) => passage.start <= span.start && passage.end >= span.end);
}

export interface Exam {
  /** Rank of the answer for each question (0 = not in the deepest search). */
  ranks: number[];
  cut: boolean[];
}

export function sitExam(
  index: Index,
  text: string,
  questions: readonly Question[],
  depth: number,
): Exam {
  const ranks: number[] = [];
  const cut: boolean[] = [];
  for (const question of questions) {
    const span = locate(text, question);
    if (!span) {
      ranks.push(0);
      cut.push(false);
      continue;
    }
    ranks.push(answerRank(index, retrieve(index, question.ask, depth), span));
    cut.push(cutByBoundary(index, span));
  }
  return { ranks, cut };
}

/** How many questions had their answer among the first `keep` passages. */
export function found(exam: Exam, keep: number, only?: (at: number) => boolean): number {
  return exam.ranks.filter((rank, at) => rank > 0 && rank <= keep && (!only || only(at))).length;
}
