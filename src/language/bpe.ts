/**
 * Byte-pair encoding, the way real language models cut text into tokens. Start with single
 * characters. Find the pair of neighbouring pieces that occurs most often and glue it into one
 * new piece. Repeat. Common words end up as a single token; rare words stay in fragments.
 * No browser globals.
 */

/** Marks the start of a word, so "the" as a word and "the" inside "other" stay distinct. */
export const WORD_START = "_";

export interface Merge {
  left: string;
  right: string;
  /** How often the pair occurred when it was chosen. */
  count: number;
}

function wordCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of text.split(/\s+/)) if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

function mergeOnce(pieces: string[], left: string, right: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    if (pieces[index] === left && pieces[index + 1] === right) {
      result.push(left + right);
      index += 1;
    } else result.push(pieces[index]);
  }
  return result;
}

// peek:start bpe
/**
 * Learn `limit` merges from a text: repeatedly glue the most frequent neighbouring pair.
 * Pieces are handled as numbers (positions in `symbols`) so that counting pairs is fast.
 */
export function learnMerges(text: string, limit: number): Merge[] {
  const symbols: string[] = [];
  const ids = new Map<string, number>();
  const idOf = (symbol: string): number => {
    let id = ids.get(symbol);
    if (id === undefined) {
      id = symbols.push(symbol) - 1;
      ids.set(symbol, id);
    }
    return id;
  };
  const words = [...wordCounts(text)].map(([word, count]) => ({
    pieces: [WORD_START, ...word].map(idOf),
    count,
  }));
  const merges: Merge[] = [];
  // One counter per possible pair, reused every round; `seen` remembers which were touched.
  const span = symbols.length + limit;
  const counts = new Int32Array(span * span);
  while (merges.length < limit) {
    const seen: number[] = [];
    for (const { pieces, count } of words)
      for (let index = 0; index < pieces.length - 1; index += 1) {
        const key = pieces[index] * span + pieces[index + 1];
        if (counts[key] === 0) seen.push(key);
        counts[key] += count;
      }
    let best = -1;
    let bestCount = 1;
    for (const key of seen) {
      const count = counts[key];
      counts[key] = 0;
      if (count > bestCount || (count === bestCount && key < best)) {
        best = key;
        bestCount = count;
      }
    }
    if (best < 0) break;
    const left = Math.floor(best / span);
    const right = best % span;
    const glued = idOf(symbols[left] + symbols[right]);
    for (const word of words) {
      const { pieces } = word;
      let found = false;
      for (let index = 0; index < pieces.length - 1 && !found; index += 1)
        found = pieces[index] === left && pieces[index + 1] === right;
      if (!found) continue;
      const result: number[] = [];
      for (let index = 0; index < pieces.length; index += 1) {
        if (pieces[index] === left && pieces[index + 1] === right) {
          result.push(glued);
          index += 1;
        } else result.push(pieces[index]);
      }
      word.pieces = result;
    }
    merges.push({ left: symbols[left], right: symbols[right], count: bestCount });
  }
  return merges;
}

/** Cut any text into tokens by replaying the first `use` merges, in the order they were learned. */
export function tokenise(text: string, merges: readonly Merge[], use = merges.length): string[] {
  const tokens: string[] = [];
  for (const word of text.toLowerCase().split(/\s+/)) {
    if (!word) continue;
    let pieces = [WORD_START, ...word];
    for (const merge of merges.slice(0, use)) {
      if (pieces.length === 1) break;
      pieces = mergeOnce(pieces, merge.left, merge.right);
    }
    tokens.push(...pieces);
  }
  return tokens;
}
// peek:end

/** Distinct tokens the tokeniser can emit after `use` merges: the base symbols plus one per merge. */
export function vocabularySize(text: string, use: number): number {
  return new Set([WORD_START, ...text.replace(/\s+/g, "")]).size + use;
}
