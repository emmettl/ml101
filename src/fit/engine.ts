/**
 * Fitting a straight line: the smallest complete example of machine learning. The model has
 * two knobs (slope and intercept), the loss says how wrong a setting is, and gradient descent
 * turns the knobs downhill. No browser globals, so every rule here is unit-tested.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export interface DataPoint {
  x: number;
  y: number;
}

export interface Line {
  slope: number;
  intercept: number;
}

export type LossKind = "squared" | "absolute";

export const X_RANGE = [-2, 4] as const;
export const Y_RANGE = [-4, 8] as const;
export const SLOPE_RANGE = [-1, 3] as const;
export const INTERCEPT_RANGE = [-3, 5] as const;
export const TRUE_LINE: Line = { slope: 1.2, intercept: 0.8 };

/**
 * Noisy points around a hidden line. x is deliberately off-centre: that tilts the loss valley,
 * which is what makes gradient descent zig-zag instead of walking straight to the bottom.
 */
export function makeData(seed: number, count = 24, noise = 0.9): DataPoint[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const x = X_RANGE[0] + ((index + random()) / count) * (X_RANGE[1] - X_RANGE[0]);
    const y = TRUE_LINE.slope * x + TRUE_LINE.intercept + noise * normalRandom(random);
    return { x, y: Math.max(Y_RANGE[0], Math.min(Y_RANGE[1], y)) };
  });
}

export function predict(line: Line, x: number): number {
  return line.slope * x + line.intercept;
}

// peek:start loss
/** The average miss: square each error (or take its size), then average. */
export function loss(line: Line, data: readonly DataPoint[], kind: LossKind = "squared"): number {
  let total = 0;
  for (const point of data) {
    const error = line.slope * point.x + line.intercept - point.y;
    total += kind === "squared" ? error * error : Math.abs(error);
  }
  return total / data.length;
}
// peek:end

// peek:start descent
/** Which way is uphill? The slope of the loss with respect to each knob. */
export function gradient(line: Line, data: readonly DataPoint[]): Line {
  let slope = 0;
  let intercept = 0;
  for (const point of data) {
    const error = line.slope * point.x + line.intercept - point.y;
    slope += 2 * error * point.x;
    intercept += 2 * error;
  }
  return { slope: slope / data.length, intercept: intercept / data.length };
}

/** One step of learning: move each knob a little way downhill. */
export function descentStep(line: Line, data: readonly DataPoint[], learningRate: number): Line {
  const uphill = gradient(line, data);
  return {
    slope: line.slope - learningRate * uphill.slope,
    intercept: line.intercept - learningRate * uphill.intercept,
  };
}
// peek:end

/** The exact best line for squared loss (ordinary least squares). */
export function bestSquaredFit(data: readonly DataPoint[]): Line {
  const n = data.length;
  const meanX = data.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = data.reduce((sum, point) => sum + point.y, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const point of data) {
    covariance += (point.x - meanX) * (point.y - meanY);
    variance += (point.x - meanX) ** 2;
  }
  const slope = variance > 0 ? covariance / variance : 0;
  return { slope, intercept: meanY - slope * meanX };
}

/** The best line for absolute loss, by iteratively re-weighted least squares. */
export function bestAbsoluteFit(data: readonly DataPoint[]): Line {
  let line = bestSquaredFit(data);
  for (let iteration = 0; iteration < 60; iteration += 1) {
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;
    for (const point of data) {
      const weight = 1 / Math.max(1e-4, Math.abs(predict(line, point.x) - point.y));
      sw += weight;
      swx += weight * point.x;
      swy += weight * point.y;
      swxx += weight * point.x * point.x;
      swxy += weight * point.x * point.y;
    }
    const denominator = sw * swxx - swx * swx;
    if (Math.abs(denominator) < 1e-12) break;
    const slope = (sw * swxy - swx * swy) / denominator;
    line = { slope, intercept: (swy - slope * swx) / sw };
  }
  return line;
}

export function bestFit(data: readonly DataPoint[], kind: LossKind): Line {
  return kind === "squared" ? bestSquaredFit(data) : bestAbsoluteFit(data);
}

/** Loss at every knob setting on a grid: row 0 is the lowest intercept. */
export function lossGrid(
  data: readonly DataPoint[],
  kind: LossKind,
  columns: number,
  rows: number,
): Float64Array {
  const grid = new Float64Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    const intercept =
      INTERCEPT_RANGE[0] + ((row + 0.5) / rows) * (INTERCEPT_RANGE[1] - INTERCEPT_RANGE[0]);
    for (let column = 0; column < columns; column += 1) {
      const slope = SLOPE_RANGE[0] + ((column + 0.5) / columns) * (SLOPE_RANGE[1] - SLOPE_RANGE[0]);
      grid[row * columns + column] = loss({ slope, intercept }, data, kind);
    }
  }
  return grid;
}

/**
 * The largest learning rate at which full-batch descent still settles. The squared loss is a
 * bowl whose steepest curvature is 2·λmax of [[mean x², mean x], [mean x, 1]]; a step longer
 * than 1/λmax lands higher up the far side than it started, so the error grows without limit.
 */
export function criticalLearningRate(data: readonly DataPoint[]): number {
  const n = data.length;
  const a = data.reduce((sum, point) => sum + point.x * point.x, 0) / n;
  const b = data.reduce((sum, point) => sum + point.x, 0) / n;
  const largest = (a + 1) / 2 + Math.sqrt(((a - 1) / 2) ** 2 + b * b);
  return 1 / largest;
}

export interface DescentRun {
  path: Line[];
  losses: number[];
  diverged: boolean;
  /** First step at which the loss is within 1% of the best possible, if it got there. */
  settledAt: number | undefined;
}

export const DESCENT_START: Line = { slope: -0.6, intercept: 4.2 };
const DIVERGED_ABOVE = 1e6;

function batchOf(data: readonly DataPoint[], size: number, random: Random): DataPoint[] {
  return Array.from({ length: size }, () => data[Math.floor(random() * data.length)]);
}

/**
 * Run descent from a fixed start. With `batchSize` below the data size each step looks at a
 * random handful of points (stochastic gradient descent): cheaper, and noisier.
 */
export function runDescent(
  data: readonly DataPoint[],
  learningRate: number,
  steps: number,
  batchSize = data.length,
  seed = 1,
  start: Line = DESCENT_START,
): DescentRun {
  const random = seededRandom(seed);
  const target = loss(bestSquaredFit(data), data) * 1.01;
  const path = [start];
  const losses = [loss(start, data)];
  let line = start;
  let diverged = false;
  let settledAt: number | undefined;
  for (let step = 1; step <= steps; step += 1) {
    const batch = batchSize >= data.length ? data : batchOf(data, batchSize, random);
    line = descentStep(line, batch, learningRate);
    const current = loss(line, data);
    if (!Number.isFinite(current) || current > DIVERGED_ABOVE) {
      diverged = true;
      path.push(line);
      losses.push(DIVERGED_ABOVE);
      break;
    }
    path.push(line);
    losses.push(current);
    if (settledAt === undefined && current <= target) settledAt = step;
  }
  return { path, losses, diverged, settledAt };
}

/** A far-away point that drags a squared-loss fit much harder than an absolute-loss one. */
export const OUTLIER: DataPoint = { x: 3.4, y: -3.2 };

export function withOutlier(data: readonly DataPoint[], on: boolean): DataPoint[] {
  return on ? [...data, OUTLIER] : [...data];
}
