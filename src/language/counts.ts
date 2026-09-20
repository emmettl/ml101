/**
 * The count table from lesson 07, made fair for a contest. A raw table gives anything it never
 * saw a probability of zero, which is an infinite loss on the first surprise. This version
 * blends each context length with the shorter one beneath it (Witten–Bell interpolation), the
 * standard way to make a count model usable on unseen text. It is a strong baseline on a small
 * book, which is the point: the network has to earn its result. No browser globals.
 */

export interface CountModel {
  order: number;
  vocabulary: number;
  /** tables[n] maps a context of n character ids to the counts of what followed it. */
  tables: Map<string, Map<number, number>>[];
}

const keyOf = (ids: ArrayLike<number>, from: number, to: number): string => {
  let key = "";
  for (let i = from; i < to; i += 1) key += String.fromCharCode(ids[i]);
  return key;
};

export function buildCounts(
  ids: ArrayLike<number>,
  limit: number,
  order: number,
  vocabulary: number,
): CountModel {
  const tables = Array.from({ length: order + 1 }, () => new Map<string, Map<number, number>>());
  for (let at = 0; at < limit; at += 1)
    for (let n = 0; n <= order && n <= at; n += 1) {
      const key = keyOf(ids, at - n, at);
      let follows = tables[n].get(key);
      if (!follows) tables[n].set(key, (follows = new Map()));
      follows.set(ids[at], (follows.get(ids[at]) ?? 0) + 1);
    }
  return { order, vocabulary, tables };
}

/** Numbers the table has to store: one per (context, next character) pair it has seen. */
export function tableEntries(model: CountModel): number {
  let entries = 0;
  for (const follows of model.tables[model.order].values()) entries += follows.size;
  return entries;
}

/** True if this exact context of `order` characters occurs in the training text. */
export function contextSeen(model: CountModel, ids: ArrayLike<number>, at: number): boolean {
  return at >= model.order && model.tables[model.order].has(keyOf(ids, at - model.order, at));
}

/** Smoothed odds of `next` after the characters before position `at`. */
export function countProbability(
  model: CountModel,
  ids: ArrayLike<number>,
  at: number,
  next: number,
): number {
  let probability = 1 / model.vocabulary;
  for (let n = 0; n <= model.order && n <= at; n += 1) {
    const follows = model.tables[n].get(keyOf(ids, at - n, at));
    if (!follows) break;
    let total = 0;
    for (const count of follows.values()) total += count;
    // The more different things followed this context, the less its counts are trusted.
    const distinct = follows.size;
    probability = ((follows.get(next) ?? 0) + distinct * probability) / (total + distinct);
  }
  return probability;
}

export function countOdds(model: CountModel, history: ArrayLike<number>): number[] {
  return Array.from({ length: model.vocabulary }, (_, next) =>
    countProbability(model, history, history.length, next),
  );
}

export function countSurprise(
  model: CountModel,
  ids: ArrayLike<number>,
  from: number,
  to: number,
  keep?: (at: number) => boolean,
): { surprise: number; count: number } {
  let total = 0;
  let count = 0;
  for (let at = Math.max(from, model.order); at < to; at += 1) {
    if (keep && !keep(at)) continue;
    total -= Math.log(countProbability(model, ids, at, ids[at]));
    count += 1;
  }
  return { surprise: count ? total / count : 0, count };
}
