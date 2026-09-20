/**
 * Overfitting, in one dimension. A flexible curve is fitted to a few noisy points and then
 * scored on points it never saw. The flexibility knob is the polynomial degree.
 *
 * Numerics: powers of x (1, x, x², …) are nearly parallel by degree 12 and the solve breaks
 * down, so the curve is built from Chebyshev polynomials on x rescaled to [−1, 1], which stay
 * well separated. The fit is the usual least-squares solve, via Cholesky.
 */

import { normalRandom, seededRandom } from "../shared/random";

export interface Sample {
  x: number;
  y: number;
}

export const X_RANGE = [0, 4] as const;
export const Y_RANGE = [-2.5, 3.5] as const;
export const MAX_DEGREE = 12;
export const HELD_OUT_COUNT = 200;

/** The shape hidden under the noise. The learner never sees this; the model never does either. */
export function truth(x: number): number {
  return Math.sin(2.5 * x) + 0.3 * x;
}

/**
 * Training points are spread evenly with a little jitter (so no large gaps appear by luck);
 * held-out points come from the same process with a different seed.
 */
export function makeSamples(seed: number, count: number, noise: number): Sample[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const x = X_RANGE[0] + ((index + random()) / count) * (X_RANGE[1] - X_RANGE[0]);
    return { x, y: truth(x) + noise * normalRandom(random) };
  });
}

export function heldOutSamples(seed: number, noise: number): Sample[] {
  return makeSamples((seed ^ 0x9e3779b9) >>> 0 || 1, HELD_OUT_COUNT, noise);
}

function scaled(x: number): number {
  return (2 * (x - X_RANGE[0])) / (X_RANGE[1] - X_RANGE[0]) - 1;
}

/** Chebyshev features T₀…T_degree of x. */
export function features(x: number, degree: number): number[] {
  const t = scaled(x);
  const row = [1, t];
  for (let k = 2; k <= degree; k += 1) row.push(2 * t * row[k - 1] - row[k - 2]);
  return row.slice(0, degree + 1);
}

const zeros = (length: number): number[] => Array.from({ length }, () => 0);

/** Solve A·w = b for symmetric positive-definite A. Returns undefined if A is not. */
export function choleskySolve(a: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const lower = Array.from({ length: n }, () => zeros(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = a[i][j];
      for (let k = 0; k < j; k += 1) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (!(sum > 0)) return undefined;
        lower[i][i] = Math.sqrt(sum);
      } else {
        lower[i][j] = sum / lower[j][j];
      }
    }
  }
  const y = zeros(n);
  for (let i = 0; i < n; i += 1) {
    let sum = b[i];
    for (let k = 0; k < i; k += 1) sum -= lower[i][k] * y[k];
    y[i] = sum / lower[i][i];
  }
  const w = zeros(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i];
    for (let k = i + 1; k < n; k += 1) sum -= lower[k][i] * w[k];
    w[i] = sum / lower[i][i];
  }
  return w;
}

export interface Fit {
  degree: number;
  weights: number[];
}

// peek:start fit
/**
 * Least squares with a penalty on wiggliness. `penalty` charges each weight in proportion to
 * k², so the high, wiggly terms cost the most and the constant costs nothing.
 */
export function fitPolynomial(samples: readonly Sample[], degree: number, penalty: number): Fit {
  const size = degree + 1;
  const normal = Array.from({ length: size }, () => zeros(size));
  const target = zeros(size);
  for (const sample of samples) {
    const row = features(sample.x, degree);
    for (let i = 0; i < size; i += 1) {
      target[i] += row[i] * sample.y;
      for (let j = 0; j < size; j += 1) normal[i][j] += row[i] * row[j];
    }
  }
  for (let k = 0; k < size; k += 1) {
    normal[k][k] += penalty * samples.length * k * k + 1e-9 * samples.length;
  }
  return { degree, weights: choleskySolve(normal, target) ?? zeros(size) };
}

export function evaluate(fit: Fit, x: number): number {
  const row = features(x, fit.degree);
  return fit.weights.reduce((sum, weight, k) => sum + weight * row[k], 0);
}

/** The average squared miss of a fitted curve on any set of points. */
export function meanSquaredError(fit: Fit, samples: readonly Sample[]): number {
  let total = 0;
  for (const sample of samples) total += (evaluate(fit, sample.x) - sample.y) ** 2;
  return total / samples.length;
}
// peek:end

/** A curve needs at least as many points as knobs; beyond that the fit is not determined. */
export function maxDegreeFor(count: number): number {
  return Math.max(1, Math.min(MAX_DEGREE, count - 2));
}

export interface SweepRow {
  degree: number;
  trainError: number;
  heldOutError: number;
}

export function sweepDegrees(
  train: readonly Sample[],
  heldOut: readonly Sample[],
  penalty: number,
): SweepRow[] {
  const rows: SweepRow[] = [];
  for (let degree = 1; degree <= maxDegreeFor(train.length); degree += 1) {
    const fit = fitPolynomial(train, degree, penalty);
    rows.push({
      degree,
      trainError: meanSquaredError(fit, train),
      heldOutError: meanSquaredError(fit, heldOut),
    });
  }
  return rows;
}

export function bestDegree(rows: readonly SweepRow[]): number {
  return rows.reduce((best, row) => (row.heldOutError < best.heldOutError ? row : best)).degree;
}

export type Verdict = "too simple" | "about right" | "memorising";

/** A plain-language reading of where a degree sits on the sweep. */
export function verdict(rows: readonly SweepRow[], degree: number): Verdict {
  const best = bestDegree(rows);
  const row = rows.find((entry) => entry.degree === degree) ?? rows[0];
  const floor = rows.find((entry) => entry.degree === best)?.heldOutError ?? row.heldOutError;
  if (row.heldOutError <= floor * 1.35) return "about right";
  return degree < best ? "too simple" : "memorising";
}
