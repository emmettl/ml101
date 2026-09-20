/** Deterministic randomness, so every chart is stable between redraws and every test repeats. */

export type Random = () => number;

/** xorshift32: small, fast and identical on every platform. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** One standard normal draw (Box–Muller). */
export function normalRandom(random: Random): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The next seed in a fixed sequence, used by "new data" buttons. */
export function nextSeed(seed: number): number {
  return (Math.imul(seed, 1103515245) + 12345) >>> 0 || 1;
}

export function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
