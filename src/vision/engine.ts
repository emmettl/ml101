/**
 * Seeing with the same knobs everywhere. A picture is a grid of numbers, and a small pattern
 * of weights (a filter) slid across it, multiplying and summing at every position, produces a
 * map of where that pattern occurs. That sliding is convolution. A network built from such
 * filters learns what to look for, and because one filter serves every position, it recognises
 * a shape wherever it appears, with a fraction of the knobs a fully connected network needs.
 *
 * The pictures are tiny invented shapes (a bar, a cross, a ring, a corner) drawn at random
 * positions with noise, so the truth is known and the two networks can be compared fairly.
 * Both are trained by lesson 01's descent with lesson 04's backpropagation. No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export const SIZE = 12;
export const SHAPES = ["bar", "cross", "ring", "corner"] as const;
export type Shape = (typeof SHAPES)[number];

export interface Picture {
  pixels: Float32Array;
  label: number;
  /** How far the shape was moved from the centre, so that generalisation can be measured. */
  offset: number;
}

function stamp(pixels: Float32Array, shape: Shape, ox: number, oy: number): void {
  const set = (x: number, y: number) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) pixels[y * SIZE + x] = 1;
  };
  for (let d = -2; d <= 2; d += 1) {
    if (shape === "bar") set(ox + d, oy);
    if (shape === "cross") {
      set(ox + d, oy);
      set(ox, oy + d);
    }
    if (shape === "corner") {
      set(ox + d + 2, oy - 2);
      set(ox - 2, oy + d + 2);
    }
  }
  if (shape === "ring")
    for (let y = -2; y <= 2; y += 1)
      for (let x = -2; x <= 2; x += 1)
        if (Math.max(Math.abs(x), Math.abs(y)) === 2) set(ox + x, oy + y);
}

/**
 * Pictures of the four shapes. `shift` is the largest distance from the centre a shape may be
 * drawn at: 0 keeps every shape centred, 3 lets it wander over most of the picture.
 */
export function makePictures(count: number, shift: number, noise: number, seed: number): Picture[] {
  const random = seededRandom(seed);
  const pictures: Picture[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = index % SHAPES.length;
    const pixels = new Float32Array(SIZE * SIZE);
    const ox = Math.round(SIZE / 2 - 0.5 + (random() * 2 - 1) * shift);
    const oy = Math.round(SIZE / 2 - 0.5 + (random() * 2 - 1) * shift);
    stamp(pixels, SHAPES[label], ox, oy);
    for (let at = 0; at < pixels.length; at += 1)
      pixels[at] = Math.max(0, Math.min(1, pixels[at] + noise * normalRandom(random)));
    pictures.push({ pixels, label, offset: Math.max(Math.abs(ox - 5.5), Math.abs(oy - 5.5)) });
  }
  return pictures;
}

export const KERNEL = 3;
export const MAP = SIZE - KERNEL + 1;

// peek:start convolve
/** Slide a 3×3 filter over a picture: at every position, multiply the patch by the filter and sum. */
export function convolve(
  pixels: ArrayLike<number>,
  filter: ArrayLike<number>,
  out: Float32Array,
): void {
  for (let y = 0; y < MAP; y += 1)
    for (let x = 0; x < MAP; x += 1) {
      let sum = 0;
      for (let ky = 0; ky < KERNEL; ky += 1)
        for (let kx = 0; kx < KERNEL; kx += 1)
          sum += filter[ky * KERNEL + kx] * pixels[(y + ky) * SIZE + (x + kx)];
      out[y * MAP + x] = sum;
    }
}
// peek:end

/** Hand-set filters for the lesson: what a filter is, before any are learned. */
export const NAMED_FILTERS: Record<string, number[]> = {
  identity: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  blur: [1, 1, 1, 1, 1, 1, 1, 1, 1].map((v) => v / 9),
  vertical: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
  horizontal: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
  outline: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
};

export type Design = "conv" | "dense";

/**
 * Two small classifiers with the same job. The convolutional one: `filters` 3×3 filters, each
 * slid over the picture and passed through ReLU, then each map is averaged to one number
 * (global pooling: "how much of this pattern is there, wherever it is") and a final layer maps
 * those numbers to four scores. The dense one: every pixel wired to `hidden` neurons, then to
 * four scores. Same loss, same descent.
 */
export interface Model {
  design: Design;
  /** conv: filters × 9 weights; dense: hidden × 144 weights. */
  weights1: Float32Array;
  bias1: Float32Array;
  /** conv: 4 × filters; dense: 4 × hidden. */
  weights2: Float32Array;
  bias2: Float32Array;
  units: number;
  /** conv only: whether each map is summarised by its average or by its largest value. */
  pooling: Pooling;
}

export type Pooling = "average" | "max";

export function createModel(
  design: Design,
  units: number,
  seed: number,
  pooling: Pooling = "max",
): Model {
  const random = seededRandom(seed);
  const inputs = design === "conv" ? KERNEL * KERNEL : SIZE * SIZE;
  const fill = (length: number, spread: number) =>
    Float32Array.from({ length }, () => spread * normalRandom(random));
  return {
    design,
    units,
    pooling,
    weights1: fill(units * inputs, Math.sqrt(2 / inputs)),
    bias1: new Float32Array(units),
    weights2: fill(SHAPES.length * units, Math.sqrt(1 / units)),
    bias2: new Float32Array(SHAPES.length),
  };
}

export function knobCount(model: Model): number {
  return model.weights1.length + model.bias1.length + model.weights2.length + model.bias2.length;
}

interface Pass {
  /** conv: units × MAP² map values after ReLU; dense: units hidden activations. */
  hidden: Float32Array;
  /** conv only: the pooled value per filter. */
  pooled: Float32Array;
  scores: Float32Array;
  odds: Float32Array;
}

function forward(model: Model, pixels: ArrayLike<number>, pass: Pass): void {
  const { units } = model;
  if (model.design === "conv") {
    const map = new Float32Array(MAP * MAP);
    for (let f = 0; f < units; f += 1) {
      convolve(pixels, model.weights1.subarray(f * 9, f * 9 + 9), map);
      let total = 0;
      let largest = 0;
      for (let at = 0; at < map.length; at += 1) {
        const value = Math.max(0, map[at] + model.bias1[f]);
        pass.hidden[f * map.length + at] = value;
        total += value;
        if (value > largest) largest = value;
      }
      pass.pooled[f] = model.pooling === "max" ? largest : total / map.length;
    }
  } else {
    for (let h = 0; h < units; h += 1) {
      let sum = model.bias1[h];
      const row = h * SIZE * SIZE;
      for (let at = 0; at < SIZE * SIZE; at += 1) sum += model.weights1[row + at] * pixels[at];
      pass.pooled[h] = Math.max(0, sum);
    }
  }
  let top = -Infinity;
  for (let k = 0; k < SHAPES.length; k += 1) {
    let sum = model.bias2[k];
    for (let u = 0; u < units; u += 1) sum += model.weights2[k * units + u] * pass.pooled[u];
    pass.scores[k] = sum;
    if (sum > top) top = sum;
  }
  let total = 0;
  for (let k = 0; k < SHAPES.length; k += 1) total += pass.odds[k] = Math.exp(pass.scores[k] - top);
  for (let k = 0; k < SHAPES.length; k += 1) pass.odds[k] /= total;
}

function newPass(model: Model): Pass {
  return {
    hidden: new Float32Array(model.units * MAP * MAP),
    pooled: new Float32Array(model.units),
    scores: new Float32Array(SHAPES.length),
    odds: new Float32Array(SHAPES.length),
  };
}

/** One descent step on a batch: blame flows from the odds back through the pooling and the filters. */
export function trainStep(model: Model, batch: readonly Picture[], rate: number): number {
  const { units } = model;
  const pass = newPass(model);
  const g1 = new Float32Array(model.weights1.length);
  const gb1 = new Float32Array(units);
  const g2 = new Float32Array(model.weights2.length);
  const gb2 = new Float32Array(SHAPES.length);
  const blamePooled = new Float32Array(units);
  let loss = 0;
  for (const picture of batch) {
    forward(model, picture.pixels, pass);
    loss -= Math.log(Math.max(pass.odds[picture.label], 1e-12));
    blamePooled.fill(0);
    for (let k = 0; k < SHAPES.length; k += 1) {
      const blame = pass.odds[k] - (k === picture.label ? 1 : 0);
      gb2[k] += blame;
      for (let u = 0; u < units; u += 1) {
        g2[k * units + u] += blame * pass.pooled[u];
        blamePooled[u] += blame * model.weights2[k * units + u];
      }
    }
    if (model.design === "conv") {
      const area = MAP * MAP;
      for (let f = 0; f < units; f += 1) {
        // Average pooling spreads the blame over every live cell; max pooling gives it all to
        // the cell that won.
        let winner = -1;
        if (model.pooling === "max") {
          let largest = 0;
          for (let at = 0; at < area; at += 1)
            if (pass.hidden[f * area + at] > largest) {
              largest = pass.hidden[f * area + at];
              winner = at;
            }
        }
        for (let at = 0; at < area; at += 1) {
          if (pass.hidden[f * area + at] <= 0) continue;
          if (model.pooling === "max" && at !== winner) continue;
          const share = model.pooling === "max" ? blamePooled[f] : blamePooled[f] / area;
          const y = Math.floor(at / MAP);
          const x = at % MAP;
          gb1[f] += share;
          for (let ky = 0; ky < KERNEL; ky += 1)
            for (let kx = 0; kx < KERNEL; kx += 1)
              g1[f * 9 + ky * KERNEL + kx] += share * picture.pixels[(y + ky) * SIZE + (x + kx)];
        }
      }
    } else {
      for (let h = 0; h < units; h += 1) {
        if (pass.pooled[h] <= 0) continue;
        gb1[h] += blamePooled[h];
        const row = h * SIZE * SIZE;
        for (let at = 0; at < SIZE * SIZE; at += 1)
          g1[row + at] += blamePooled[h] * picture.pixels[at];
      }
    }
  }
  const step = rate / batch.length;
  for (let at = 0; at < g1.length; at += 1) model.weights1[at] -= step * g1[at];
  for (let at = 0; at < gb1.length; at += 1) model.bias1[at] -= step * gb1[at];
  for (let at = 0; at < g2.length; at += 1) model.weights2[at] -= step * g2[at];
  for (let at = 0; at < gb2.length; at += 1) model.bias2[at] -= step * gb2[at];
  return loss / batch.length;
}

export function train(
  model: Model,
  pictures: readonly Picture[],
  steps: number,
  rate: number,
  batchSize: number,
  random: Random,
): void {
  for (let step = 0; step < steps; step += 1) {
    const batch = Array.from(
      { length: batchSize },
      () => pictures[Math.floor(random() * pictures.length)],
    );
    trainStep(model, batch, rate);
  }
}

export function predict(model: Model, pixels: ArrayLike<number>): Float32Array {
  const pass = newPass(model);
  forward(model, pixels, pass);
  return pass.odds;
}

export function accuracy(model: Model, pictures: readonly Picture[]): number {
  let right = 0;
  for (const picture of pictures) {
    const odds = predict(model, picture.pixels);
    let best = 0;
    for (let k = 1; k < odds.length; k += 1) if (odds[k] > odds[best]) best = k;
    if (best === picture.label) right += 1;
  }
  return right / pictures.length;
}

/** A learned filter's map on a picture, after ReLU: where in the picture it fired. */
export function featureMap(model: Model, filter: number, pixels: ArrayLike<number>): Float32Array {
  const map = new Float32Array(MAP * MAP);
  convolve(pixels, model.weights1.subarray(filter * 9, filter * 9 + 9), map);
  for (let at = 0; at < map.length; at += 1) map[at] = Math.max(0, map[at] + model.bias1[filter]);
  return map;
}
